import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { GenerationBenchmarkCase } from '../lib/types'

type JesIndex = {
  entries: Array<{
    c: string
    t: string
  }>
}

type Archetype = {
  code: string
  roleVariants: string[]
  dutyVariants: string[]
  contexts: string[]
  expectedKeywords: string[]
}

const root = resolve(import.meta.dir, '..')
const indexPath = resolve(root, 'resources', 'jes_compact_index.json')
const outputPath = resolve(root, 'resources', 'generation_benchmark_cases.json')

const archetypes: Archetype[] = [
  {
    code: 'AS',
    roleVariants: ['Operations Coordinator', 'Administrative Officer', 'Regional Support Advisor', 'Executive Services Coordinator', 'Corporate Services Analyst'],
    dutyVariants: [
      'Coordinates calendars, records, correspondence tracking, travel requests, and briefing logistics for a busy internal directorate.',
      'Maintains workflow controls, prepares standard reports, and supports office procedures for managers and staff.',
      'Organizes meetings, tracks action items, and manages intake for administrative service requests.',
      'Supports records, approvals, procurement requests, and routine liaison with internal service teams.',
      'Provides operational support, file management, and procedural advice to a branch-level office.',
    ],
    contexts: ['Hybrid regional office supporting internal operations.', 'Branch support environment with multiple managers.'],
    expectedKeywords: ['administrative', 'coordination', 'records', 'correspondence', 'procedures'],
  },
  {
    code: 'CM',
    roleVariants: ['Communications Advisor', 'Digital Content Officer', 'Media Relations Analyst', 'Public Affairs Coordinator', 'Web Communications Strategist'],
    dutyVariants: [
      'Drafts web content, speaking points, and media lines for program announcements and service updates.',
      'Coordinates communications products, stakeholder messaging, and plain-language edits across approval cycles.',
      'Develops outreach materials, briefing content, and internal messaging for senior management.',
      'Supports media monitoring, issue notes, and publication planning for public-facing information.',
      'Advises on product tone, accessibility, and consistent messaging across digital channels.',
    ],
    contexts: ['Public-facing program communications unit.', 'Small corporate communications shop with rapid turnaround products.'],
    expectedKeywords: ['communications', 'messaging', 'briefing', 'content', 'stakeholder'],
  },
  {
    code: 'CO',
    roleVariants: ['Commercial Officer', 'Market Access Advisor', 'Trade Compliance Analyst', 'Business Development Officer', 'Industry Liaison Officer'],
    dutyVariants: [
      'Analyzes market conditions, engages industry contacts, and develops advice on commercial opportunities and risks.',
      'Supports trade-related files, business outreach, and briefing material for management decisions.',
      'Reviews sector trends, liaises with firms, and recommends approaches to commercial issues.',
      'Coordinates commercial intelligence, client briefings, and issue tracking on business files.',
      'Provides advice on trade and industry considerations affecting program and business decisions.',
    ],
    contexts: ['Commercial policy and outreach environment.', 'Industry-facing program with advisory and liaison duties.'],
    expectedKeywords: ['commercial', 'market', 'industry', 'advice', 'stakeholder'],
  },
  {
    code: 'CR',
    roleVariants: ['Regulatory Clerk', 'Program Clerk', 'Client Records Clerk', 'Processing Clerk', 'Administrative Clerk'],
    dutyVariants: [
      'Processes client files, validates data, responds to routine enquiries, and maintains accurate records.',
      'Screens incoming documents, updates tracking systems, and applies standard procedures to file processing.',
      'Provides front-line clerical support, file control, and basic information to clients and staff.',
      'Performs data entry, document verification, and records maintenance under established procedures.',
      'Handles routine transactions, correspondence, and information requests with close attention to accuracy.',
    ],
    contexts: ['High-volume service processing team.', 'Records and file administration environment.'],
    expectedKeywords: ['clerical', 'processing', 'records', 'data', 'procedures'],
  },
  {
    code: 'CT',
    roleVariants: ['Financial Management Advisor', 'Internal Controls Analyst', 'Resource Management Officer', 'Comptrollership Advisor', 'Finance Governance Analyst'],
    dutyVariants: [
      'Provides financial management advice, monitors forecasts, and supports internal control practices.',
      'Analyzes spending trends, prepares variance reports, and advises managers on stewardship requirements.',
      'Coordinates budgeting inputs, challenge functions, and financial reporting for a branch.',
      'Supports governance, control assessments, and documentation for finance and resource management.',
      'Advises on financial policies, risk controls, and compliance with departmental requirements.',
    ],
    contexts: ['Corporate finance and planning team.', 'Comptrollership environment supporting several cost centres.'],
    expectedKeywords: ['financial', 'controls', 'budget', 'reporting', 'stewardship'],
  },
  {
    code: 'EC',
    roleVariants: ['Economic Analyst', 'Policy Analyst', 'Socio-Economic Research Officer', 'Program Policy Advisor', 'Research Economist'],
    dutyVariants: [
      'Conducts policy analysis, synthesizes evidence, and prepares briefing notes on economic and social issues.',
      'Reviews legislation and program data, develops options, and advises management on policy implications.',
      'Leads research, environmental scanning, and recommendations related to public policy questions.',
      'Assesses trends, drafts memoranda, and supports strategic policy development and reporting.',
      'Builds analysis products, stakeholder summaries, and evidence-based advice for decision-makers.',
    ],
    contexts: ['Central policy unit with briefing-driven work.', 'Research and strategic analysis team supporting program design.'],
    expectedKeywords: ['policy', 'analysis', 'research', 'briefing', 'evidence'],
  },
  {
    code: 'EG',
    roleVariants: ['Engineering Technologist', 'Technical Project Officer', 'Field Engineering Advisor', 'Infrastructure Support Officer', 'Engineering Operations Coordinator'],
    dutyVariants: [
      'Supports engineering operations, technical reviews, and project coordination for infrastructure assets.',
      'Conducts site-related analysis, prepares technical documentation, and monitors operational requirements.',
      'Provides applied technical advice, inspection support, and engineering records management.',
      'Coordinates technical services, maintenance planning, and issue resolution for assets and systems.',
      'Assists engineers by gathering data, reviewing specifications, and tracking project deliverables.',
    ],
    contexts: ['Technical operations environment with field coordination.', 'Applied engineering support team.'],
    expectedKeywords: ['technical', 'engineering', 'project', 'documentation', 'operations'],
  },
  {
    code: 'EN-ENG',
    roleVariants: ['Civil Engineer', 'Mechanical Engineer', 'Project Engineer', 'Structural Engineer', 'Engineering Advisor'],
    dutyVariants: [
      'Designs or reviews engineering solutions, assesses technical risks, and provides professional recommendations.',
      'Plans engineering work, analyzes specifications, and supports project delivery and compliance.',
      'Prepares technical advice, reviews designs, and coordinates engineering aspects of infrastructure work.',
      'Leads engineering assessments, contract inputs, and quality review of technical deliverables.',
      'Applies engineering judgment to planning, standards, and project implementation issues.',
    ],
    contexts: ['Professional engineering unit with project responsibilities.', 'Infrastructure design and oversight function.'],
    expectedKeywords: ['engineering', 'design', 'technical', 'project', 'standards'],
  },
  {
    code: 'EX',
    roleVariants: ['Director', 'Executive Director', 'Regional Director', 'Director General Office Lead', 'Branch Director'],
    dutyVariants: [
      'Leads a directorate, sets priorities, manages resources, and is accountable for results and stakeholder relationships.',
      'Directs program delivery, risk management, and strategic planning across a broad mandate.',
      'Provides executive leadership, oversight, and decision support for complex operational and policy files.',
      'Allocates budgets, guides managers, and ensures organizational performance and accountability.',
      'Represents the organization with senior stakeholders and steers strategic initiatives and governance.',
    ],
    contexts: ['Executive leadership role with delegated management responsibilities.', 'Branch-level oversight with strategic and operational accountability.'],
    expectedKeywords: ['leadership', 'strategic', 'resources', 'oversight', 'accountability'],
  },
  {
    code: 'FB',
    roleVariants: ['Border Services Officer', 'Border Intelligence Advisor', 'Enforcement Programs Officer', 'Port Operations Supervisor', 'Traveller Operations Officer'],
    dutyVariants: [
      'Applies border legislation, conducts examinations, and resolves compliance issues involving travellers or goods.',
      'Supports enforcement operations, intelligence sharing, and case documentation for border programs.',
      'Monitors compliance, prepares enforcement records, and liaises with operational partners.',
      'Provides front-line border program delivery, inspection activity, and incident reporting.',
      'Coordinates operational responses and applies procedures related to border service enforcement.',
    ],
    contexts: ['Operational border services environment.', 'Front-line compliance and enforcement setting.'],
    expectedKeywords: ['border', 'enforcement', 'compliance', 'inspection', 'legislation'],
  },
  {
    code: 'HR',
    roleVariants: ['Historical Research Officer', 'Research Historian', 'Archival Interpretation Advisor', 'Collections Research Analyst', 'Historical Programs Officer'],
    dutyVariants: [
      'Conducts historical research, analyzes archival sources, and prepares interpretive products and advice.',
      'Assesses documentary evidence, writes historical summaries, and supports research-based program work.',
      'Develops research findings, contextual analysis, and briefing material on historical subjects.',
      'Advises on sources, interpretation, and historical accuracy for publications and projects.',
      'Coordinates historical files, knowledge products, and stakeholder responses grounded in archival evidence.',
    ],
    contexts: ['Research-based heritage program.', 'Historical analysis team supporting publications and interpretation.'],
    expectedKeywords: ['historical', 'research', 'archival', 'analysis', 'interpretation'],
  },
  {
    code: 'IS',
    roleVariants: ['Information Services Advisor', 'Publishing Officer', 'Access to Information Analyst', 'Knowledge Management Officer', 'Library and Information Specialist'],
    dutyVariants: [
      'Manages information resources, prepares access products, and advises on publishing or information services processes.',
      'Supports document lifecycle controls, client access needs, and information management guidance.',
      'Coordinates records discovery, retrieval, and publication or disclosure workflows.',
      'Provides information services advice, metadata support, and document handling procedures.',
      'Analyzes requests, organizes information assets, and supports service delivery for information products.',
    ],
    contexts: ['Information management and publishing function.', 'Knowledge and records service environment.'],
    expectedKeywords: ['information', 'records', 'access', 'publishing', 'metadata'],
  },
  {
    code: 'IT',
    roleVariants: ['IT Analyst', 'Business Systems Analyst', 'Applications Support Advisor', 'Cyber Operations Officer', 'Technical Services Lead'],
    dutyVariants: [
      'Analyzes technical requirements, supports systems, and provides advice on applications, infrastructure, or cyber service delivery.',
      'Coordinates incident resolution, system changes, and documentation for information technology services.',
      'Assesses client needs, translates them into technical options, and supports implementation planning.',
      'Supports platform operations, user issues, and service improvement for digital systems.',
      'Produces technical analysis, testing inputs, and lifecycle documentation for IT solutions.',
    ],
    contexts: ['Enterprise IT service delivery team.', 'Applications and infrastructure support environment.'],
    expectedKeywords: ['technology', 'systems', 'technical', 'service', 'analysis'],
  },
  {
    code: 'PE',
    roleVariants: ['Human Resources Advisor', 'Classification Advisor', 'Staffing Officer', 'Labour Relations Advisor', 'HR Policy Analyst'],
    dutyVariants: [
      'Provides human resources advice on staffing, classification, policy interpretation, and people management practices.',
      'Analyzes HR issues, develops options, and supports managers on staffing and labour matters.',
      'Coordinates HR service delivery, case management, and documentation for management clients.',
      'Supports classification or staffing files, guidance products, and issue resolution.',
      'Advises on workforce policies, processes, and compliance requirements affecting managers and employees.',
    ],
    contexts: ['Corporate HR advisory team.', 'People management services environment.'],
    expectedKeywords: ['human resources', 'staffing', 'classification', 'advice', 'policy'],
  },
  {
    code: 'PG',
    roleVariants: ['Procurement Officer', 'Supply Advisor', 'Contracting Specialist', 'Materiel Management Officer', 'Purchasing Analyst'],
    dutyVariants: [
      'Manages procurement or contracting files, provides advice on supply processes, and supports vendor interactions.',
      'Prepares solicitation documents, evaluates procurement requirements, and tracks contracts and materiel.',
      'Advises clients on procurement options, policy compliance, and acquisition planning.',
      'Coordinates purchasing transactions, documentation, and contract administration activities.',
      'Supports materiel planning, inventory controls, and procurement reporting for operational needs.',
    ],
    contexts: ['Procurement and materiel management unit.', 'Internal acquisition services environment.'],
    expectedKeywords: ['procurement', 'contracting', 'supply', 'materiel', 'compliance'],
  },
  {
    code: 'PM',
    roleVariants: ['Program Officer', 'Service Delivery Officer', 'Operations Program Advisor', 'Regional Program Coordinator', 'Client Programs Analyst'],
    dutyVariants: [
      'Delivers program operations, interprets procedures, and coordinates service or benefit files with clients and partners.',
      'Supports program implementation, case review, and operational reporting under established frameworks.',
      'Analyzes program issues, prepares recommendations, and coordinates delivery activities.',
      'Monitors service requests, resolves operational problems, and maintains program records.',
      'Provides advice, file management, and quality control for ongoing program administration.',
    ],
    contexts: ['Operational program delivery team.', 'Regional service delivery environment with client-facing work.'],
    expectedKeywords: ['program', 'delivery', 'operations', 'clients', 'procedures'],
  },
  {
    code: 'SG',
    roleVariants: ['Regulatory Scientist', 'Scientific Evaluator', 'Compliance Science Advisor', 'Assessment Officer', 'Scientific Programs Analyst'],
    dutyVariants: [
      'Evaluates scientific evidence, applies regulatory frameworks, and prepares recommendations on compliance or approvals.',
      'Analyzes technical submissions, risk information, and standards relevant to scientific regulation.',
      'Supports reviews, prepares scientific advice, and documents regulatory findings and rationale.',
      'Coordinates evidence assessment, stakeholder questions, and regulatory issue tracking.',
      'Provides science-based recommendations to support regulatory decisions and ongoing oversight.',
    ],
    contexts: ['Scientific regulatory review function.', 'Evidence-based compliance and approvals environment.'],
    expectedKeywords: ['scientific', 'regulatory', 'assessment', 'evidence', 'compliance'],
  },
  {
    code: 'WP',
    roleVariants: ['Social Program Officer', 'Community Services Advisor', 'Rehabilitation Case Officer', 'Settlement Support Officer', 'Welfare Programs Analyst'],
    dutyVariants: [
      'Plans or delivers welfare-related services, assesses client or community needs, and coordinates interventions or supports.',
      'Advises on social development programs, case approaches, and service coordination for clients or communities.',
      'Supports rehabilitation or settlement work, reviews cases, and maintains service partnerships.',
      'Analyzes social program issues, writes recommendations, and coordinates follow-up with service providers.',
      'Provides client-centred program support grounded in social development and adjustment needs.',
    ],
    contexts: ['Client or community service program environment.', 'Social support and rehabilitation setting.'],
    expectedKeywords: ['social', 'services', 'community', 'clients', 'support'],
  },
  {
    code: 'BI',
    roleVariants: ['Biologist', 'Wildlife Research Officer', 'Ecosystem Assessment Analyst', 'Aquatic Science Advisor', 'Biological Programs Officer'],
    dutyVariants: [
      'Conducts biological analysis, field or lab-based research, and prepares advice on ecological or species issues.',
      'Designs studies, interprets biological data, and produces scientific documentation and recommendations.',
      'Supports biological monitoring, evidence synthesis, and stakeholder advice on science files.',
      'Analyzes environmental or species information and contributes to research planning and reporting.',
      'Provides science-based recommendations grounded in biological observations, data, and literature.',
    ],
    contexts: ['Applied science and monitoring program.', 'Biological research and advisory environment.'],
    expectedKeywords: ['biological', 'research', 'analysis', 'science', 'monitoring'],
  },
  {
    code: 'CH',
    roleVariants: ['Chemist', 'Laboratory Chemist', 'Chemical Evaluation Officer', 'Analytical Science Advisor', 'Chemical Programs Analyst'],
    dutyVariants: [
      'Performs chemical analysis, interprets results, and prepares technical advice or reports.',
      'Supports laboratory operations, method documentation, and quality review of chemical work.',
      'Analyzes samples, evaluates findings, and provides recommendations grounded in chemistry.',
      'Coordinates analytical workflows, reporting, and technical records for chemical assessments.',
      'Provides chemistry-based advice, evidence summaries, and documentation for scientific decisions.',
    ],
    contexts: ['Laboratory and analytical science setting.', 'Chemistry-based evaluation program.'],
    expectedKeywords: ['chemical', 'analysis', 'laboratory', 'technical', 'reports'],
  },
]

const index = JSON.parse(readFileSync(indexPath, 'utf8')) as JesIndex
const titleLookup = new Map(index.entries.map((entry) => [entry.c, entry.t]))

const cases: GenerationBenchmarkCase[] = []

for (const archetype of archetypes) {
  const selectedTitle = titleLookup.get(archetype.code)
  if (!selectedTitle) {
    throw new Error(`Missing JES entry for ${archetype.code}`)
  }

  archetype.roleVariants.forEach((roleTitle, index) => {
    cases.push({
      id: `${archetype.code.toLowerCase()}-${String(index + 1).padStart(2, '0')}`,
      code: archetype.code,
      title: roleTitle,
      duties: archetype.dutyVariants[index] ?? archetype.dutyVariants[0] ?? 'To be confirmed.',
      context: archetype.contexts[index % archetype.contexts.length],
      expectedKeywords: archetype.expectedKeywords,
    })
  })
}

if (cases.length !== 100) {
  throw new Error(`Expected 100 cases but built ${cases.length}`)
}

writeFileSync(outputPath, JSON.stringify(cases, null, 2))
console.log(`Wrote ${cases.length} generation benchmark cases to ${outputPath}`)
