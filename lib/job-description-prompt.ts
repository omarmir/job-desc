import { getJesEntries } from '~/lib/jes'
import { JD_SECTION_LABELS } from '~/lib/job-description-template'
import type { DraftInput, DraftSectionKey } from '~/lib/types'

type ChatMessage = {
  role: 'system' | 'user'
  content: string
}

function buildClassificationContext(input: DraftInput): string {
  const entry = getJesEntries().find((item) => item.c === input.selectedCode)
  const selectedClassification = input.fullClassification || `${input.selectedCode} - ${input.selectedTitle}`
  return [
    `Selected classification: ${selectedClassification}`,
    input.selectedLevel ? `Selected level: ${input.selectedLevel}` : '',
    input.levelEvidence ? `JES level evidence: ${input.levelEvidence}` : '',
    entry?.plan ? `Evaluation plan: ${entry.plan}` : '',
    entry?.groupDefinition ? `Group definition: ${entry.groupDefinition}` : entry?.def ? `Group definition: ${entry.def}` : '',
    entry?.inclusions?.length ? `Inclusions: ${entry.inclusions.slice(0, 4).join(' | ')}` : entry?.inc?.length ? `Inclusions: ${entry.inc.slice(0, 4).join(' | ')}` : '',
    input.context ? `Additional user context: ${input.context}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildJobDescriptionSectionMessages(input: DraftInput, sectionKey: DraftSectionKey): ChatMessage[] {
  const heading = JD_SECTION_LABELS[sectionKey]
  const instructions: Record<DraftSectionKey, string> = {
    organizational_context:
      'Write 1 to 3 concise bullets only for facts supported by the input. Cover work stream, organizational setting, reporting context, and scope only when provided. If these facts are missing, write a single bullet: "To be confirmed."',
    client_service_results:
      'Write one short paragraph only if the input states the service result, client group, or public/internal value. If the service result is not stated, write exactly: "To be confirmed."',
    key_activities:
      'Write 6 to 8 bullets. Start each bullet with an active verb. Keep duties grounded in the input role and selected classification.',
    skill:
      'Write one short paragraph covering knowledge, analytical skill, communication, and judgment required for the work.',
    effort:
      'Write one short paragraph covering mental effort, concentration, competing deadlines, and any physical effort only if supported by the input.',
    responsibility:
      'Write one short paragraph covering accountability, impact of recommendations, resources, supervision, and decision latitude. Do not invent direct reports.',
    working_conditions:
      'Write one short paragraph covering office, hybrid, travel, deadlines, stakeholder pressure, or exposure conditions only when supported; otherwise use ordinary office conditions and "To be confirmed" for specifics.',
  }

  return [
    {
      role: 'system',
      content: [
        'You draft Canadian federal public service job description sections.',
        'Return plain text only.',
        'Do not use markdown headings, tables, code fences, analysis, or disclaimers.',
        'Use concise, plain administrative language.',
        'Use only facts found in the input role, additional user context, or selected classification context.',
        'Do not invent departments, branches, teams, reporting relationships, clients, service channels, programs, files, regions, tools, deliverables, stakeholders, workload, travel, or supervision.',
        'Do not convert generic classification context into organization-specific facts.',
        'If a fact is missing, write "To be confirmed" instead of inventing it.',
        'It is acceptable to produce sparse content.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Draft only this section: ${heading}`,
        '',
        'Input role',
        `Job title: ${input.jobTitle}`,
        `Optional duties: ${input.duties || 'None provided'}`,
        `Additional user context: ${input.context || 'None provided'}`,
        '',
        'Classification context',
        buildClassificationContext(input),
        '',
        'Section rules',
        instructions[sectionKey],
      ].join('\n'),
    },
  ]
}
