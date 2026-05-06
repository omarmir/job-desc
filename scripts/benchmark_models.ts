import { performance } from 'node:perf_hooks'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pipeline } from '@huggingface/transformers'
import { MODEL_CANDIDATES } from '../lib/model-candidates'
import type { BenchmarkCase, BenchmarkResult, JesIndex } from '../lib/types'

type SearchDocument = {
  code: string
  title: string
  text: string
  keywords: string[]
  tags: string[]
  levels: string[]
  plan: string | null
  source: string
}

const root = resolve(import.meta.dir, '..')
const indexPath = resolve(root, 'resources', 'jes_compact_index.json')
const corpusPath = resolve(root, 'resources', 'benchmark_corpus.json')
const outputPath = resolve(root, 'resources', 'model_benchmarks.json')

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(text: string): string[] {
  return normalize(text).split(' ').filter((token) => token.length > 2)
}

function stem(token: string): string {
  return token.replace(/(ations|ation|ments|ment|ities|ity|ings|ing|ers|er|ies|ied|ed|es|s)$/i, '')
}

function overlapRatio(queryTokens: string[], docTokens: string[]): number {
  const docSet = new Set(docTokens.map((token) => stem(token)))
  const hits = queryTokens.filter((token) => docSet.has(stem(token)))
  return queryTokens.length ? hits.length / queryTokens.length : 0
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i += 1) {
    const valueA = a[i] ?? 0
    const valueB = b[i] ?? 0
    dot += valueA * valueB
    normA += valueA * valueA
    normB += valueB * valueB
  }

  if (!normA || !normB) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function buildSearchDocuments(index: JesIndex): SearchDocument[] {
  return index.entries.map((entry) => {
    const text = [
      entry.t,
      entry.c,
      entry.alias.join(' '),
      entry.tags.join(' '),
      entry.def ?? '',
      entry.inc.join(' '),
      entry.sg.join(' '),
      entry.fac.join(' '),
    ]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    return {
      code: entry.c,
      title: entry.t,
      text,
      keywords: tokenize(text),
      tags: entry.tags,
      levels: entry.lvl,
      plan: entry.plan,
      source: entry.src,
    }
  })
}

function lexicalScore(query: string, doc: SearchDocument): number {
  const queryTokens = tokenize(query)
  const titleTokens = tokenize(`${doc.title} ${doc.code}`)
  const textTokens = doc.keywords
  const titleOverlap = overlapRatio(queryTokens, titleTokens)
  const bodyOverlap = overlapRatio(queryTokens, textTokens)
  const exactTagHits = doc.tags.filter((tag) => normalize(query).includes(tag.toLowerCase())).slice(0, 3)

  return Math.min(1, titleOverlap * 0.55 + bodyOverlap * 0.35 + exactTagHits.length * 0.05)
}

function rankDocuments(query: string, docs: SearchDocument[], queryEmbedding: number[], docEmbeddings: number[][]) {
  return docs
    .map((doc, index) => {
      const semanticScore = cosineSimilarity(queryEmbedding, docEmbeddings[index] ?? [])
      const lexical = lexicalScore(query, doc)
      return {
        code: doc.code,
        score: semanticScore * 0.74 + lexical * 0.26,
      }
    })
    .sort((a, b) => b.score - a.score)
}

async function embedTexts(modelId: string, texts: string[]): Promise<number[][]> {
  const extractor = await pipeline('feature-extraction', modelId, {
    device: 'cpu',
  })
  const result = await extractor(texts, { pooling: 'mean', normalize: true })
  return result.tolist() as number[][]
}

function pickSelectedModel(results: BenchmarkResult[]): string {
  const sorted = [...results].sort((a, b) => b.top1 - a.top1 || b.top3 - a.top3 || b.mrr - a.mrr)
  const best = sorted[0]
  if (!best) {
    throw new Error('No benchmark results were produced')
  }

  const practicalWinner = sorted.find(
    (candidate) =>
      best.top1 - candidate.top1 <= 0.01 &&
      best.top3 - candidate.top3 <= 0.02 &&
      candidate.sizeMB < best.sizeMB,
  )

  return practicalWinner?.id || best.id
}

const index = JSON.parse(readFileSync(indexPath, 'utf8')) as JesIndex
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as BenchmarkCase[]
const docs = buildSearchDocuments(index)

const results: BenchmarkResult[] = []

for (const candidate of MODEL_CANDIDATES) {
  const startedAt = performance.now()
  const docEmbeddings = await embedTexts(candidate.id, docs.map((doc) => doc.text))
  const queryEmbeddings = await embedTexts(
    candidate.id,
    corpus.map((item) => [item.title, item.duties].filter(Boolean).join('. ')),
  )

  let top1Hits = 0
  let top3Hits = 0
  let reciprocalRank = 0

  corpus.forEach((testCase, index) => {
    const ranking = rankDocuments(
      [testCase.title, testCase.duties].filter(Boolean).join('. '),
      docs,
      queryEmbeddings[index] ?? [],
      docEmbeddings,
    )

    const first = ranking[0]
    if (first?.code === testCase.target) {
      top1Hits += 1
    }

    const top3 = ranking.slice(0, 3).map((item) => item.code)
    if (top3.includes(testCase.target)) {
      top3Hits += 1
    }

    const rank = ranking.findIndex((item) => item.code === testCase.target)
    reciprocalRank += rank >= 0 ? 1 / (rank + 1) : 0
  })

  results.push({
    id: candidate.id,
    label: candidate.label,
    sizeMB: candidate.sizeMB,
    durationMs: Math.round(performance.now() - startedAt),
    top1: Number((top1Hits / corpus.length).toFixed(4)),
    top3: Number((top3Hits / corpus.length).toFixed(4)),
    mrr: Number((reciprocalRank / corpus.length).toFixed(4)),
    selected: false,
  })
}

const selectedId = pickSelectedModel(results)
const payload = {
  generated: new Date().toISOString().slice(0, 10),
  corpusSize: corpus.length,
  selectedModel: selectedId,
  results: results.map((item) => ({
    ...item,
    selected: item.id === selectedId,
  })),
}

writeFileSync(outputPath, JSON.stringify(payload, null, 2))
console.table(payload.results)
console.log(`Selected model: ${selectedId}`)
