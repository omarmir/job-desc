import { DEFAULT_GENERATION_MODEL_ID } from '~/lib/generation-model-candidates'
import { generateJobDescriptionDraft, preloadJobDescriptionGenerator } from '~/lib/generator/browser'
import { createEmptySections, type JobDescriptionSections } from '~/lib/job-description-template'
import type { DraftInput, GenerationProgressState } from '~/lib/types'

function createProgressState(): GenerationProgressState {
  return {
    stage: 'idle',
    label: 'Idle',
    percent: 0,
    loadedBytes: 0,
    totalBytes: 0,
    currentFile: '',
    files: {},
  }
}

export function useJobDescriptionGenerator() {
  const runtimeConfig = useRuntimeConfig()
  const selectedModel = useState<string>('generation-model', (): string => {
    return (runtimeConfig.public.generationModel as string) || DEFAULT_GENERATION_MODEL_ID
  })

  const state = reactive({
    loading: false,
    ready: false,
    error: '' as string | null,
    html: '',
    rawText: '',
    streamText: '',
    sections: createEmptySections() as JobDescriptionSections,
    lastDurationMs: 0,
    progress: createProgressState(),
  })

  function setSelectedModel(modelId: string) {
    selectedModel.value = modelId
    state.ready = false
  }

  async function preloadModel() {
    state.error = null
    state.progress = createProgressState()
    state.progress.stage = 'loading'
    state.progress.label = 'Starting generation model'

    try {
      await preloadJobDescriptionGenerator(
        selectedModel.value,
        runtimeConfig.public.allowRemoteModels,
        runtimeConfig.public.localModelPath,
        state.progress,
      )
      state.ready = true
    } catch (error) {
      state.ready = false
      state.progress.stage = 'error'
      state.progress.label = 'Generation model failed'
      state.error = error instanceof Error ? error.message : 'Unknown generation error'
    }
  }

  async function generateDraft(input: DraftInput) {
    state.loading = true
    state.error = null
    state.streamText = ''
    state.html = ''
    state.sections = createEmptySections()
    state.progress = createProgressState()

    const startedAt = performance.now()

    try {
      const result = await generateJobDescriptionDraft(
        input,
        selectedModel.value,
        runtimeConfig.public.allowRemoteModels,
        runtimeConfig.public.localModelPath,
        state.progress,
        (text) => {
          state.streamText = text
        },
        (key, text) => {
          state.sections[key] = text
        },
      )
      state.html = result.html
      state.rawText = result.rawText
      state.lastDurationMs = Math.round(performance.now() - startedAt)
      state.ready = true
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Unknown generation error'
      state.html = ''
      state.rawText = ''
    } finally {
      state.loading = false
    }
  }

  return {
    selectedModel,
    state: readonly(state),
    setSelectedModel,
    preloadModel,
    generateDraft,
  }
}
