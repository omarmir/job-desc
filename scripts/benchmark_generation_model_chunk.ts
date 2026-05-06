import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pipeline } from '@huggingface/transformers'
import { GENERATION_MODEL_CANDIDATES } from '../lib/generation-model-candidates'
import { buildJobDescriptionRewriteMessages } from '../lib/job-description-prompt'
import type { DraftInput, DraftSectionKey, GenerationBenchmarkCase, JesIndex } from '../lib/types'

type OutputChunk = {
  generated_text?: unknown
}

type ChatMessage = {
  role: 'system' | 'user'
  content: string
}

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
  faithfulnessSum: number
  unsupportedClaimSum: number
  rewriteQualitySum: number
  formattingSum: number
  promptMode: 'compact-proxy'
  maxNewTokens: number
  batchSize: number
}

const root = resolve(import.meta.dir, '..')
const indexPath = resolve(root, 'resources', 'jes_compact_index.json')
const corpusPath = resolve(root, 'resources', 'generation_benchmark_cases.json')
const chunksDir = resolve(root, 'resources', 'benchmarks', 'generation_chunks')

const modelId = Bun.env.BENCH_MODEL_ID
if (!modelId) {
  throw new Error('BENCH_MODEL_ID is required')
}

const caseStart = Number(Bun.env.BENCH_CASE_START ?? '0')
const caseCount = Number(Bun.env.BENCH_CASE_COUNT ?? '10')
const maxNewTokens = Number(Bun.env.BENCH_MAX_NEW_TOKENS ?? '56')
const batchSize = Number(Bun.env.BENCH_BATCH_SIZE ?? '2')

const candidate = GENERATION_MODEL_CANDIDATES.find((item) => item.id === modelId && item.benchmarkEligible)
if (!candidate) {
  throw new Error(`Unknown or ineligible model: ${modelId}`)
}

const index = JSON.parse(readFileSync(indexPath, 'utf8')) as JesIndex
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as GenerationBenchmarkCase[]
const benchmarkCases = corpus.slice(caseStart, caseStart + caseCount)

