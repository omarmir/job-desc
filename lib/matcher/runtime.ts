import { buildLevelSearchDocuments, buildSearchDocuments, getJesIndex } from '~/lib/jes'
import { rankDocuments } from '~/lib/matcher/shared'
import type { InferenceProgressState, RankedMatch, SearchDocument } from '~/lib/types'

type TransformersModule = typeof import('@huggingface/transformers')
type FeatureExtractor = (
  texts: string[],
  options?: Record<string, unknown>,
) => Promise<{ tolist(): number[][] }>
type ProgressInfo = {
  status: string
  file?: string
  progress?: number
  loaded?: number
  total?: number
  files?: Record<string, { loaded: number; total: number }>
}
type ProgressCallback = (update: Partial<InferenceProgressState>) => void
type DocumentEmbeddings = { group: number[][]; level: number[][] }
type CachedDocumentEmbeddings = DocumentEmbeddings & {
  key: string
  createdAt: string
  modelId: string
  indexSignature: string
}

const documents = buildSearchDocuments()
const levelDocuments = buildLevelSearchDocuments()
const jesIndex = getJesIndex()
const EMBEDDING_CACHE_DB = 'job-desc-retrieval-cache'
const EMBEDDING_CACHE_STORE = 'document-embeddings'
const EMBEDDING_CACHE_SCHEMA = 1

let extractorPromise: Promise<FeatureExtractor> | null = null
let embeddingPromise: Promise<DocumentEmbeddings> | null = null
let transformersPromise: Promise<TransformersModule> | null = null

function hashText(text: string): string {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function createIndexSignature() {
  return [
    `v:${jesIndex.v}`,
    `generated:${jesIndex.generated}`,
    `groups:${documents.length}`,
    `levels:${levelDocuments.length}`,
    hashText([...documents, ...levelDocuments].map((document) => document.text).join('\n')),
  ].join('|')
}

function createEmbeddingCacheKey(modelId: string) {
  return `${EMBEDDING_CACHE_SCHEMA}|${modelId}|${createIndexSignature()}`
}

function canUseEmbeddingCache() {
  return typeof indexedDB !== 'undefined'
}

function openEmbeddingCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(EMBEDDING_CACHE_DB, EMBEDDING_CACHE_SCHEMA)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(EMBEDDING_CACHE_STORE)) {
        db.createObjectStore(EMBEDDING_CACHE_STORE, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open embedding cache'))
  })
}

async function readCachedEmbeddings(
  modelId: string,
  onProgress?: ProgressCallback,
): Promise<DocumentEmbeddings | null> {
  if (!canUseEmbeddingCache()) {
    return null
  }

  const key = createEmbeddingCacheKey(modelId)
  const indexSignature = createIndexSignature()

  try {
    const db = await openEmbeddingCache()
    const cached = await new Promise<CachedDocumentEmbeddings | undefined>((resolve, reject) => {
      const transaction = db.transaction(EMBEDDING_CACHE_STORE, 'readonly')
      const request = transaction.objectStore(EMBEDDING_CACHE_STORE).get(key)

      request.onsuccess = () => resolve(request.result as CachedDocumentEmbeddings | undefined)
      request.onerror = () => reject(request.error ?? new Error('Unable to read embedding cache'))
    })
    db.close()

    if (
      cached?.modelId === modelId &&
      cached.indexSignature === indexSignature &&
      cached.group.length === documents.length &&
      cached.level.length === levelDocuments.length
    ) {
      onProgress?.({
        stage: 'indexing',
        label: 'Loaded cached JES embeddings',
        percent: 100,
        currentFile: '',
      })
      return { group: cached.group, level: cached.level }
    }
  } catch {
    return null
  }

  return null
}

