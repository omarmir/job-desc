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
    id: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    label: 'SmolLM2 360M Instruct',
    family: 'SmolLM2',
    params: '360M',
    approxDownloadMB: 372,
    dtype: 'q4',
    browserSupport: 'webgpu',
    benchmarkEligible: true,
    recommendation: 'Conservative rewrite candidate',
    rationale:
      'Small Hugging Face instruct model with browser ONNX q4 weights. Added to test whether it rewrites grounded section drafts more faithfully than similarly small alternatives.',
    officialUrl: 'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct',
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
] as const

export const DEFAULT_GENERATION_MODEL_ID = 'HuggingFaceTB/SmolLM2-360M-Instruct'
