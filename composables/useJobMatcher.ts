import type { InferenceProgressState, RankedMatch } from '~/lib/types'
import { matchRole, preloadMatcherModel } from '~/lib/matcher/browser'

export function useJobMatcher() {
  const runtimeConfig = useRuntimeConfig()

  const state = reactive({
    loading: false,
    ready: false,
    error: '' as string | null,
    query: '',
    matches: [] as RankedMatch[],
    lastDurationMs: 0,
    progress: {
      stage: 'idle',
      label: 'Retrieval model pending',
      percent: 0,
      loadedBytes: 0,
      totalBytes: 0,
      currentFile: '',
      files: {},
    } as InferenceProgressState,
  })

  function applyProgress(update: Partial<InferenceProgressState>) {
    Object.assign(state.progress, update)
    state.ready = state.progress.stage === 'ready'
  }

  async function preloadModel() {
    if (state.progress.stage === 'ready' || state.progress.stage === 'loading' || state.progress.stage === 'indexing') {
      return
    }

    state.error = null
    applyProgress({
      stage: 'loading',
      label: 'Starting retrieval model',
      percent: 0,
    })

    try {
      await preloadMatcherModel(
        runtimeConfig.public.selectedModel,
        runtimeConfig.public.allowRemoteModels,
        runtimeConfig.public.localModelPath,
        applyProgress,
      )
      applyProgress({
        stage: 'ready',
        label: 'Retrieval model ready',
        percent: 100,
      })
    } catch (error) {
      applyProgress({
        stage: 'error',
        label: 'Retrieval model failed',
      })
      state.error = error instanceof Error ? error.message : 'Unknown inference error'
    }
  }

  async function analyzeRole(jobTitle: string, duties?: string) {
    const query = [jobTitle.trim(), duties?.trim()].filter(Boolean).join('. ')

    state.loading = true
    state.error = null
    state.query = query
    state.matches = []

    const startedAt = performance.now()

    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })

      const result = await matchRole(
        query,
        runtimeConfig.public.selectedModel,
        runtimeConfig.public.allowRemoteModels,
        runtimeConfig.public.localModelPath,
      )

      state.ready = true
      applyProgress({
        stage: 'ready',
        label: 'Retrieval model ready',
        percent: 100,
      })
      state.matches = result.matches
      state.lastDurationMs = Math.round(performance.now() - startedAt)
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Unknown inference error'
      state.matches = []
    } finally {
      state.loading = false
    }
  }

  return {
    state: readonly(state),
    preloadModel,
    analyzeRole,
  }
}