async function writeCachedEmbeddings(modelId: string, embeddings: DocumentEmbeddings): Promise<void> {
  if (!canUseEmbeddingCache()) {
    return
  }

  const cached: CachedDocumentEmbeddings = {
    ...embeddings,
    key: createEmbeddingCacheKey(modelId),
    createdAt: new Date().toISOString(),
    modelId,
    indexSignature: createIndexSignature(),
  }

  try {
    const db = await openEmbeddingCache()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(EMBEDDING_CACHE_STORE, 'readwrite')
      const request = transaction.objectStore(EMBEDDING_CACHE_STORE).put(cached)

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error('Unable to write embedding cache'))
    })
    db.close()
  } catch {
    // Cache failures should never block retrieval.
  }
}

async function createExtractor(
  modelId: string,
  allowRemoteModels: boolean,
  localModelPath: string,
  onProgress?: ProgressCallback,
) {
  if (!transformersPromise) {
    transformersPromise = import('@huggingface/transformers')
  }

  const { env, pipeline } = await transformersPromise

  env.allowRemoteModels = allowRemoteModels
  env.localModelPath = localModelPath

  return (await pipeline('feature-extraction', modelId, {
    device: 'wasm',
    progress_callback(info: ProgressInfo) {
      if (info.status === 'progress_total') {
        onProgress?.({
          stage: 'loading',
          label: 'Downloading retrieval model',
          percent: Math.round(info.progress ?? 0),
          loadedBytes: info.loaded ?? 0,
          totalBytes: info.total ?? 0,
          currentFile: info.file ?? '',
          files: info.files ?? {},
        })
      } else if (info.status === 'ready') {
        onProgress?.({
          stage: 'indexing',
          label: 'Embedding JES retrieval index',
          percent: 100,
        })
      } else if (info.status === 'download' || info.status === 'progress') {
        onProgress?.({
          stage: 'loading',
          label: 'Downloading retrieval model',
          currentFile: info.file ?? '',
        })
      }
    },
  })) as unknown as FeatureExtractor
}

async function toEmbeddings(extractor: FeatureExtractor, texts: string[]): Promise<number[][]> {
  const result = await extractor(texts, {
    pooling: 'mean',
    normalize: true,
  })

  return result.tolist() as number[][]
}

async function toEmbeddingsWithProgress(
  extractor: FeatureExtractor,
  texts: string[],
  onProgress?: ProgressCallback,
): Promise<number[][]> {
  const embeddings: number[][] = []
  const batchSize = 8

  for (let index = 0; index < texts.length; index += batchSize) {
    const batch = texts.slice(index, index + batchSize)
    embeddings.push(...(await toEmbeddings(extractor, batch)))

    onProgress?.({
      stage: 'indexing',
      label: 'Embedding JES retrieval index',
      percent: Math.round((embeddings.length / texts.length) * 100),
      currentFile: '',
    })
  }

  return embeddings
}

export async function ensureExtractor(
  modelId: string,
  allowRemoteModels: boolean,
  localModelPath: string,
  onProgress?: ProgressCallback,
) {
  if (!extractorPromise) {
    extractorPromise = createExtractor(modelId, allowRemoteModels, localModelPath, onProgress)
    extractorPromise.catch(() => {
      extractorPromise = null
    })
  }

  return extractorPromise
}

export async function ensureDocumentEmbeddings(
  modelId: string,
  allowRemoteModels: boolean,
  localModelPath: string,
  onProgress?: ProgressCallback,
) {
  if (!embeddingPromise) {
    embeddingPromise = ensureExtractor(modelId, allowRemoteModels, localModelPath, onProgress)
      .then(async (extractor) => {
        const cached = await readCachedEmbeddings(modelId, onProgress)
        if (cached) {
          return cached
        }

        onProgress?.({
          stage: 'indexing',
          label: 'Embedding JES group index',
          percent: 0,
          currentFile: '',
        })
        const group = await toEmbeddingsWithProgress(extractor, documents.map((document) => document.text), onProgress)
        onProgress?.({
          stage: 'indexing',
          label: 'Embedding JES level profiles',
          percent: 0,
          currentFile: '',
        })
        const level = await toEmbeddingsWithProgress(
          extractor,
          levelDocuments.map((document) => document.text),
          onProgress,
        )
        const embeddings = { group, level }
        await writeCachedEmbeddings(modelId, embeddings)
        return embeddings
      })
      .then((embeddings) => {
        onProgress?.({
          stage: 'ready',
          label: 'Retrieval model ready',
          percent: 100,
        })
        return embeddings
      })
    embeddingPromise.catch(() => {
      embeddingPromise = null
    })
  }

  return embeddingPromise
}

