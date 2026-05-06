import type { RankedMatch, SearchDocument } from '~/lib/types'

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((token) => token.length > 2)
}

function stem(token: string): string {
  return token
    .replace(/(ations|ation|ments|ment|ities|ity|ings|ing|ers|er|ies|ied|ed|es|s)$/i, '')
    .trim()
}

function overlapRatio(queryTokens: string[], docTokens: string[]): number {
  const docSet = new Set(docTokens.map((token) => stem(token)))
  const hits = queryTokens.filter((token) => docSet.has(stem(token)))
  return queryTokens.length ? hits.length / queryTokens.length : 0
}

function tagTokenHits(queryTokens: string[], tags: string[]): string[] {
  const querySet = new Set(queryTokens.map((token) => stem(token)))

  return tags
    .filter((tag) => {
      const tagTokens = tokenize(tag).map((token) => stem(token))
      return tagTokens.some((token) => querySet.has(token))
    })
    .slice(0, 4)
}

export function cosineSimilarity(a: number[], b: number[]): number {
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

  if (!normA || !normB) {
    return 0
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function lexicalScore(query: string, doc: SearchDocument): { score: number; why: string[] } {
  const queryTokens = tokenize(query)
  const titleTokens = tokenize(`${doc.title} ${doc.code}`)
  const textTokens = doc.keywords

  const titleOverlap = overlapRatio(queryTokens, titleTokens)
  const bodyOverlap = overlapRatio(queryTokens, textTokens)
  const exactTagHits = doc.tags.filter((tag) => normalize(query).includes(tag.toLowerCase())).slice(0, 3)
  const partialTagHits = tagTokenHits(queryTokens, doc.tags)

  const why = []

  if (titleOverlap > 0) {
    why.push('title overlap')
  }

  if (bodyOverlap > 0.18) {
    why.push('duty overlap')
  }

  if (exactTagHits.length) {
    why.push(`matched tags: ${exactTagHits.join(', ')}`)
  } else if (partialTagHits.length) {
    why.push(`related tags: ${partialTagHits.join(', ')}`)
  }

  return {
    score: Math.min(
      1,
      titleOverlap * 0.62 + bodyOverlap * 0.28 + exactTagHits.length * 0.07 + partialTagHits.length * 0.025,
    ),
    why,
  }
}

export function rankDocuments(
  query: string,
  documents: SearchDocument[],
  queryEmbedding: number[],
  documentEmbeddings: number[][],
  limit = 5,
): RankedMatch[] {
  return documents
    .map((doc, index) => {
      const semanticScore = cosineSimilarity(queryEmbedding, documentEmbeddings[index] ?? [])
      const lexical = lexicalScore(query, doc)
      const score = semanticScore * 0.62 + lexical.score * 0.38

      return {
        code: doc.code,
        title: doc.title,
        selectedGroup: doc.code,
        selectedLevel: doc.level ?? 'To be confirmed',
        fullClassification: doc.levelLabel ? `${doc.levelLabel} - ${doc.title}` : `${doc.code} - ${doc.title}`,
        groupConfidence: score,
        levelConfidence: doc.kind === 'level' ? score : 0,
        levelEvidence: doc.evidence ?? 'Group allocation evidence only; level requires JES confirmation.',
        evidenceLabel: doc.kind === 'level' ? 'JES level profile' : 'JES group allocation',
        score,
        semanticScore,
        lexicalScore: lexical.score,
        why: lexical.why,
        source: doc.source,
        plan: doc.plan,
        levels: doc.levels,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
