import { ensureDocumentEmbeddings, matchRoleRuntime } from '~/lib/matcher/runtime'
import type { InferenceProgressState, RankedMatch, SearchDocument } from '~/lib/types'

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

type MatchWorkerProgressMessage = {
  type: 'progress'
  requestId: string
  payload: Partial<InferenceProgressState>
}

type MatchWorkerReadyMessage = {
  type: 'ready'
  requestId: string
}

type MatchWorkerMessage =
  | MatchWorkerResultMessage
  | MatchWorkerErrorMessage
  | MatchWorkerProgressMessage
  | MatchWorkerReadyMessage

type PendingRequest = {
  resolve: (value?: any) => void
  reject: (reason?: unknown) => void
  onProgress?: (progress: Partial<InferenceProgressState>) => void
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

      if (message.type === 'result') {
        pendingRequests.delete(message.requestId)
        pending.resolve(message.payload)
      } else if (message.type === 'ready') {
        pendingRequests.delete(message.requestId)
        pending.resolve()
      } else if (message.type === 'progress') {
        pending.onProgress?.(message.payload)
      } else {
        pendingRequests.delete(message.requestId)
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

function createRequestId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}

export async function preloadMatcherModel(
  modelId: string,
  allowRemoteModels: boolean,
  localModelPath: string,
  onProgress?: (progress: Partial<InferenceProgressState>) => void,
): Promise<void> {
  const worker = ensureWorker()
  if (!worker) {
    await ensureDocumentEmbeddings(modelId, allowRemoteModels, localModelPath, onProgress)
    return
  }

  await new Promise<void>((resolve, reject) => {
    const requestId = createRequestId()
    pendingRequests.set(requestId, { resolve, reject, onProgress })
    worker.postMessage({
      type: 'preload',
      requestId,
      payload: {
        modelId,
        allowRemoteModels,
        localModelPath,
      },
    })
  })
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
    const requestId = createRequestId()
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