function levelThreshold(levelMatch?: RankedMatch): boolean {
  if (!levelMatch) {
    return false
  }

  return levelMatch.score >= 0.34 || levelMatch.lexicalScore >= 0.16
}

function combineGroupAndLevelMatches(groupMatches: RankedMatch[], levelMatches: RankedMatch[]): RankedMatch[] {
  return groupMatches.map((groupMatch) => {
    const levelMatch = levelMatches.find((match) => match.code === groupMatch.code)
    const hasLevel = levelThreshold(levelMatch)
    const selectedLevel = hasLevel && levelMatch ? levelMatch.selectedLevel : 'To be confirmed'

    return {
      ...groupMatch,
      selectedGroup: groupMatch.code,
      selectedLevel,
      fullClassification: hasLevel && levelMatch
        ? levelMatch.fullClassification
        : `${groupMatch.code} - ${groupMatch.title} (level to be confirmed)`,
      groupConfidence: groupMatch.score,
      levelConfidence: hasLevel && levelMatch ? levelMatch.score : 0,
      levelEvidence: hasLevel && levelMatch
        ? levelMatch.levelEvidence
        : 'The JES profile supports group allocation, but the provided role details do not support a defensible level estimate.',
      evidenceLabel: hasLevel && levelMatch ? levelMatch.evidenceLabel : 'JES group allocation',
    }
  })
}

function selectGroupCandidates(ranked: RankedMatch[]): RankedMatch[] {
  const top = ranked[0]
  if (!top) {
    return []
  }

  const topDocument = documents.find((document) => document.code === top.code)
  const nearMissCodes = new Set(topDocument?.nearMissGroups ?? [])
  const plausibleNearMisses = ranked.filter((match) => nearMissCodes.has(match.code))
  const strongLexicalMatches = ranked.filter((match) => match.lexicalScore >= 0.12)
  const selected = [top, ...plausibleNearMisses, ...strongLexicalMatches]
  const seen = new Set<string>()

  return selected
    .filter((match) => {
      if (seen.has(match.code)) {
        return false
      }
      seen.add(match.code)
      return true
    })
    .slice(0, 5)
}

export async function matchRoleRuntime(
  query: string,
  modelId: string,
  allowRemoteModels: boolean,
  localModelPath: string,
): Promise<{ matches: RankedMatch[]; documents: SearchDocument[] }> {
  const extractor = await ensureExtractor(modelId, allowRemoteModels, localModelPath)
  const [documentEmbeddings, [queryEmbedding]] = await Promise.all([
    ensureDocumentEmbeddings(modelId, allowRemoteModels, localModelPath),
    toEmbeddings(extractor, [query]),
  ])
  const rankedGroups = rankDocuments(query, documents, queryEmbedding ?? [], documentEmbeddings.group, documents.length)
  const groupMatches = selectGroupCandidates(rankedGroups)
  const topGroupCodes = new Set(groupMatches.slice(0, 3).map((match) => match.code))
  const candidateLevelDocuments = levelDocuments
    .map((document, index) => ({ document, embedding: documentEmbeddings.level[index] ?? [] }))
    .filter((item) => topGroupCodes.has(item.document.code))
  const levelMatches = rankDocuments(
    query,
    candidateLevelDocuments.map((item) => item.document),
    queryEmbedding ?? [],
    candidateLevelDocuments.map((item) => item.embedding),
    candidateLevelDocuments.length,
  )

  return {
    matches: combineGroupAndLevelMatches(groupMatches, levelMatches),
    documents,
  }
}
