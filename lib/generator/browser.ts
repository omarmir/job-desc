import { buildJobDescriptionSectionMessages } from '~/lib/job-description-prompt'
import {
  createEmptySections,
  formatJobDescriptionHtml,
  JD_SECTION_KEYS,
  JD_SECTION_LABELS,
  type JobDescriptionSections,
} from '~/lib/job-description-template'
import {
  buildWebGpuRequiredMessage,
  detectBrowserInferenceCapabilities,
} from '~/lib/browser-capabilities'
import { GENERATION_MODEL_CANDIDATES } from '~/lib/generation-model-candidates'
import type { DraftInput, DraftSectionKey, GenerationProgressState } from '~/lib/types'

type TransformersModule = typeof import('@huggingface/transformers')
type TextGenerator = {
  tokenizer: unknown
  (messages: unknown, options?: Record<string, unknown>): Promise<unknown>
}
type ProgressInfo = {
  status: string
  file?: string
  progress?: number
  loaded?: number
  total?: number
  files?: Record<string, { loaded: number; total: number }>
}

let transformersPromise: Promise<TransformersModule> | null = null
const generatorCache = new Map<string, Promise<TextGenerator>>()

function supportsWebGpu(): boolean {
  return import.meta.client && typeof navigator !== 'undefined' && 'gpu' in navigator
}

function explainGenerationError(error: unknown, modelId: string, webGpuRequiredMessage: string) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()

  if (
    normalized.includes('gatherblockquantized') ||
    normalized.includes('cpuexecutionprovider') ||
    normalized.includes('error_code: 9') ||
    normalized.includes("can't create a session")
  ) {
    return `${webGpuRequiredMessage} The current browser session fell back to CPU/WASM, which cannot load this quantized model cleanly.`
  }

  if (normalized.includes('no available backend found')) {
    return `${webGpuRequiredMessage} No compatible browser backend was available for ${modelId}.`
  }

  return message
}

async function ensureTransformers() {
  if (!transformersPromise) {
    transformersPromise = import('@huggingface/transformers')
  }

  return transformersPromise
}

function resolveModelConfig(modelId: string) {
  return (
    GENERATION_MODEL_CANDIDATES.find((candidate) => candidate.id === modelId) ??
    GENERATION_MODEL_CANDIDATES[0]
  )!
}

function applyProgress(
  progress: GenerationProgressState,
  update: Partial<GenerationProgressState>,
) {
  Object.assign(progress, update)
}

async function ensureGenerator(
  modelId: string,
  allowRemoteModels: boolean,
  localModelPath: string,
  progress: GenerationProgressState,
) {
  if (!generatorCache.has(modelId)) {
    const modelConfig = resolveModelConfig(modelId)
    const generatorPromise = detectBrowserInferenceCapabilities()
      .then(async (capabilities) => {
        const webGpuRequiredMessage = buildWebGpuRequiredMessage(capabilities)
        if (modelConfig.browserSupport === 'webgpu' && !capabilities.webGpuSupported) {
          throw new Error(webGpuRequiredMessage)
        }

        const { env, pipeline } = await ensureTransformers()
        env.allowRemoteModels = allowRemoteModels
        env.localModelPath = localModelPath

        return (await pipeline('text-generation', modelId, {
          device:
            modelConfig.browserSupport === 'webgpu' || capabilities.webGpuSupported
              ? 'webgpu'
              : 'wasm',
          dtype: modelConfig.dtype,
          progress_callback(info: ProgressInfo) {
            if (info.status === 'progress_total') {
              applyProgress(progress, {
                stage: 'loading',
                label: 'Downloading model files',
                percent: Math.round(info.progress ?? 0),
                loadedBytes: info.loaded ?? 0,
                totalBytes: info.total ?? 0,
                currentFile: info.file ?? progress.currentFile,
                files: info.files ?? progress.files,
              })
            } else if (info.status === 'ready') {
              applyProgress(progress, {
                stage: 'ready',
                label: 'Model ready',
                percent: 100,
              })
            } else if (info.status === 'download' || info.status === 'progress') {
              applyProgress(progress, {
                stage: 'loading',
                label: 'Downloading model files',
                currentFile: info.file ?? progress.currentFile,
              })
            }
          },
        })) as unknown as TextGenerator
      })
      .catch(async (error) => {
        const capabilities = await detectBrowserInferenceCapabilities()
        const webGpuRequiredMessage = buildWebGpuRequiredMessage(capabilities)
        throw new Error(explainGenerationError(error, modelId, webGpuRequiredMessage))
      })

    generatorCache.set(modelId, generatorPromise)
    generatorPromise.catch(() => {
      generatorCache.delete(modelId)
    })
  } else {
    generatorCache.get(modelId)!.then(() => {
      applyProgress(progress, {
        stage: 'ready',
        label: 'Model ready',
        percent: 100,
      })
    })
  }

  return generatorCache.get(modelId)!
}

