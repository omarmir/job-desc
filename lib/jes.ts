import jesIndex from '~/resources/jes_compact_index.json'
import type { JesEntry, JesIndex, JesLevelProfile, SearchDocument } from '~/lib/types'

const index = jesIndex as JesIndex

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildText(entry: JesEntry): string {
  return [
    entry.title ?? entry.t,
    entry.code ?? entry.c,
    (entry.aliases ?? entry.alias).join(' '),
    (entry.routingTags ?? entry.tags).join(' '),
    entry.groupDefinition ?? entry.def ?? '',
    (entry.inclusions ?? entry.inc).join(' '),
    (entry.nearMissGroups ?? []).join(' '),
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getJesIndex(): JesIndex {
  return index
}

export function getJesEntries(): JesEntry[] {
  return index.entries
}

export function buildSearchDocuments(): SearchDocument[] {
  return index.entries.map((entry) => ({
    code: entry.code ?? entry.c,
    title: entry.title ?? entry.t,
    text: buildText(entry),
    keywords: normalize(
      [
        entry.title ?? entry.t,
        entry.code ?? entry.c,
        (entry.aliases ?? entry.alias).join(' '),
        (entry.routingTags ?? entry.tags).join(' '),
        entry.groupDefinition ?? entry.def ?? '',
        (entry.inclusions ?? entry.inc).join(' '),
      ].join(' '),
    ).split(' '),
    tags: entry.routingTags ?? entry.tags,
    nearMissGroups: entry.nearMissGroups ?? [],
    levels: entry.levelProfiles?.map((level) => level.label) ?? entry.lvl,
    plan: entry.plan,
    source: entry.source ?? entry.src,
    kind: 'group',
  }))
}

function buildLevelText(entry: JesEntry, profile: JesLevelProfile): string {
  return [
    entry.title ?? entry.t,
    entry.code ?? entry.c,
    profile.label,
    profile.summary,
    profile.evidence.join(' '),
    profile.confidenceBasis,
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildLevelSearchDocuments(): SearchDocument[] {
  return index.entries.flatMap((entry) =>
    (entry.levelProfiles ?? []).map((profile) => {
      const text = buildLevelText(entry, profile)
      return {
        code: entry.code ?? entry.c,
        title: entry.title ?? entry.t,
        text,
        keywords: normalize(text).split(' '),
        tags: entry.routingTags ?? entry.tags,
        nearMissGroups: entry.nearMissGroups ?? [],
        levels: [profile.label],
        plan: entry.plan,
        source: profile.source || entry.source || entry.src,
        kind: 'level' as const,
        level: profile.level,
        levelLabel: profile.label,
        evidence: profile.evidence[0] ?? profile.summary,
      }
    }),
  )
}
