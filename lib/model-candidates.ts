import type { ModelCandidate } from '~/lib/types'

export const MODEL_CANDIDATES: ModelCandidate[] = [
  {
    id: 'Xenova/all-MiniLM-L6-v2',
    label: 'all-MiniLM-L6-v2',
    sizeMB: 24.5,
    notes: 'Smallest practical embedding model for browser semantic search.',
  },
  {
    id: 'Xenova/bge-small-en-v1.5',
    label: 'bge-small-en-v1.5',
    sizeMB: 133,
    notes: 'Higher-capacity English embedding model with larger download cost.',
  },
  {
    id: 'mixedbread-ai/mxbai-embed-xsmall-v1',
    label: 'mxbai-embed-xsmall-v1',
    sizeMB: 91,
    notes: 'Retrieval-focused compact embedding model supported in Transformers.js.',
  },
]
