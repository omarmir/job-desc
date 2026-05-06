import { DEFAULT_GENERATION_MODEL_ID } from '~/lib/generation-model-candidates'
import { generateJobDescriptionDraft } from '~/lib/generator/browser'
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
    error: '' as string | null,
    markdown: '',
    rawText: '',
    streamText: '',
    lastDurationMs: 0,
    progress: createProgressState(),
  })

  function setSelectedModel(modelId: string) {
    selectedModel.value = modelId
  }

  async function generateDraft(input: DraftInput) {
    state.loading = true
    state.error = null
    state.streamText = ''
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
      )
      state.markdown = result.markdown
      state.rawText = result.rawText
      state.lastDurationMs = Math.round(performance.now() - startedAt)
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Unknown generation error'
      state.markdown = ''
      state.rawText = ''
    } finally {
      state.loading = false
    }
  }

  return {
    selectedModel,
    state: readonly(state),
    setSelectedModel,
    generateDraft,
  }
}
