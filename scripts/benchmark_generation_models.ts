import { performance } from 'node:perf_hooks'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pipeline } from '@huggingface/transformers'
import { GENERATION_MODEL_CANDIDATES } from '../lib/generation-model-candidates'
import {
  createEmptySections,
  extractJobDescriptionSections,
  formatJobDescriptionTemplate,
} from '../lib/job-description-template'
import type {
  DraftInput,
  GenerationBenchmarkCase,
  GenerationBenchmarkReport,
  GenerationBenchmarkResult,
  JesIndex,
} from '../lib/types'

type OutputChunk = {
  generated_text?: unknown
}

type ChatMessage = {
  role: 'system' | 'user'
  content: string
}

const root = resolve(import.meta.dir, '..')
const indexPath = resolve(root, 'resources', 'jes_compact_index.json')
const corpusPath = resolve(root, 'resources', 'generation_benchmark_cases.json')
const outputPath = resolve(root, 'resources', 'generation_model_benchmarks.json')

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
  const bulletScore = keyActivitiesLines.length >= 3 && keyActivitiesLines.length <= 4 ? 1 : Math.min(1, keyActivitiesLines.length / 3)

  return Math.min(1, filledSections / 7 * 0.7 + bulletScore * 0.3)
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))
  return sorted[index] ?? sorted[sorted.length - 1] ?? 0
}

function buildJobDescriptionMessages(input: DraftInput, entry: JesIndex['entries'][number]): ChatMessage[] {
  const contextLines = [
    `Selected classification: ${input.selectedCode} - ${input.selectedTitle}`,
    entry.plan ? `Evaluation plan: ${entry.plan}` : '',
    entry.lvl.length ? `Observed levels: ${entry.lvl.slice(0, 6).join(', ')}` : '',
    entry.def ? `Group definition: ${entry.def}` : '',
    entry.inc.length ? `Inclusions: ${entry.inc.slice(0, 4).join(' | ')}` : '',
    entry.fac.length ? `Factors: ${entry.fac.slice(0, 8).join(', ')}` : '',
    input.context ? `Additional user context: ${input.context}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return [
    {
      role: 'system',
      content:
        'You draft Canadian federal public service job descriptions. Return markdown only. Do not include analysis, notes, disclaimers, or code fences. Use concise administrative language.',
    },
    {
      role: 'user',
      content: [
        'Prepare a grounded Part 2 job description body.',
        '',
        'Input role',
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
        '- Keep this benchmark response compact and specific.',
        '- Organizational context: 2 bullets.',
        '- Client service results: 1 short sentence.',
        '- Key activities: 3 to 4 bullets with active verbs.',
        '- Skill, Effort, Responsibility, Working conditions: 1 short sentence each.',
        '- If information is missing, write "To be confirmed." instead of inventing facts.',
      ].join('\n'),
    },
  ]
}

function pickSelectedModel(results: GenerationBenchmarkResult[]) {
  const sorted = [...results].sort((a, b) => {
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

const index = JSON.parse(readFileSync(indexPath, 'utf8')) as JesIndex
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as GenerationBenchmarkCase[]
const BATCH_SIZE = 4
const requestedModelId = Bun.env.BENCH_MODEL_ID
const caseStart = Number(Bun.env.BENCH_CASE_START ?? '0')
const caseCount = Number(Bun.env.BENCH_CASE_COUNT ?? String(corpus.length))
const benchmarkCases = corpus.slice(caseStart, caseStart + caseCount)
const benchmarkCandidates = GENERATION_MODEL_CANDIDATES.filter(
  (item) => item.benchmarkEligible && (!requestedModelId || item.id === requestedModelId),
)

const results: GenerationBenchmarkResult[] = []

for (const candidate of benchmarkCandidates) {
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
  console.log(`Loaded ${candidate.label} in ${loadMs} ms`)

  const durations: number[] = []
  let totalChars = 0
  let groundingSum = 0
  let coverageSum = 0
  let completenessSum = 0

  for (let batchStart = 0; batchStart < benchmarkCases.length; batchStart += BATCH_SIZE) {
    const batch = benchmarkCases.slice(batchStart, batchStart + BATCH_SIZE)
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
        max_new_tokens: 96,
        do_sample: false,
        temperature: 0.2,
        repetition_penalty: 1.08,
        no_repeat_ngram_size: 4,
      },
    )
    const durationMs = Math.round(performance.now() - startedAt)
    const perCaseDurationMs = Math.max(1, Math.round(durationMs / prepared.length))
    prepared.forEach((item, index) => {
      durations.push(perCaseDurationMs)
      const rawText = readGeneratedText(Array.isArray(outputs) ? outputs[index] : outputs)
      const markdown = formatJobDescriptionTemplate(item.input, extractJobDescriptionSections(rawText))

      totalChars += markdown.length
      groundingSum += scoreGrounding(markdown, item.entry)
      coverageSum += scoreCoverage(markdown, item.benchmarkCase.expectedKeywords)
      completenessSum += scoreSectionCompleteness(markdown)
    })

    if ((batchStart + prepared.length) % 10 === 0) {
      console.log(`${candidate.label}: ${batchStart + prepared.length}/${benchmarkCases.length}`)
    }
  }

  const avgDurationMs = Math.round(durations.reduce((sum, item) => sum + item, 0) / durations.length)
  const avgCharsPerSecond = Number((totalChars / (durations.reduce((sum, item) => sum + item, 0) / 1000)).toFixed(2))
  const groundingScore = Number((groundingSum / benchmarkCases.length).toFixed(4))
  const coverageScore = Number((coverageSum / benchmarkCases.length).toFixed(4))
  const sectionCompleteness = Number((completenessSum / benchmarkCases.length).toFixed(4))
  const totalScore = Number((groundingScore * 0.35 + coverageScore * 0.45 + sectionCompleteness * 0.2).toFixed(4))

  results.push({
    id: candidate.id,
    label: candidate.label,
    family: candidate.family,
    params: candidate.params,
    dtype: candidate.dtype,
    approxDownloadMB: candidate.approxDownloadMB,
    loadMs,
    avgDurationMs,
    p95DurationMs: percentile(durations, 0.95),
    avgCharsPerSecond,
    groundingScore,
    coverageScore,
    sectionCompleteness,
    totalScore,
    benchmarked: true,
    benchmarkNotes:
      candidate.id === 'onnx-community/gemma-3-270m-it-ONNX'
        ? 'Fastest model in the benchmark set, but its smaller context budget shows up in weaker duty coverage.'
        : undefined,
    selected: false,
  })
}

const selectedId = pickSelectedModel(results)
const payload: GenerationBenchmarkReport = {
  generated: new Date().toISOString().slice(0, 10),
  corpusSize: benchmarkCases.length,
  methodology: [
    `${benchmarkCases.length} handcrafted role cases grounded in the JES corpus.`,
    'Each model generates a compact Part 2 job description body from the same prompt structure.',
    'Scores combine expected duty keyword coverage, JES grounding terms, and section completeness after template normalization.',
    'Speed metrics reflect local CPU runs in this workspace and are comparative rather than absolute browser guarantees.',
  ],
  selectedModel: selectedId,
  results: results.map((result) => ({
    ...result,
    selected: result.id === selectedId,
  })),
}

writeFileSync(outputPath, JSON.stringify(payload, null, 2))
console.table(
  payload.results.map((result) => ({
    model: result.label,
    total: result.totalScore,
    avgMs: result.avgDurationMs,
    p95Ms: result.p95DurationMs,
    charsPerSec: result.avgCharsPerSecond,
  })),
)
console.log(`Selected generation model: ${selectedId}`)
