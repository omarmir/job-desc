import JSZip from 'jszip'
import type { DraftInput } from '~/lib/types'
import {
  JD_SECTION_KEYS,
  JD_SECTION_LABELS,
  type JobDescriptionSections,
  type JobDescriptionSectionKey,
} from '~/lib/job-description-template'

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const templateUrl = new URL('../resources/template.docx', import.meta.url).href
type InlineSegment = {
  text: string
  bold: boolean
}

type SectionParagraph = {
  text: string
  bullet: boolean
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function textContent(element: Element): string {
  return Array.from(element.getElementsByTagNameNS(WORD_NS, 't'))
    .map((node) => node.textContent ?? '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

function createRunProperties(doc: Document, bold = false): Element | null {
  if (!bold) {
    return null
  }

  const runProperties = doc.createElementNS(WORD_NS, 'w:rPr')
  runProperties.appendChild(doc.createElementNS(WORD_NS, 'w:b'))
  runProperties.appendChild(doc.createElementNS(WORD_NS, 'w:bCs'))
  return runProperties
}

function createTextRun(doc: Document, text: string, bold = false): Element {
  const run = doc.createElementNS(WORD_NS, 'w:r')
  const runProperties = createRunProperties(doc, bold)
  if (runProperties) {
    run.appendChild(runProperties)
  }

  const textNode = doc.createElementNS(WORD_NS, 'w:t')
  textNode.setAttribute('xml:space', 'preserve')
  textNode.textContent = text
  run.appendChild(textNode)
  return run
}

function parseInlineFormatting(value: string): InlineSegment[] {
  const clean = value
    .replace(/^#{1,6}\s+/, '')
    .replace(/`([^`]+)`/g, '$1')
    .trim()

  const segments: InlineSegment[] = []
  const pattern = /(\*\*|__)(.+?)\1/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(clean)) !== null) {
    if (match.index > cursor) {
      segments.push({ text: clean.slice(cursor, match.index), bold: false })
    }

    segments.push({ text: match[2] ?? '', bold: true })
    cursor = match.index + match[0].length
  }

  if (cursor < clean.length) {
    segments.push({ text: clean.slice(cursor), bold: false })
  }

  return segments.filter((segment) => segment.text.length > 0)
}

function appendFormattedRuns(paragraph: Element, text: string) {
  const doc = paragraph.ownerDocument
  const segments = parseInlineFormatting(text)
  if (!segments.length) {
    paragraph.appendChild(createTextRun(doc, 'To be confirmed.'))
    return
  }

  for (const segment of segments) {
    paragraph.appendChild(createTextRun(doc, segment.text, segment.bold))
  }
}

function setParagraphText(paragraph: Element, text: string) {
  Array.from(paragraph.childNodes).forEach((child) => {
    if ((child as Element).localName !== 'pPr') {
      paragraph.removeChild(child)
    }
  })
  appendFormattedRuns(paragraph, text)
}

function ensureCellParagraph(cell: Element): Element {
  const existing = cell.getElementsByTagNameNS(WORD_NS, 'p')[0]
  if (existing) {
    return existing
  }

  const paragraph = cell.ownerDocument.createElementNS(WORD_NS, 'w:p')
  cell.appendChild(paragraph)
  return paragraph
}

function fillTableValue(doc: Document, label: string, value: string) {
  const rows = Array.from(doc.getElementsByTagNameNS(WORD_NS, 'tr'))
  const target = normalize(label)

  for (const row of rows) {
    const cells = Array.from(row.getElementsByTagNameNS(WORD_NS, 'tc'))
    if (cells.length < 2) {
      continue
    }

    if (normalize(textContent(cells[0]!)) === target) {
      setParagraphText(ensureCellParagraph(cells[1]!), value)
      return
    }
  }
}

function createParagraphProperties(doc: Document, bullet = false): Element {
  const paragraphProperties = doc.createElementNS(WORD_NS, 'w:pPr')

  if (bullet) {
    const paragraphStyle = doc.createElementNS(WORD_NS, 'w:pStyle')
    paragraphStyle.setAttributeNS(WORD_NS, 'w:val', 'ListParagraph')
    paragraphProperties.appendChild(paragraphStyle)

    const numberProperties = doc.createElementNS(WORD_NS, 'w:numPr')
    const level = doc.createElementNS(WORD_NS, 'w:ilvl')
    level.setAttributeNS(WORD_NS, 'w:val', '0')
    const numberId = doc.createElementNS(WORD_NS, 'w:numId')
    numberId.setAttributeNS(WORD_NS, 'w:val', '8')
    numberProperties.appendChild(level)
    numberProperties.appendChild(numberId)
    paragraphProperties.appendChild(numberProperties)
  }

  const spacing = doc.createElementNS(WORD_NS, 'w:spacing')
  spacing.setAttributeNS(WORD_NS, 'w:after', '0')
  paragraphProperties.appendChild(spacing)
  return paragraphProperties
}

function createParagraph(doc: Document, item: SectionParagraph): Element {
  const paragraph = doc.createElementNS(WORD_NS, 'w:p')
  paragraph.appendChild(createParagraphProperties(doc, item.bullet))
  appendFormattedRuns(paragraph, item.text)
  return paragraph
}

function cleanLine(value: string): string {
  return value
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .trim()
}

function sectionParagraphs(key: JobDescriptionSectionKey, value: string): SectionParagraph[] {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    return [{ text: 'To be confirmed.', bullet: false }]
  }

  return lines.map((line) => {
    const hasBulletMarker = /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)
    const text = cleanLine(line)
    return {
      text: text || 'To be confirmed.',
      bullet: key === 'key_activities' || hasBulletMarker,
    }
  })
}

function stripTemplateListProperties(paragraph: Element) {
  const paragraphProperties = Array.from(paragraph.childNodes).find(
    (child) => (child as Element).localName === 'pPr',
  ) as Element | undefined
  if (!paragraphProperties) {
    return
  }

  for (const child of Array.from(paragraphProperties.childNodes)) {
    if ((child as Element).localName === 'numPr') {
      paragraphProperties.removeChild(child)
    }
  }

  for (const child of Array.from(paragraphProperties.childNodes)) {
    if ((child as Element).localName === 'pStyle') {
      const value = (child as Element).getAttributeNS(WORD_NS, 'val')
      if (value === 'ListParagraph') {
        paragraphProperties.removeChild(child)
      }
    }
  }
}

function removeGeneratedSectionContent(body: Element, start: Element, end: Element | null) {
  let cursor = start.nextSibling

  while (cursor && cursor !== end) {
    const remove = cursor
    cursor = cursor.nextSibling
    body.removeChild(remove)
  }

  stripTemplateListProperties(start)
}

function findNextSectionHeading(headingEntries: { paragraph: Element }[], index: number): Element | null {
  return headingEntries[index + 1]?.paragraph ?? null
}

function insertSectionParagraphs(body: Element, heading: Element, paragraphs: Element[]) {
  for (const paragraph of paragraphs.reverse()) {
    body.insertBefore(paragraph, heading.nextSibling)
  }
}

function removeMarkdownArtifacts(doc: Document) {
  for (const textNode of Array.from(doc.getElementsByTagNameNS(WORD_NS, 't'))) {
    const parentRun = textNode.parentElement
    const value = textNode.textContent ?? ''
    const fullyBold = value.match(/^\*\*([^*]+)\*\*$/)
    if (fullyBold && parentRun) {
      textNode.textContent = fullyBold[1] ?? ''
      const runProperties = parentRun.getElementsByTagNameNS(WORD_NS, 'rPr')[0] ?? doc.createElementNS(WORD_NS, 'w:rPr')
      if (!runProperties.parentElement) {
        parentRun.insertBefore(runProperties, parentRun.firstChild)
      }
      if (!runProperties.getElementsByTagNameNS(WORD_NS, 'b').length) {
        runProperties.appendChild(doc.createElementNS(WORD_NS, 'w:b'))
      }
      if (!runProperties.getElementsByTagNameNS(WORD_NS, 'bCs').length) {
        runProperties.appendChild(doc.createElementNS(WORD_NS, 'w:bCs'))
      }
    } else if (value.includes('**')) {
      textNode.textContent = value.replace(/\*\*/g, '')
    }
  }
}

function fillSections(doc: Document, sections: JobDescriptionSections) {
  const body = doc.getElementsByTagNameNS(WORD_NS, 'body')[0]
  if (!body) {
    return
  }

  const headingMap = findHeadingParagraphs(doc)
  const headingEntries = JD_SECTION_KEYS.map((key) => ({ key, paragraph: headingMap.get(key) })).filter(
    (entry): entry is { key: JobDescriptionSectionKey; paragraph: Element } => Boolean(entry.paragraph),
  )

  for (let index = headingEntries.length - 1; index >= 0; index -= 1) {
    const { key, paragraph } = headingEntries[index]!
    const next = findNextSectionHeading(headingEntries, index)
    removeGeneratedSectionContent(body, paragraph, next)

    const newParagraphs = sectionParagraphs(key, sections[key]).map((item) => createParagraph(doc, item))
    insertSectionParagraphs(body, paragraph, newParagraphs)
  }
}

function findHeadingParagraphs(doc: Document) {
  const paragraphs = Array.from(doc.getElementsByTagNameNS(WORD_NS, 'p'))
  return new Map(
    JD_SECTION_KEYS.map((key) => {
      const heading = normalize(JD_SECTION_LABELS[key])
      const paragraph = paragraphs.find((item) => normalize(textContent(item)) === heading)
      return [key, paragraph] as const
    }),
  )
}

export async function buildJobDescriptionDocx(input: DraftInput, sections: JobDescriptionSections): Promise<Blob> {
  const response = await fetch(templateUrl)
  if (!response.ok) {
    throw new Error('Unable to load DOCX template')
  }

  const zip = await JSZip.loadAsync(await response.arrayBuffer())
  const documentXml = await zip.file('word/document.xml')?.async('string')
  if (!documentXml) {
    throw new Error('DOCX template is missing word/document.xml')
  }

  const doc = new DOMParser().parseFromString(documentXml, 'application/xml')
  const classification = input.fullClassification || `${input.selectedCode} - ${input.selectedTitle}`
  fillTableValue(doc, 'Position title', input.jobTitle.trim())
  fillTableValue(doc, 'Position classification', classification)
  fillTableValue(doc, 'Position Effective date', 'To be confirmed')
  fillTableValue(doc, 'National occupational classification', 'To be confirmed')
  fillSections(doc, sections)
  removeMarkdownArtifacts(doc)

  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc))
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}
