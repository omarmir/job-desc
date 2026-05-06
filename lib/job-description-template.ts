import type { DraftInput, DraftSectionKey } from '~/lib/types'
import { getPayScalesForDraft } from '~/lib/pay-scales'

export const JD_SECTION_KEYS = [
  'organizational_context',
  'client_service_results',
  'key_activities',
  'skill',
  'effort',
  'responsibility',
  'working_conditions',
] as const

export type JobDescriptionSectionKey = (typeof JD_SECTION_KEYS)[number]

const _typeCheck: DraftSectionKey = JD_SECTION_KEYS[0]
void _typeCheck

export type JobDescriptionSections = Record<JobDescriptionSectionKey, string>

export const JD_SECTION_LABELS: Record<JobDescriptionSectionKey, string> = {
  organizational_context: 'Organizational context',
  client_service_results: 'Client service results',
  key_activities: 'Key activities',
  skill: 'Skill',
  effort: 'Effort',
  responsibility: 'Responsibility',
  working_conditions: 'Working conditions',
}

const EMPTY_SECTION = 'To be confirmed.'

export function createEmptySections(): JobDescriptionSections {
  return {
    organizational_context: EMPTY_SECTION,
    client_service_results: EMPTY_SECTION,
    key_activities: '- To be confirmed.',
    skill: EMPTY_SECTION,
    effort: EMPTY_SECTION,
    responsibility: EMPTY_SECTION,
    working_conditions: EMPTY_SECTION,
  }
}

function cleanText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\r/g, '')
    .trim()
}

function extractSection(body: string, heading: string, nextHeadings: string[]): string | null {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const nextPattern = nextHeadings
    .map((next) => next.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const regex = new RegExp(
    `(?:^|\\n)#{0,3}\\s*${escapedHeading}\\s*\\n([\\s\\S]*?)(?=\\n#{0,3}\\s*(?:${nextPattern})\\s*\\n|$)`,
    'i',
  )
  const match = body.match(regex)
  return match?.[1]?.trim() || null
}

function normalizeBullets(text: string): string {
  const lines = cleanText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    return '- To be confirmed.'
  }

  const bullets = lines.map((line) => {
    if (/^[-*]\s+/.test(line)) return line.replace(/^\*\s+/, '- ')
    if (/^\d+\.\s+/.test(line)) return `- ${line.replace(/^\d+\.\s+/, '')}`
    return `- ${line}`
  })

  return bullets.join('\n')
}

function normalizeSectionValue(key: JobDescriptionSectionKey, value: string | null): string {
  if (!value) {
    return createEmptySections()[key]
  }

  const cleaned = cleanText(value)
  if (!cleaned) {
    return createEmptySections()[key]
  }

  if (key === 'key_activities') {
    return normalizeBullets(cleaned)
  }

  return cleaned
}

export function extractJobDescriptionSections(rawText: string): JobDescriptionSections {
  const headings = JD_SECTION_KEYS.map((key) => JD_SECTION_LABELS[key])
  const sections = createEmptySections()

  JD_SECTION_KEYS.forEach((key, index) => {
    const heading = headings[index] ?? JD_SECTION_LABELS[key]
    const nextHeadings = headings.slice(index + 1)
    sections[key] = normalizeSectionValue(key, extractSection(rawText, heading, nextHeadings))
  })

  return sections
}

export function formatJobDescriptionTemplate(input: DraftInput, sections: JobDescriptionSections): string {
  const payScales = getPayScalesForDraft(input)
  const classification = input.fullClassification || `${input.selectedCode} - ${input.selectedTitle}`
  const payScaleLines = payScales.length
    ? payScales.flatMap((payScale) => [
      `### ${payScale.code} effective ${payScale.effectiveDate}`,
      '',
      `Annual salary range: ${payScale.range}`,
      '',
      ...payScale.steps.map((step) => `- Step ${step.step}: ${step.amount}`),
      '',
    ])
    : [
      `No deterministic pay scale was found for ${classification} in the bundled pay data.`,
      'Confirm the level and applicable collective agreement before use.',
    ]

  return [
    '# Job Description Template',
    '',
    '## Part 1: Position information and signatures',
    '',
    '| Field | Value |',
    '| --- | --- |',
    '| Position number | To be confirmed |',
    `| Position title | ${input.jobTitle.trim()} |`,
    `| Position classification | ${input.selectedCode} - ${input.selectedTitle} |`,
    '| Position Effective date | To be confirmed |',
    '| Job Code | To be confirmed |',
    '| National occupational classification | To be confirmed |',
    '| Department/Agency Name | To be confirmed |',
    '| Geographic location | To be confirmed |',
    '| Organizational component (Branch/Division) | To be confirmed |',
    '| Office code | To be confirmed |',
    '| Language requirements | To be confirmed |',
    '| Linguistic profile | To be confirmed |',
    '| Communications requirements | To be confirmed |',
    '| Security requirements | To be confirmed |',
    '| Supervisor position number | To be confirmed |',
    '| Supervisor position title | To be confirmed |',
    '| Supervisor classification | To be confirmed |',
    '',
    '### Employee statement',
    '',
    'I have been given the opportunity to read and comment on the content of this job description.',
    '',
    '**Employee name**: To be confirmed',
    '',
    '**Employee signature**: To be confirmed',
    '',
    '**Date**: To be confirmed',
    '',
    '### Supervisor statement',
    '',
    'This job description accurately describes the work assigned to this position.',
    '',
    '**Supervisor name**: To be confirmed',
    '',
    '**Supervisor signature**: To be confirmed',
    '',
    '**Date**: To be confirmed',
    '',
    '### Manager authorization',
    '',
    'This job description accurately describes the work assigned to this position.',
    '',
    '**Manager name**: To be confirmed',
    '',
    '**Manager signature**: To be confirmed',
    '',
    '**Date**: To be confirmed',
    '',
    '## Part 2: Job description',
    '',
    '### Organizational context',
    sections.organizational_context,
    '',
    '### Client service results',
    sections.client_service_results,
    '',
    '### Key activities',
    sections.key_activities,
    '',
    '### Skill',
    sections.skill,
    '',
    '### Effort',
    sections.effort,
    '',
    '### Responsibility',
    sections.responsibility,
    '',
    '### Working conditions',
    sections.working_conditions,
    '',
    '## Pay scale',
    '',
    `Deterministic lookup from bundled public service pay data for ${classification}.`,
    '',
    ...payScaleLines,
  ].join('\n')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatInlineHtml(value: string): string {
  const clean = value
    .replace(/^#{1,6}\s+/, '')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
  const segments: string[] = []
  const pattern = /(\*\*|__)(.+?)\1/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(clean)) !== null) {
    if (match.index > cursor) {
      segments.push(escapeHtml(clean.slice(cursor, match.index)))
    }
    segments.push(`<strong>${escapeHtml(match[2] ?? '')}</strong>`)
    cursor = match.index + match[0].length
  }

  if (cursor < clean.length) {
    segments.push(escapeHtml(clean.slice(cursor)))
  }

  return segments.join('').replace(/\*\*/g, '')
}

