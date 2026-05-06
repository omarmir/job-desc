import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type LevelProfile = {
  level: string
  label: string
  summary: string
  evidence: string[]
}

type Entry = {
  code: string
  title: string
  source: string
  groupDefinition: string
  inclusions: string[]
  exclusions: string[]
  routingTags: string[]
  levelProfiles: LevelProfile[]
}

const root = resolve(import.meta.dir, '..')
const indexPath = resolve(root, 'resources', 'jes_compact_index.json')
const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { entries: Entry[] }

const noisyPatterns = [
  /\|\s*Level\s*\|\s*Min\.\s*\|\s*Max\.\s*\|\s*Spread\s*\|/i,
  /\|\s*---\s*\|/,
  /\bTable\s+\d+\s+SUMMARY CLASSIFICATION LEVEL/i,
  /\b%PDF-/,
  /\bendstream\b/,
]

const priorityLevelGroups = ['PM', 'AS', 'EC', 'CR', 'CO', 'PE', 'PG', 'IT', 'EG', 'EN-ENG', 'GT', 'FB']
const errors: string[] = []

function numericDensity(text: string): number {
  const tokens = text.split(/\s+/).filter(Boolean)
  if (!tokens.length) {
    return 0
  }

  return tokens.filter((token) => /\d/.test(token)).length / tokens.length
}

for (const entry of index.entries) {
  const searchableText = [
    entry.groupDefinition,
    ...entry.inclusions,
    ...entry.exclusions,
    ...entry.routingTags,
    ...entry.levelProfiles.flatMap((profile) => [profile.summary, ...profile.evidence]),
  ].join(' ')

  if (!entry.code || !entry.title || !entry.source) {
    errors.push(`Missing required identity/source fields for ${entry.code || entry.title || 'unknown entry'}`)
  }

  if (!entry.routingTags?.length) {
    errors.push(`${entry.code} has empty routingTags`)
  }

  if (!entry.groupDefinition?.trim()) {
    errors.push(`${entry.code} has empty groupDefinition`)
  }

  if (numericDensity(searchableText) > 0.18) {
    errors.push(`${entry.code} has excessive numeric-token density`)
  }

  for (const pattern of noisyPatterns) {
    if (pattern.test(searchableText)) {
      errors.push(`${entry.code} contains noisy retrieval content matching ${pattern}`)
    }
  }

  for (const profile of entry.levelProfiles ?? []) {
    if (!profile.summary?.trim() || !profile.evidence?.length) {
      errors.push(`${entry.code} ${profile.label} has empty level evidence`)
    }
  }
}

for (const code of priorityLevelGroups) {
  const entry = index.entries.find((item) => item.code === code)
  if (!entry) {
    errors.push(`Missing priority group ${code}`)
  } else if (entry.levelProfiles.length < 3) {
    errors.push(`${code} needs multiple JES-derived level profiles`)
  }
}

if (index.entries.length !== 71) {
  errors.push(`Expected 71 JES entries, found ${index.entries.length}`)
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`Validated ${index.entries.length} JES index entries`)
