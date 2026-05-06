import type { RankedMatch } from '~/lib/types'
import { matchRole } from '~/lib/matcher/browser'

export function useJobMatcher() {
  const runtimeConfig = useRuntimeConfig()

  const state = reactive({
    loading: false,
    ready: false,
    error: '' as string | null,
    query: '',
    matches: [] as RankedMatch[],
    lastDurationMs: 0,
  })

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
    analyzeRole,
  }
}
