export interface BrowserInferenceCapabilities {
  secureContext: boolean
  hasNavigatorGpu: boolean
  webGpuSupported: boolean
  note: string | null
}

let capabilitiesPromise: Promise<BrowserInferenceCapabilities> | null = null

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function buildSecureContextNote() {
  if (!import.meta.client || typeof window === 'undefined') {
    return 'WebGPU is only available in a secure browser context.'
  }

  const hostname = window.location.hostname
  if (window.location.protocol === 'http:' && !isLocalHost(hostname)) {
    return 'This page is running over plain HTTP on a network address, so WebGPU is unavailable. Use localhost on this machine or serve the app over HTTPS.'
  }

  return 'This page is not in a secure browser context. Use localhost on this machine or serve the app over HTTPS.'
}

export async function detectBrowserInferenceCapabilities(): Promise<BrowserInferenceCapabilities> {
  if (!import.meta.client || typeof window === 'undefined') {
    return {
      secureContext: false,
      hasNavigatorGpu: false,
      webGpuSupported: false,
      note: 'Browser inference capabilities are only available on the client.',
    }
  }

  if (!capabilitiesPromise) {
    capabilitiesPromise = (async () => {
      const secureContext = window.isSecureContext
      const hasNavigatorGpu =
        typeof navigator !== 'undefined' && 'gpu' in navigator && !!navigator.gpu

      if (!secureContext) {
        return {
          secureContext,
          hasNavigatorGpu,
          webGpuSupported: false,
          note: buildSecureContextNote(),
        }
      }

      if (!hasNavigatorGpu) {
        return {
          secureContext,
          hasNavigatorGpu,
          webGpuSupported: false,
          note: 'This browser session does not expose WebGPU. Use a current Chromium-based browser with WebGPU enabled.',
        }
      }

      try {
        const adapter = await (navigator as Navigator & {
          gpu: { requestAdapter(): Promise<unknown> }
        }).gpu.requestAdapter()
        if (!adapter) {
          return {
            secureContext,
            hasNavigatorGpu,
            webGpuSupported: false,
            note: 'No WebGPU adapter was available in this browser session.',
          }
        }

        return {
          secureContext,
          hasNavigatorGpu,
          webGpuSupported: true,
          note: null,
        }
      } catch {
        return {
          secureContext,
          hasNavigatorGpu,
          webGpuSupported: false,
          note: 'The browser could not initialize a WebGPU adapter.',
        }
      }
    })()
  }

  return capabilitiesPromise
}

export function buildWebGpuRequiredMessage(capabilities: BrowserInferenceCapabilities) {
  const prefix = 'The selected generation model requires WebGPU in the browser.'
  return capabilities.note ? `${prefix} ${capabilities.note}` : prefix
}
