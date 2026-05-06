import { buildJobDescriptionRewriteMessages, buildJobDescriptionSectionMessages } from '~/lib/job-description-prompt'
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

function capitalizeSentence(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`.replace(/\s+/g, ' ')
}

function finishSentence(value: string): string {
  const trimmed = capitalizeSentence(value)
  if (!trimmed) {
    return ''
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function splitGroundedSentences(value?: string): string[] {
  return (value || '')
    .replace(/\r/g, '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function stripSubjectPrefix(value: string): string {
  return value
    .replace(/^(the\s+)?(position|role|incumbent|employee|job)\s+(is responsible for|will|would|supports?|provides?|conducts?|prepares?|reviews?|analyzes?|analyses?|coordinates?)\s+/i, '$3 ')
    .replace(/^(duties include|responsibilities include|work includes)\s+/i, '')
    .trim()
}

function splitActivityFragments(value?: string): string[] {
  return splitGroundedSentences(value)
    .flatMap((sentence) => sentence.split(/;|\s*,\s+and\s+|\s*,\s+(?=(?:prepares?|reviews?|analyzes?|analyses?|coordinates?|drafts?|develops?|assesses?|evaluates?|maintains?|supports?|provides?|conducts?|advises?|monitors?|reports?)\b)|\s+and\s+(?=(?:prepares?|reviews?|analyzes?|analyses?|coordinates?|drafts?|develops?|assesses?|evaluates?|maintains?|supports?|provides?|conducts?|advises?|monitors?|reports?)\b)/i))
    .map(stripSubjectPrefix)
    .map((item) => item.replace(/^[,.\s]+|[,.\s]+$/g, ''))
    .filter((item) => item.length > 3)
}

function uniqueItems(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = value.toLowerCase()
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function toInfinitiveActivity(value: string): string {
  return value
    .replace(/^reviews\b/i, 'review')
    .replace(/^prepares\b/i, 'prepare')
    .replace(/^analyzes\b/i, 'analyze')
    .replace(/^analyses\b/i, 'analyse')
    .replace(/^coordinates\b/i, 'coordinate')
    .replace(/^drafts\b/i, 'draft')
    .replace(/^develops\b/i, 'develop')
    .replace(/^assesses\b/i, 'assess')
    .replace(/^evaluates\b/i, 'evaluate')
    .replace(/^maintains\b/i, 'maintain')
    .replace(/^supports\b/i, 'support')
    .replace(/^provides\b/i, 'provide')
    .replace(/^conducts\b/i, 'conduct')
    .replace(/^advises\b/i, 'advise')
    .replace(/^monitors\b/i, 'monitor')
    .replace(/^reports\b/i, 'report')
}

function formatActivityList(activities: string[]): string {
  if (!activities.length) {
    return ''
  }

  if (activities.length === 1) {
    return activities[0]!
  }

  if (activities.length === 2) {
    return `${activities[0]} and ${activities[1]}`
  }

  return `${activities.slice(0, -1).join(', ')}, and ${activities.at(-1)}`
}

function buildDeterministicSection(input: DraftInput, sectionKey: DraftSectionKey): string | null {
  const activities = uniqueItems(splitActivityFragments(input.duties)).slice(0, 8)
  const activityPhrases = activities.map((activity) => toInfinitiveActivity(activity).replace(/[.!?]$/g, '').toLowerCase())
  const activityPhrase = formatActivityList(activityPhrases)
  const classification = input.fullClassification || `${input.selectedCode} - ${input.selectedTitle}`

  if (sectionKey === 'organizational_context') {
    const contextBullets = splitGroundedSentences(input.context)
      .slice(0, 3)
      .map((sentence) => `- ${finishSentence(sentence)}`)

    return contextBullets.length ? contextBullets.join('\n') : '- To be confirmed.'
  }

  if (sectionKey === 'client_service_results') {
    const resultSentence = splitGroundedSentences(`${input.context || ''} ${input.duties || ''}`)
      .find((sentence) => /\b(client|service|public|internal|manager|director|branch|stakeholder|supports?|provides?|produces?|delivers?|prepares?)\b/i.test(sentence))

    if (!resultSentence || !input.context?.trim()) {
      return 'To be confirmed.'
    }

    return finishSentence(resultSentence)
  }

  if (sectionKey === 'key_activities') {
    if (!activities.length) {
      return '- To be confirmed.'
    }

    return activities.map((activity) => `- ${finishSentence(activity)}`).join('\n')
  }

  if (sectionKey === 'skill') {
    return activityPhrase
      ? `The work requires applying knowledge relevant to ${input.selectedTitle} to ${activityPhrase}. Specific policy, system, communication, analytical, and judgment requirements are to be confirmed.`
      : `Specific knowledge, communication, analytical, and judgment requirements for ${input.selectedTitle} work are to be confirmed.`
  }

  if (sectionKey === 'effort') {
    return activityPhrase
      ? `The work requires concentration when carrying out the stated duties, including the need to ${activityPhrase}. Frequency, deadline pressure, interruptions, and any physical effort requirements are to be confirmed.`
      : 'Mental effort, concentration requirements, deadlines, and physical effort requirements are to be confirmed.'
  }

  if (sectionKey === 'responsibility') {
    return activityPhrase
      ? `The position is accountable for completing the stated ${classification} duties, including the need to ${activityPhrase}. Decision latitude, resource accountability, supervisory responsibility, and impact are to be confirmed.`
      : `Responsible for work within ${classification}. Decision latitude, resource accountability, supervisory responsibility, and impact are to be confirmed.`
  }

  if (sectionKey === 'working_conditions') {
    return 'Working conditions, work location, travel, schedule, stakeholder pressure, and exposure conditions are to be confirmed.'
  }

  return null
}

const HALLUCINATION_PATTERNS = [
  /\bassigned to\b/i,
  /\bstatus:\b/i,
  /\bdate:\b/i,
  /\boctober|november|december|january|february|march|april|may|june|july|august|september\b/i,
  /\bottawa|toronto|vancouver|montreal\b/i,
  /\bmarketing|sales|finance\b/i,
  /\bsponsor|sponsors|sponsorship\b/i,
  /\bcensus bureau|statistical office\b/i,
  /\bpython|sas|r studio|scipy|ms project|synergy\b/i,
  /\bdepartment of\b/i,
  /\bbranch of\b/i,
  /\bteam of\b/i,
  /\bprogram name\b/i,
  /\bas an ai\b/i,
]

const GENERIC_REWRITE_TOKENS = new Set([
  'ability',
  'accountability',
  'accountable',
  'additional',
  'administrative',
  'analysis',
  'analytical',
  'applying',
  'appropriate',
  'briefing',
  'carrying',
  'classification',
  'communication',
  'complete',
  'completed',
  'completing',
  'concentration',
  'conditions',
  'confirmed',
  'context',
  'coordinate',
  'decision',
  'delivers',
  'draft',
  'duties',
  'effort',
  'frequency',
  'impact',
  'including',
  'interruptions',
  'judgment',
  'knowledge',
  'latitude',
  'mental',
  'physical',
  'policy',
  'position',
  'prepare',
  'requires',
  'requirements',
  'resource',
  'responsibility',
  'review',
  'service',
  'specific',
  'stated',
  'supervisory',
  'system',
  'travel',
  'working',
  'work',
])

function contentTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/^(the|and|for|with|from|that|this|when|into|only|are|is|to|of|in|on|by|or|as)$/i, ''))
    .filter((token) => token.length > 3)
}

function isMostlyGrounded(candidate: string, source: string, input: DraftInput): boolean {
  const normalized = candidate.trim()
  if (!normalized || normalized.length > Math.max(260, source.length * 1.8)) {
    return false
  }

  if (
    /^#{1,6}\s|```|\|/.test(normalized) ||
    /^(skill|effort|responsibility|working conditions|organizational context|client service results|key activities)\s*:/i.test(normalized) ||
    /\binput facts\b/i.test(normalized) ||
    HALLUCINATION_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    return false
  }

  if (/to be confirmed/i.test(source) && !/to be confirmed/i.test(normalized)) {
    return false
  }

  const allowedText = [
    source,
    input.jobTitle,
    input.duties,
    input.context,
    input.selectedCode,
    input.selectedTitle,
    input.fullClassification,
    input.levelEvidence,
  ].filter(Boolean).join(' ')
  const allowed = new Set([...contentTokens(allowedText), ...GENERIC_REWRITE_TOKENS])
  const tokens = contentTokens(normalized)
  const unsupported = tokens.filter((token) => !allowed.has(token))

  return unsupported.length <= Math.max(3, Math.floor(tokens.length * 0.12))
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
  let generator: TextGenerator | null = null
  let TextStreamer: TransformersModule['TextStreamer'] | null = null
  const sections: JobDescriptionSections = createEmptySections()
  const rawParts: string[] = []

  applyProgress(progress, {
    stage: 'generating',
    label: 'Generating draft sections',
    percent: 0,
  })

  for (const [index, sectionKey] of JD_SECTION_KEYS.entries()) {
    const label = JD_SECTION_LABELS[sectionKey]
    const deterministicText = buildDeterministicSection(input, sectionKey)

    if (deterministicText !== null) {
      applyProgress(progress, {
        stage: 'generating',
        label: `Grounding ${label}`,
        percent: Math.round((index / JD_SECTION_KEYS.length) * 100),
      })

      let sectionText = deterministicText
      if (!/^[-\s.]*to be confirmed\.?$/i.test(deterministicText.trim())) {
        applyProgress(progress, {
          stage: 'generating',
          label: `Rewriting ${label}`,
          percent: Math.round((index / JD_SECTION_KEYS.length) * 100),
        })
        generator ??= await ensureGenerator(modelId, allowRemoteModels, localModelPath, progress)
        const output = await generator(buildJobDescriptionRewriteMessages(input, sectionKey, deterministicText), {
          max_new_tokens: sectionKey === 'key_activities' ? 180 : 120,
          temperature: 0.05,
          do_sample: false,
          repetition_penalty: 1.08,
          no_repeat_ngram_size: 4,
        })
        const rewritten = readGeneratedText(output)
        if (isMostlyGrounded(rewritten, deterministicText, input)) {
          sectionText = rewritten.trim()
        }
      }

      sections[sectionKey] = sectionText
      rawParts.push(`${label}\n${sectionText}`)
      onSection?.(sectionKey, sectionText)
      onStream?.(rawParts.join('\n\n'))
      continue
    }

    const messages = buildJobDescriptionSectionMessages(input, sectionKey)
    let streamedText = ''
    generator ??= await ensureGenerator(modelId, allowRemoteModels, localModelPath, progress)
    TextStreamer ??= (await ensureTransformers()).TextStreamer

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