if (!benchmarkCases.length) {
  throw new Error(`No benchmark cases found for start=${caseStart} count=${caseCount}`)
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stem(token: string): string {
  return token.replace(/(ations|ation|ments|ment|ities|ity|ings|ing|ers|ies|ied|er|ed|es|s)$/i, '')
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .map(stem)
    .filter((token) => token.length > 2)
}

function readGeneratedText(output: unknown): string {
  const first = Array.isArray(output) ? (output[0] as OutputChunk | undefined) : (output as OutputChunk | undefined)
  if (!first) return ''

  if (typeof first.generated_text === 'string') {
    return first.generated_text.trim()
  }

  if (Array.isArray(first.generated_text)) {
    const last = first.generated_text.at(-1)
    if (last && typeof last === 'object' && typeof (last as { content?: unknown }).content === 'string') {
      return ((last as { content: string }).content || '').trim()
    }
  }

  return ''
}

const BENCH_SECTION: DraftSectionKey = 'skill'
const HALLUCINATION_PATTERN = /\b(assigned to|status:|date:|department of|census bureau|sponsor|python|sas|ms project|ottawa|marketing|sales|finance|input facts)\b/i

function buildGroundedDraft(input: DraftInput): string {
  const activities = (input.duties || 'To be confirmed.')
    .split(/;|\s*,\s+and\s+|\s+and\s+/)
    .map((item) => item.trim().replace(/[.!?]$/g, '').toLowerCase())
    .filter(Boolean)
    .slice(0, 4)
  const activityText = activities.length ? activities.join('; ') : 'To be confirmed'
  return `The work requires applying knowledge relevant to ${input.selectedTitle} to ${activityText}. Specific policy, system, communication, analytical, and judgment requirements are to be confirmed.`
}

function scoreRewrite(output: string, groundedDraft: string, input: DraftInput) {
  const allowed = new Set(tokenize([groundedDraft, input.jobTitle, input.duties, input.context, input.selectedTitle].filter(Boolean).join(' ')))
  const tokens = tokenize(output)
  const unsupported = tokens.filter((token) => !allowed.has(token) && token.length > 4)
  const unsupportedRatio = tokens.length ? unsupported.length / tokens.length : 1
  const unsupportedClaimScore = HALLUCINATION_PATTERN.test(output) ? 0 : Math.max(0, 1 - unsupportedRatio * 2)
  const sourceTerms = tokenize(groundedDraft)
  const keptTerms = sourceTerms.filter((token) => tokens.includes(token))
  const faithfulnessScore = sourceTerms.length ? Math.min(1, keptTerms.length / sourceTerms.length) : 0
  const formattingScore = /^#{1,6}\s|```|\||^\s*(skill|input facts)\s*:/i.test(output) ? 0 : 1
  const rewriteQualityScore = output.length < 40 || output.length > groundedDraft.length * 1.8 ? 0.2 : 0.7

  return {
    faithfulnessScore,
    unsupportedClaimScore,
    rewriteQualityScore,
    formattingScore,
  }
}

mkdirSync(chunksDir, { recursive: true })

const loadStartedAt = performance.now()
const generator = await pipeline('text-generation', candidate.id, {
  device: 'cpu',
  dtype: candidate.dtype,
  session_options: {
    intraOpNumThreads: 2,
    interOpNumThreads: 1,
  },
})
const loadMs = Math.round(performance.now() - loadStartedAt)

const durations: number[] = []
let totalChars = 0
let groundingSum = 0
let coverageSum = 0
let completenessSum = 0
let faithfulnessSum = 0
let unsupportedClaimSum = 0
let rewriteQualitySum = 0
let formattingSum = 0

for (let batchStart = 0; batchStart < benchmarkCases.length; batchStart += batchSize) {
  const batch = benchmarkCases.slice(batchStart, batchStart + batchSize)
  const prepared = batch.map((benchmarkCase) => {
    const entry = index.entries.find((item) => item.c === benchmarkCase.code)
    if (!entry) {
      throw new Error(`Missing JES entry for benchmark case ${benchmarkCase.id}`)
    }

    const input: DraftInput = {
      jobTitle: benchmarkCase.title,
      duties: benchmarkCase.duties,
      selectedCode: benchmarkCase.code,
      selectedTitle: entry.t,
      plan: entry.plan,
      levels: entry.lvl,
      source: entry.src,
      context: benchmarkCase.context,
    }
    const groundedDraft = buildGroundedDraft(input)

    return {
      benchmarkCase,
      entry,
      input,
      groundedDraft,
      messages: buildJobDescriptionRewriteMessages(input, BENCH_SECTION, groundedDraft) as ChatMessage[],
    }
  })

  const startedAt = performance.now()
  const outputs = await (generator as unknown as (messages: ChatMessage[][], options: Record<string, unknown>) => Promise<unknown>)(
    prepared.map((item) => item.messages),
    {
      max_new_tokens: maxNewTokens,
      do_sample: false,
      temperature: 0.2,
      repetition_penalty: 1.08,
      no_repeat_ngram_size: 4,
    },
  )
  const batchDurationMs = Math.round(performance.now() - startedAt)
  const perCaseDurationMs = Math.max(1, Math.round(batchDurationMs / prepared.length))

  prepared.forEach((item, index) => {
    durations.push(perCaseDurationMs)
    const rawText = readGeneratedText(Array.isArray(outputs) ? outputs[index] : outputs)
    const scores = scoreRewrite(rawText, item.groundedDraft, item.input)

    totalChars += rawText.length
    groundingSum += scores.faithfulnessScore
    coverageSum += scores.unsupportedClaimScore
    completenessSum += scores.rewriteQualityScore
    faithfulnessSum += scores.faithfulnessScore
    unsupportedClaimSum += scores.unsupportedClaimScore
    rewriteQualitySum += scores.rewriteQualityScore
    formattingSum += scores.formattingScore
  })

  console.log(`${candidate.label}: ${Math.min(batchStart + prepared.length, benchmarkCases.length)}/${benchmarkCases.length}`)
}

const safeModelId = candidate.id.replace(/[^\w.-]+/g, '_')
const fileName = `${safeModelId}.${caseStart}-${caseStart + benchmarkCases.length - 1}.json`
const outputFile = resolve(chunksDir, fileName)

const payload: ChunkPayload = {
  generated: new Date().toISOString(),
  modelId: candidate.id,
  label: candidate.label,
  family: candidate.family,
  params: candidate.params,
  dtype: candidate.dtype,
  approxDownloadMB: candidate.approxDownloadMB,
  caseStart,
  caseCount: benchmarkCases.length,
  caseIds: benchmarkCases.map((item) => item.id),
  loadMs,
  durations,
  totalChars,
  groundingSum: Number(groundingSum.toFixed(6)),
  coverageSum: Number(coverageSum.toFixed(6)),
  completenessSum: Number(completenessSum.toFixed(6)),
  faithfulnessSum: Number(faithfulnessSum.toFixed(6)),
  unsupportedClaimSum: Number(unsupportedClaimSum.toFixed(6)),
  rewriteQualitySum: Number(rewriteQualitySum.toFixed(6)),
  formattingSum: Number(formattingSum.toFixed(6)),
  promptMode: 'compact-proxy',
  maxNewTokens,
  batchSize,
}

writeFileSync(outputFile, JSON.stringify(payload, null, 2))
console.log(`Wrote ${outputFile}`)
