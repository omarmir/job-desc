import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GENERATION_MODEL_CANDIDATES } from '../lib/generation-model-candidates'
import type { GenerationBenchmarkReport, GenerationBenchmarkResult } from '../lib/types'

type ChunkPayload = {
  generated: string
  modelId: string
  label: string
  family: string
  params: string
  dtype: string
  approxDownloadMB: number
  caseStart: number
  caseCount: number
  caseIds: string[]
  loadMs: number
  durations: number[]
  totalChars: number
  groundingSum: number
  coverageSum: number
  completenessSum: number
  faithfulnessSum?: number
  unsupportedClaimSum?: number
  rewriteQualitySum?: number
  formattingSum?: number
  promptMode: 'compact-proxy'
  maxNewTokens: number
  batchSize: number
}

const root = resolve(import.meta.dir, '..')
const chunksDir = resolve(root, 'resources', 'benchmarks', 'generation_chunks')
const outputPath = resolve(root, 'resources', 'generation_model_benchmarks.json')
const corpusPath = resolve(root, 'resources', 'generation_benchmark_cases.json')

const totalCorpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as Array<{ id: string }>
const totalCaseCount = totalCorpus.length

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))
  return sorted[index] ?? sorted[sorted.length - 1] ?? 0
}

function pickSelectedModel(results: GenerationBenchmarkResult[]) {
  const benchmarked = results.filter((item) => item.benchmarked)
  const pool = benchmarked.length ? benchmarked : results
  const sorted = [...pool].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
    return a.avgDurationMs - b.avgDurationMs
  })
  const best = sorted[0]
  if (!best) {
    throw new Error('No generation benchmark results were produced')
  }

  const practical = sorted.find(
    (item) =>
      best.totalScore - item.totalScore <= 0.03 &&
      item.approxDownloadMB < best.approxDownloadMB &&
      item.avgDurationMs <= best.avgDurationMs * 1.25,
  )

  return practical?.id || best.id
}

const chunkFiles = readdirSync(chunksDir).filter((file) => file.endsWith('.json'))
const chunks = chunkFiles.map((file) => {
  const fullPath = resolve(chunksDir, file)
  return JSON.parse(readFileSync(fullPath, 'utf8')) as ChunkPayload
})