function readGeneratedText(output: unknown): string {
  const first = Array.isArray(output) ? output[0] : output
  if (!first || typeof first !== 'object') {
    return ''
  }

  const generated = (first as { generated_text?: unknown }).generated_text
  if (typeof generated === 'string') {
    return generated.trim()
  }

  if (Array.isArray(generated)) {
    const last = generated.at(-1)
    if (last && typeof last === 'object' && typeof (last as { content?: unknown }).content === 'string') {
      return ((last as { content: string }).content || '').trim()
    }
  }

  return ''
}

export async function generateJobDescriptionDraft(
  input: DraftInput,
  modelId: string,
  allowRemoteModels: boolean,
  localModelPath: string,
  progress: GenerationProgressState,
  onStream?: (text: string) => void,
  onSection?: (key: DraftSectionKey, text: string) => void,
) {
  const generator = await ensureGenerator(modelId, allowRemoteModels, localModelPath, progress)
  const { TextStreamer } = await ensureTransformers()
  const sections: JobDescriptionSections = createEmptySections()
  const rawParts: string[] = []

  applyProgress(progress, {
    stage: 'generating',
    label: 'Generating draft sections',
    percent: 0,
  })

  for (const [index, sectionKey] of JD_SECTION_KEYS.entries()) {
    const label = JD_SECTION_LABELS[sectionKey]
    const messages = buildJobDescriptionSectionMessages(input, sectionKey)
    let streamedText = ''

    applyProgress(progress, {
      stage: 'generating',
      label: `Generating ${label}`,
      percent: Math.round((index / JD_SECTION_KEYS.length) * 100),
    })

    const streamer = new TextStreamer(generator.tokenizer as never, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function(text: string) {
        streamedText += text
        const completedText = rawParts.length ? `${rawParts.join('\n\n')}\n\n` : ''
        onStream?.(`${completedText}${label}\n${streamedText}`)
      },
    })

    const output = await generator(messages, {
      max_new_tokens: sectionKey === 'key_activities' ? 360 : 220,
      temperature: 0.2,
      do_sample: false,
      repetition_penalty: 1.08,
      no_repeat_ngram_size: 4,
      streamer,
    })

    const text = (readGeneratedText(output) || streamedText).trim() || createEmptySections()[sectionKey]
    sections[sectionKey] = text
    rawParts.push(`${label}\n${text}`)
    onSection?.(sectionKey, text)
    onStream?.(rawParts.join('\n\n'))
  }

  applyProgress(progress, {
    stage: 'complete',
    label: 'Draft complete',
    percent: 100,
  })

  return {
    rawText: rawParts.join('\n\n'),
    html: formatJobDescriptionHtml(input, sections),
    sections,
  }
}

export async function preloadJobDescriptionGenerator(
  modelId: string,
  allowRemoteModels: boolean,
  localModelPath: string,
  progress: GenerationProgressState,
) {
  await ensureGenerator(modelId, allowRemoteModels, localModelPath, progress)
  applyProgress(progress, {
    stage: 'ready',
    label: 'Model ready',
    percent: 100,
  })
}
