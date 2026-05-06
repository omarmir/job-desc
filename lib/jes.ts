import jesIndex from '~/resources/jes_compact_index.json'
import type { JesEntry, JesIndex, SearchDocument } from '~/lib/types'

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
}

export function getJesIndex(): JesIndex {
  return index
}

export function getJesEntries(): JesEntry[] {
  return index.entries
}

export function buildSearchDocuments(): SearchDocument[] {
  return index.entries.map((entry) => ({
    code: entry.c,
    title: entry.t,
    text: buildText(entry),
    keywords: normalize(
      [
        entry.t,
        entry.c,
        entry.alias.join(' '),
        entry.tags.join(' '),
        entry.def ?? '',
        entry.inc.join(' '),
      ].join(' '),
    ).split(' '),
    tags: entry.tags,
    levels: entry.lvl,
    plan: entry.plan,
    source: entry.src,
  }))
}