function sectionToHtml(key: JobDescriptionSectionKey, text: string): string {
  const lines = cleanText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    return '<p>To be confirmed.</p>'
  }

  const bulletLines = lines.filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
  if (key === 'key_activities' || bulletLines.length >= Math.max(2, lines.length - 1)) {
    const items = lines
      .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim())
      .filter(Boolean)
      .map((line) => `<li>${formatInlineHtml(line)}</li>`)
      .join('')
    return `<ul>${items}</ul>`
  }

  return lines.map((line) => `<p>${formatInlineHtml(line)}</p>`).join('')
}

function formatPayScaleHtml(input: DraftInput): string {
  const payScales = getPayScalesForDraft(input)
  const classification = input.fullClassification || `${input.selectedCode} - ${input.selectedTitle}`

  if (!payScales.length) {
    return [
      '<h2>Pay scale</h2>',
      `<p>No deterministic pay scale was found for ${escapeHtml(classification)} in the bundled pay data. Confirm the level and applicable collective agreement before use.</p>`,
    ].join('')
  }

  return [
    '<h2>Pay scale</h2>',
    `<p>Deterministic lookup from bundled public service pay data for ${escapeHtml(classification)}. Use the latest effective agreement shown below and confirm applicability before final staffing or classification use.</p>`,
    ...payScales.map((payScale) => [
      `<h3>${escapeHtml(payScale.code)} effective ${escapeHtml(payScale.effectiveDate)}</h3>`,
      `<p>Annual salary range: ${escapeHtml(payScale.range)}</p>`,
      '<table>',
      '<thead><tr><th>Step</th><th>Annual rate</th></tr></thead>',
      '<tbody>',
      ...payScale.steps.map((step) => `<tr><td>${escapeHtml(step.step)}</td><td>${escapeHtml(step.amount)}</td></tr>`),
      '</tbody>',
      '</table>',
    ].join('')),
  ].join('')
}

export function formatJobDescriptionHtml(input: DraftInput, sections: JobDescriptionSections): string {
  const classification = input.fullClassification || `${input.selectedCode} - ${input.selectedTitle}`
  const infoRows = [
    ['Position number', 'To be confirmed'],
    ['Position title', input.jobTitle.trim()],
    ['Position classification', classification],
    ['Position Effective date', 'To be confirmed'],
    ['Job Code', 'To be confirmed'],
    ['National occupational classification', 'To be confirmed'],
    ['Department/Agency Name', 'To be confirmed'],
    ['Geographic location', 'To be confirmed'],
    ['Organizational component (Branch/Division)', 'To be confirmed'],
    ['Office code', 'To be confirmed'],
    ['Language requirements', 'To be confirmed'],
    ['Linguistic profile', 'To be confirmed'],
    ['Communications requirements', 'To be confirmed'],
    ['Security requirements', 'To be confirmed'],
    ['Supervisor position number', 'To be confirmed'],
    ['Supervisor position title', 'To be confirmed'],
    ['Supervisor classification', 'To be confirmed'],
  ]

  return [
    '<article class="jd-preview">',
    '<h2>Part 1: Position information and signatures</h2>',
    '<table>',
    '<tbody>',
    ...infoRows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`),
    '</tbody>',
    '</table>',
    '<h2>Part 2: Job description</h2>',
    ...JD_SECTION_KEYS.map(
      (key) => `<section><h3>${escapeHtml(JD_SECTION_LABELS[key])}</h3>${sectionToHtml(key, sections[key])}</section>`,
    ),
    formatPayScaleHtml(input),
    '</article>',
  ].join('')
}
