import type { GenerationModelCandidate } from '~/lib/types'

export const GENERATION_MODEL_CANDIDATES: GenerationModelCandidate[] = [
  {
    id: 'onnx-community/gemma-3-270m-it-ONNX',
    label: 'Gemma 3 270M Edge',
    family: 'Gemma',
    params: '270M',
    approxDownloadMB: 280,
    dtype: 'q4f16',
    browserSupport: 'webgpu',
    benchmarkEligible: true,
    recommendation: 'Fastest edge option',
    rationale:
      'Very small Gemma instruct model with good browser viability. Best when download size and first-run speed matter more than drafting depth.',
    officialUrl: 'https://huggingface.co/onnx-community/gemma-3-270m-it-ONNX',
  },
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    label: 'Qwen2.5 0.5B Instruct',
    family: 'Qwen',
    params: '0.5B',
    approxDownloadMB: 756,
    dtype: 'q4',
    browserSupport: 'webgpu',
    benchmarkEligible: true,
    recommendation: 'Balanced small model',
    rationale:
      'Small Qwen instruct model that stayed coherent in local smoke tests while remaining much lighter than the 1.5B tier.',
    officialUrl: 'https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct',
  },
  {
    id: 'onnx-community/gemma-3-1b-it-ONNX',
    label: 'Gemma 3 1B Instruct',
    family: 'Gemma',
    params: '1B',
    approxDownloadMB: 748,
    dtype: 'q4f16',
    browserSupport: 'webgpu',
    benchmarkEligible: true,
    recommendation: 'Strong mid-tier Gemma',
    rationale:
      'Noticeably stronger than the edge-sized Gemma variant while still staying within a browser-first footprint that is materially smaller than large web models.',
    officialUrl: 'https://huggingface.co/onnx-community/gemma-3-1b-it-ONNX',
  },
  {
    id: 'onnx-community/Qwen2.5-1.5B-Instruct',
    label: 'Qwen2.5 1.5B Instruct',
    family: 'Qwen',
    params: '1.5B',
    approxDownloadMB: 1712,
    dtype: 'q4',
    browserSupport: 'webgpu',
    benchmarkEligible: true,
    recommendation: 'Best quality default',
    rationale:
      'The heaviest model in the practical browser set here. It is slower to load, but it is the strongest candidate for grounded draft generation in a static app.',
    officialUrl: 'https://huggingface.co/onnx-community/Qwen2.5-1.5B-Instruct',
  },
  {
    id: 'onnx-community/gemma-3n-E2B-it-ONNX',
    label: 'Gemma 3n E2B Edge',
    family: 'Gemma',
    params: 'E2B',
    approxDownloadMB: 3106,
    dtype: 'q4',
    browserSupport: 'webgpu',
    benchmarkEligible: true,
    recommendation: 'Text-only q4 candidate',
    rationale:
      'Large Gemma 3n edge model that now works in this app through the text-only Transformers.js path using q4 weights. The q4f16 variant failed its smoke test and should not be used here.',
    officialUrl: 'https://huggingface.co/onnx-community/gemma-3n-E2B-it-ONNX',
  },
] as const

export const DEFAULT_GENERATION_MODEL_ID = 'onnx-community/gemma-3-270m-it-ONNX'
