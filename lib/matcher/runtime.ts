import { buildSearchDocuments } from '~/lib/jes'
import { rankDocuments } from '~/lib/matcher/shared'
import type { RankedMatch, SearchDocument } from '~/lib/types'

type TransformersModule = typeof import('@huggingface/transformers')
type FeatureExtractor = (
  texts: string[],
  options?: Record<string, unknown>,
) => Promise<{ tolist(): number[][] }>

const documents = buildSearchDocuments()

let extractorPromise: Promise<FeatureExtractor> | null = null
let embeddingPromise: Promise<number[][]> | null = null
let transformersPromise: Promise<TransformersModule> | null = null

function supportsWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

async function createExtractor(modelId: string, allowRemoteModels: boolean, localModelPath: string) {
  if (!transformersPromise) {
    transformersPromise = import('@huggingface/transformers')
  }

  const { env, pipeline } = await transformersPromise

  env.allowRemoteModels = allowRemoteModels
  env.localModelPath = localModelPath

  return (await pipeline('feature-extraction', modelId, {
    device: supportsWebGpu() ? 'webgpu' : 'wasm',
  })) as unknown as FeatureExtractor
}

async function toEmbeddings(extractor: FeatureExtractor, texts: string[]): Promise<number[][]> {
  const result = await extractor(texts, {
    pooling: 'mean',
    normalize: true,
  })

  return result.tolist() as number[][]
}

export async function ensureExtractor(
  modelId: string,
  allowRemoteModels: boolean,
  localModelPath: string,
) {
  if (!extractorPromise) {
    extractorPromise = createExtractor(modelId, allowRemoteModels, localModelPath)
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
) {
  if (!embeddingPromise) {
    embeddingPromise = ensureExtractor(modelId, allowRemoteModels, localModelPath).then((extractor) =>
      toEmbeddings(extractor, documents.map((document) => document.text)),
    )
    embeddingPromise.catch(() => {
      embeddingPromise = null
    })
  }

  return embeddingPromise
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

  return {
    matches: rankDocuments(query, documents, queryEmbedding ?? [], documentEmbeddings),
    documents,
  }
}
