import { getJesEntries } from '~/lib/jes'
import { JD_SECTION_KEYS, JD_SECTION_LABELS } from '~/lib/job-description-template'
import type { DraftInput } from '~/lib/types'

type ChatMessage = {
  role: 'system' | 'user'
  content: string
}

export function buildJobDescriptionMessages(input: DraftInput): ChatMessage[] {
  const entry = getJesEntries().find((item) => item.c === input.selectedCode)
  const sectionLabels = JD_SECTION_KEYS.map((key) => JD_SECTION_LABELS[key])
  const contextLines = [
    `Selected classification: ${input.selectedCode} - ${input.selectedTitle}`,
    entry?.plan ? `Evaluation plan: ${entry.plan}` : '',
    entry?.lvl?.length ? `Observed levels: ${entry.lvl.slice(0, 6).join(', ')}` : '',
    entry?.def ? `Group definition: ${entry.def}` : '',
    entry?.inc?.length ? `Inclusions: ${entry.inc.slice(0, 4).join(' | ')}` : '',
    entry?.fac?.length ? `Factors: ${entry.fac.slice(0, 8).join(', ')}` : '',
    input.context ? `Additional user context: ${input.context}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return [
    {
      role: 'system',
      content: [
        'You draft Canadian federal public service job descriptions.',
        'Return markdown only.',
        'Do not include analysis, notes, disclaimers, or code fences.',
        'Only produce the Part 2 section headings requested by the user.',
        'If information is missing, write "To be confirmed." instead of inventing facts.',
        'Use concise, plain administrative language.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        'Prepare a grounded job description body for the selected classification.',
        '',
        'Input role',
        `Job title: ${input.jobTitle}`,
        `Optional duties: ${input.duties || 'None provided'}`,
        '',
        'Classification context',
        contextLines,
        '',
        'Required headings',
        ...sectionLabels.map((heading) => `- ${heading}`),
        '',
        'Content rules',
        '- Organizational context: 3 to 5 bullets.',
        '- Client service results: 1 short paragraph.',
        '- Key activities: 6 to 8 bullets with active verbs.',
        '- Skill, Effort, Responsibility, Working conditions: 1 short paragraph each.',
        '- Do not add any heading outside the required list.',
      ].join('\n'),
    },
  ]
}
