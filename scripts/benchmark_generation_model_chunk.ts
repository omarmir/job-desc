import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pipeline } from '@huggingface/transformers'
import { GENERATION_MODEL_CANDIDATES } from '../lib/generation-model-candidates'
import {
  createEmptySections,
  extractJobDescriptionSections,
  formatJobDescriptionTemplate,
} from '../lib/job-description-template'
import type { DraftInput, GenerationBenchmarkCase, JesIndex } from '../lib/types'

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

function scoreCoverage(markdown: string, expectedKeywords: string[]) {
  const textTokens = new Set(tokenize(markdown))
  const matched = expectedKeywords.filter((keyword) => textTokens.has(stem(normalize(keyword))))
  return matched.length / expectedKeywords.length
}

function scoreGrounding(markdown: string, entry: JesIndex['entries'][number]) {
  const textTokens = new Set(tokenize(markdown))
  const groundingTerms = [
    ...entry.fac.slice(0, 3),
    ...entry.tags.slice(0, 6),
    ...entry.alias.slice(0, 2),
  ]
    .map((term) => stem(normalize(term)))
    .filter((term) => term.length > 3)

  const uniqueTerms = [...new Set(groundingTerms)]
  const hits = uniqueTerms.filter((term) => textTokens.has(term))
  return uniqueTerms.length ? Math.min(1, hits.length / Math.min(6, uniqueTerms.length)) : 0.5
}

function scoreSectionCompleteness(markdown: string) {
  const sections = extractJobDescriptionSections(markdown)
  const emptyDefaults = createEmptySections()
  let filledSections = 0

  for (const [key, value] of Object.entries(sections)) {
    if (value && value !== emptyDefaults[key as keyof typeof emptyDefaults]) {
      filledSections += 1
    }
  }

  const keyActivitiesLines = sections.key_activities
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
  const bulletScore = keyActivitiesLines.length >= 2 && keyActivitiesLines.length <= 3 ? 1 : Math.min(1, keyActivitiesLines.length / 2)

  return Math.min(1, filledSections / 7 * 0.75 + bulletScore * 0.25)
}

function buildJobDescriptionMessages(input: DraftInput, entry: JesIndex['entries'][number]): ChatMessage[] {
  const contextLines = [
    `Selected classification: ${input.selectedCode} - ${input.selectedTitle}`,
    entry.plan ? `Evaluation plan: ${entry.plan}` : '',
    entry.lvl.length ? `Observed levels: ${entry.lvl.slice(0, 4).join(', ')}` : '',
    entry.def ? `Group definition: ${entry.def}` : '',
    entry.fac.length ? `Factors: ${entry.fac.slice(0, 6).join(', ')}` : '',
    input.context ? `Additional user context: ${input.context}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return [
    {
      role: 'system',
      content:
        'You draft compact Canadian federal public service job description sections. Return markdown only. Use plain administrative language.',
    },
    {
      role: 'user',
      content: [
        'Prepare a compact, grounded Part 2 job description body for benchmarking.',
        '',
        `Job title: ${input.jobTitle}`,
        `Optional duties: ${input.duties || 'None provided'}`,
        '',
        'Classification context',
        contextLines,
        '',
        'Required headings',
        '- Organizational context',
        '- Client service results',
        '- Key activities',
        '- Skill',
        '- Effort',
        '- Responsibility',
        '- Working conditions',
        '',
        'Content rules',
        '- Organizational context: 1 or 2 bullets.',
        '- Client service results: 1 short sentence.',
        '- Key activities: 2 or 3 bullets.',
        '- Skill, Effort, Responsibility, Working conditions: 1 short sentence each.',
        '- Use "To be confirmed." if needed instead of inventing facts.',
      ].join('\n'),
    },
  ]
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

    return {
      benchmarkCase,
      entry,
      input,
      messages: buildJobDescriptionMessages(input, entry),
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
    const markdown = formatJobDescriptionTemplate(item.input, extractJobDescriptionSections(rawText))

    totalChars += markdown.length
    groundingSum += scoreGrounding(markdown, item.entry)
    coverageSum += scoreCoverage(markdown, item.benchmarkCase.expectedKeywords)
    completenessSum += scoreSectionCompleteness(markdown)
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
  promptMode: 'compact-proxy',
  maxNewTokens,
  batchSize,
}

writeFileSync(outputFile, JSON.stringify(payload, null, 2))
console.log(`Wrote ${outputFile}`)