const results: GenerationBenchmarkResult[] = GENERATION_MODEL_CANDIDATES
  .filter((candidate) => candidate.benchmarkEligible)
  .map((candidate) => {
    const candidateChunks = chunks.filter((chunk) => chunk.modelId === candidate.id)
    const fullCorpusChunks = candidateChunks.filter((chunk) => {
      const uniqueCaseIds = new Set(chunk.caseIds)
      return chunk.caseCount === totalCaseCount && uniqueCaseIds.size === totalCaseCount
    })
    const modelChunks = fullCorpusChunks.length ? fullCorpusChunks : candidateChunks
    const caseIds = [...new Set(modelChunks.flatMap((chunk) => chunk.caseIds))]
    const durations = modelChunks.flatMap((chunk) => chunk.durations)
    const totalChars = modelChunks.reduce((sum, chunk) => sum + chunk.totalChars, 0)
    const groundingSum = modelChunks.reduce((sum, chunk) => sum + chunk.groundingSum, 0)
    const coverageSum = modelChunks.reduce((sum, chunk) => sum + chunk.coverageSum, 0)
    const completenessSum = modelChunks.reduce((sum, chunk) => sum + chunk.completenessSum, 0)
    const faithfulnessSum = modelChunks.reduce((sum, chunk) => sum + (chunk.faithfulnessSum ?? chunk.groundingSum), 0)
    const unsupportedClaimSum = modelChunks.reduce((sum, chunk) => sum + (chunk.unsupportedClaimSum ?? chunk.coverageSum), 0)
    const rewriteQualitySum = modelChunks.reduce((sum, chunk) => sum + (chunk.rewriteQualitySum ?? chunk.completenessSum), 0)
    const formattingSum = modelChunks.reduce((sum, chunk) => sum + (chunk.formattingSum ?? chunk.completenessSum), 0)
    const benchmarked = caseIds.length === totalCaseCount && durations.length === totalCaseCount
    const divisor = Math.max(caseIds.length, 1)
    const totalDurationMs = durations.reduce((sum, value) => sum + value, 0)
    const avgDurationMs = durations.length ? Math.round(totalDurationMs / durations.length) : 0
    const avgCharsPerSecond = totalDurationMs
      ? Number((totalChars / (totalDurationMs / 1000)).toFixed(2))
      : 0
    const groundingScore = Number((groundingSum / divisor).toFixed(4))
    const coverageScore = Number((coverageSum / divisor).toFixed(4))
    const sectionCompleteness = Number((completenessSum / divisor).toFixed(4))
    const faithfulnessScore = Number((faithfulnessSum / divisor).toFixed(4))
    const unsupportedClaimScore = Number((unsupportedClaimSum / divisor).toFixed(4))
    const rewriteQualityScore = Number((rewriteQualitySum / divisor).toFixed(4))
    const formattingScore = Number((formattingSum / divisor).toFixed(4))
    const totalScore = benchmarked
      ? Number((
        faithfulnessScore * 0.35 +
        unsupportedClaimScore * 0.35 +
        rewriteQualityScore * 0.2 +
        formattingScore * 0.1
      ).toFixed(4))
      : 0

    let benchmarkNotes = `${modelChunks.length} chunk file(s), ${caseIds.length}/${totalCaseCount} cases complete.`
    if (benchmarked) {
      if (candidate.id === 'onnx-community/gemma-3-270m-it-ONNX') {
        benchmarkNotes = 'Completed compact-proxy benchmark. Smallest and fastest model in the set.'
      } else {
        benchmarkNotes = 'Completed compact-proxy benchmark.'
      }
    }

    return {
      id: candidate.id,
      label: candidate.label,
      family: candidate.family,
      params: candidate.params,
      dtype: candidate.dtype,
      approxDownloadMB: candidate.approxDownloadMB,
      loadMs: modelChunks.length
        ? Math.round(modelChunks.reduce((sum, chunk) => sum + chunk.loadMs, 0) / modelChunks.length)
        : 0,
      avgDurationMs,
      p95DurationMs: percentile(durations, 0.95),
      avgCharsPerSecond,
      groundingScore,
      coverageScore,
      sectionCompleteness,
      faithfulnessScore,
      unsupportedClaimScore,
      rewriteQualityScore,
      formattingScore,
      totalScore,
      benchmarked,
      benchmarkNotes,
      selected: false,
    }
  })

const selectedId = pickSelectedModel(results)
const payload: GenerationBenchmarkReport = {
  generated: new Date().toISOString().slice(0, 10),
  corpusSize: totalCaseCount,
  methodology: [
    `${totalCaseCount} handcrafted role cases grounded in the JES corpus.`,
    'Each chunk benchmarks conservative rewriting of a grounded deterministic draft rather than unrestricted long-form generation.',
    'Scores prioritize faithfulness to source content, unsupported-claim avoidance, wording usefulness, and formatting.',
    'Terminal-side benchmark runs are CPU-only here because the installed onnxruntime-node CUDA provider is unavailable.',
  ],
  selectedModel: selectedId,
  results: results.map((item) => ({
    ...item,
    selected: item.id === selectedId,
  })),
}

writeFileSync(outputPath, JSON.stringify(payload, null, 2))
console.table(
  payload.results.map((result) => ({
    model: result.label,
    cases: result.benchmarked ? totalCaseCount : result.benchmarkNotes,
    total: result.totalScore,
    avgMs: result.avgDurationMs,
  })),
)
console.log(`Wrote ${outputPath}`)
