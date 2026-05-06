import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Entry = {
  c: string
  t: string
  tags: string[]
  alias: string[]
  def: string | null
}

type BenchmarkCase = {
  id: string
  target: string
  title: string
  duties: string
  notes: string
}

const root = resolve(import.meta.dir, '..')
const indexPath = resolve(root, 'resources', 'jes_compact_index.json')
const outputPath = resolve(root, 'resources', 'benchmark_corpus.json')

const priorityCodes = ['AS', 'PM', 'EC', 'PG', 'PE', 'CT', 'CO', 'EN-ENG', 'EG', 'IS', 'WP', 'CR', 'PO', 'EX', 'FB', 'NU']

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function toRoleStem(entry: Entry): string {
  const title = entry.t
    .replace(/job evaluation standard/i, '')
    .replace(/\bgroup\b/gi, '')
    .trim()

  if (/firefighters/i.test(title)) return 'Firefighter'
  if (/translation/i.test(title)) return 'Translator'
  if (/photography/i.test(title)) return 'Photographer'
  if (/library/i.test(title)) return 'Librarian'
  if (/nursing/i.test(title)) return 'Nurse'
  if (/social work/i.test(title)) return 'Social Worker'
  if (/medicine/i.test(title)) return 'Medical Officer'
  if (/dentistry/i.test(title)) return 'Dentist'
  if (/pharmacy/i.test(title)) return 'Pharmacist'
  if (/teaching/i.test(title)) return 'Instructor'
  if (/inspection/i.test(title)) return 'Inspector'
  if (/operations/i.test(title)) return 'Operations Officer'
  if (/science|chemistry|biology|mathematics|research/i.test(title)) return `${title.split(' ')[0]} Scientist`
  if (/engineering/i.test(title)) return 'Engineer'
  if (/survey/i.test(title)) return 'Surveyor'
  if (/communications/i.test(title)) return 'Communications Advisor'
  if (/administrative/i.test(title)) return 'Administrative Officer'
  if (/programme|program/i.test(title)) return 'Program Officer'
  if (/personnel/i.test(title)) return 'Human Resources Advisor'
  if (/purchase|supply/i.test(title)) return 'Procurement Officer'
  if (/comptrollership/i.test(title)) return 'Financial Management Advisor'
  return `${title.split(' ')[0]} Officer`
}

function topTags(entry: Entry, count = 6): string[] {
  return entry.tags
    .filter((tag) => /^[a-z][a-z0-9 ]+$/.test(tag) && tag.length > 4)
    .filter((tag) => !/(^activ$|^activitie$|^analysi$|^acquir$|^accord$|^occupational$)/.test(tag))
    .slice(0, count)
}

function focusPhrase(entry: Entry): string {
  return entry.t
    .replace(/job evaluation standard/i, '')
    .replace(/\bgroup\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function makeDutySentence(entry: Entry, tags: string[], variant: number): string {
  const focus = focusPhrase(entry)
  const [a = focus, b = 'program delivery', c = 'internal services', d = 'policy implementation', e = 'advisory support'] = tags
  const variants = [
    `Leads analysis related to ${focus}, prepares recommendations, and supports ${a} planning with clear written briefings.`,
    `Coordinates work tied to ${focus}, reviews files, and provides advice to internal clients and partners on ${b}.`,
    `Conducts research and develops procedures connected to ${focus}, while monitoring ${c} delivery against departmental requirements.`,
    `Provides operational support for ${focus}, resolves issues, and maintains records, guidance, and reporting on ${d}.`,
    `Advises management on ${focus}, drafts products, and collaborates with colleagues on ${e} improvements.`,
  ]
  return variants[variant % variants.length] ?? variants[0] ?? `Supports ${focus} work.`
}

function buildCasesForEntry(entry: Entry, count: number): BenchmarkCase[] {
  const roleStem = toRoleStem(entry)
  const tags = topTags(entry)
  const titleVariants = [
    roleStem,
    `Senior ${roleStem}`,
    `${roleStem} Advisor`,
    `${roleStem} Coordinator`,
    `${roleStem} Supervisor`,
  ]

  return Array.from({ length: count }, (_, index) => ({
    id: `${entry.c.toLowerCase()}-${String(index + 1).padStart(2, '0')}`,
    target: entry.c,
    title: titleVariants[index % titleVariants.length] ?? roleStem,
    duties: makeDutySentence(entry, tags, index),
    notes: normalize([entry.t, tags.slice(0, 3).join(', ')].filter(Boolean).join(' | ')),
  }))
}

const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { entries: Entry[] }
const baseCases = index.entries.flatMap((entry) => buildCasesForEntry(entry, 4))
const extraCases = priorityCodes.flatMap((code) => {
  const entry = index.entries.find((item) => item.c === code)
  return entry ? buildCasesForEntry(entry, 1) : []
})

const cases = [...baseCases, ...extraCases].slice(0, 300)

writeFileSync(outputPath, JSON.stringify(cases, null, 2))
console.log(`Wrote ${cases.length} benchmark cases to ${outputPath}`)
