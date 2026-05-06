import { matchRoleRuntime } from '~/lib/matcher/runtime'
import type { RankedMatch, SearchDocument } from '~/lib/types'

type MatchWorkerResultMessage = {
  type: 'result'
  requestId: string
  payload: { matches: RankedMatch[]; documents: SearchDocument[] }
}

type MatchWorkerErrorMessage = {
  type: 'error'
  requestId: string
  message: string
}

type MatchWorkerMessage = MatchWorkerResultMessage | MatchWorkerErrorMessage

type PendingRequest = {
  resolve: (value: { matches: RankedMatch[]; documents: SearchDocument[] }) => void
  reject: (reason?: unknown) => void
}

let workerInstance: Worker | null = null
const pendingRequests = new Map<string, PendingRequest>()

function ensureWorker() {
  if (!import.meta.client || typeof Worker === 'undefined') {
    return null
  }

  if (!workerInstance) {
    workerInstance = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
      name: 'job-desc-matcher',
    })

    workerInstance.onmessage = (event: MessageEvent<MatchWorkerMessage>) => {
      const message = event.data
      const pending = pendingRequests.get(message.requestId)
      if (!pending) {
        return
      }

      pendingRequests.delete(message.requestId)
      if (message.type === 'result') {
        pending.resolve(message.payload)
      } else {
        pending.reject(new Error(message.message))
      }
    }

    workerInstance.onerror = (event) => {
      const error = event.error instanceof Error ? event.error : new Error(event.message)
      for (const pending of pendingRequests.values()) {
        pending.reject(error)
      }
      pendingRequests.clear()
      workerInstance?.terminate()
      workerInstance = null
    }
  }

  return workerInstance
}

export async function matchRole(
  query: string,
  modelId: string,
  allowRemoteModels: boolean,
  localModelPath: string,
): Promise<{ matches: RankedMatch[]; documents: SearchDocument[] }> {
  const worker = ensureWorker()
  if (!worker) {
    return matchRoleRuntime(query, modelId, allowRemoteModels, localModelPath)
  }

  return await new Promise((resolve, reject) => {
    const requestId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`

    pendingRequests.set(requestId, { resolve, reject })
    worker.postMessage({
      type: 'match',
      requestId,
      payload: {
        query,
        modelId,
        allowRemoteModels,
        localModelPath,
      },
    })
  })
}
