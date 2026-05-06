/// <reference lib="webworker" />

import { matchRoleRuntime } from './runtime'

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

self.onmessage = async (event: MessageEvent<MatchRequestMessage>) => {
  const message = event.data
  if (message?.type !== 'match') {
    return
  }

  try {
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
