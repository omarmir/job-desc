export interface JesEntry {
  c: string
  t: string
  src: string
  fmt: 'pdf' | 'md'
  eff: string | null
  plan: string | null
  def: string | null
  inc: string[]
  exc: string[]
  fac: string[]
  lvl: string[]
  sg: string[]
  tags: string[]
  alias: string[]
}

export interface JesIndex {
  v: number
  generated: string
  about: string
  legend: Record<string, string>
  search: {
    match_fields: string[]
    normalization: string[]
  }
  level_reference?: {
    src: string
    title: string
  } | null
  entries: JesEntry[]
}

export interface SearchDocument {
  code: string
  title: string
  text: string
  keywords: string[]
  tags: string[]
  levels: string[]
  plan: string | null
  source: string
}

export interface RankedMatch {
  code: string
  title: string
  score: number
  semanticScore: number
  lexicalScore: number
  why: string[]
  source: string
  plan: string | null
  levels: string[]
}

export interface DraftInput {
  jobTitle: string
  duties?: string
  selectedCode: string
  selectedTitle: string
  plan?: string | null
  levels?: string[]
  source?: string
  context?: string
}

export interface ProgressFileInfo {
  loaded: number
  total: number
}

export interface GenerationProgressState {
  stage: 'idle' | 'loading' | 'ready' | 'generating' | 'complete' | 'error'
  label: string
  percent: number
  loadedBytes: number
  totalBytes: number
  currentFile: string
  files: Record<string, ProgressFileInfo>
}

export interface BenchmarkCase {
  id: string
  target: string
  title: string
  duties?: string
  notes?: string
}

export interface ModelCandidate {
  id: string
  label: string
  sizeMB: number
  notes: string
}

export interface BenchmarkResult {
  id: string
  label: string
  sizeMB: number
  durationMs: number
  top1: number
  top3: number
  mrr: number
  selected: boolean
}

export interface GenerationModelCandidate {
  id: string
  label: string
  family: string
  params: string
  approxDownloadMB: number
  dtype: 'q4' | 'q4f16' | 'fp16' | 'fp32'
  browserSupport: 'webgpu' | 'either'
  benchmarkEligible: boolean
  recommendation: string
  rationale: string
  officialUrl: string
}

export interface GenerationBenchmarkCase {
  id: string
  code: string
  title: string
  duties: string
  context?: string
  expectedKeywords: string[]
}

export interface GenerationBenchmarkResult {
  id: string
  label: string
  family: string
  params: string
  dtype: string
  approxDownloadMB: number
  loadMs: number
  avgDurationMs: number
  p95DurationMs: number
  avgCharsPerSecond: number
  groundingScore: number
  coverageScore: number
  sectionCompleteness: number
  totalScore: number
  benchmarked: boolean
  benchmarkNotes?: string
  selected: boolean
}

export interface GenerationBenchmarkReport {
  generated: string
  corpusSize: number
  methodology: string[]
  selectedModel: string
  results: GenerationBenchmarkResult[]
}
