/// <reference lib="webworker" />

import { ensureDocumentEmbeddings, matchRoleRuntime } from './runtime'
import type { InferenceProgressState } from '../types'

type MatchRequestMessage = {
  type: 'match'
  requestId: string
  payload: {
    query: string
    modelId: string
    allowRemoteModels: boolean
    localModelPath: string
  }
}

type PreloadRequestMessage = {
  type: 'preload'
  requestId: string
  payload: {
    modelId: string
    allowRemoteModels: boolean
    localModelPath: string
  }
}

type RequestMessage = MatchRequestMessage | PreloadRequestMessage

self.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const message = event.data
  if (message?.type !== 'match' && message?.type !== 'preload') {
    return
  }

  try {
    if (message.type === 'preload') {
      await ensureDocumentEmbeddings(
        message.payload.modelId,
        message.payload.allowRemoteModels,
        message.payload.localModelPath,
        (progress: Partial<InferenceProgressState>) => {
          self.postMessage({
            type: 'progress',
            requestId: message.requestId,
            payload: progress,
          })
        },
      )

      self.postMessage({
        type: 'ready',
        requestId: message.requestId,
      })
      return
    }

    const result = await matchRoleRuntime(
      message.payload.query,
      message.payload.modelId,
      message.payload.allowRemoteModels,
      message.payload.localModelPath,
    )

    self.postMessage({
      type: 'result',
      requestId: message.requestId,
      payload: result,
    })
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId: message.requestId,
      message: error instanceof Error ? error.message : 'Unknown inference error',
    })
  }
}

export default {} as never
