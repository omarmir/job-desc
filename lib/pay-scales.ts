import payscales from '~/resources/payscales.json'
import type { DraftInput } from '~/lib/types'

interface PayScaleStep {
  step: number | string
  amount: number[]
}

interface PayScaleAgreement {
  effectiveDate: string
  rateStepsList: PayScaleStep[]
}

interface PayScaleEntry {
  grpLvl: string
  group: string
  level: string
  rateAgreements: PayScaleAgreement[]
}

export interface PayScaleDisplay {
  code: string
  effectiveDate: string
  steps: Array<{
    step: string
    amount: string
  }>
  range: string
}

const PAY_SCALE_ENTRIES = payscales as PayScaleEntry[]

function normalizeLevel(level?: string): string | null {
  const match = level?.match(/\d+/)
  if (!match) return null

  const normalized = String(Number(match[0]))
  return normalized === 'NaN' ? null : normalized
}

function normalizeGroup(input: DraftInput): string {
  return input.selectedCode.trim().toUpperCase()
}

function latestAgreement(entry: PayScaleEntry): PayScaleAgreement | null {
  return [...entry.rateAgreements]
    .filter((agreement) => agreement.effectiveDate && agreement.rateStepsList?.length)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
    .at(-1) ?? null
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatAmount(amount: number[]): string {
  const values = amount.filter((value) => Number.isFinite(value))
  if (!values.length) return 'To be confirmed'
  if (values.length === 1) return formatCurrency(values[0] ?? 0)

  const min = Math.min(...values)
  const max = Math.max(...values)
  return min === max ? formatCurrency(min) : `${formatCurrency(min)} to ${formatCurrency(max)}`
}

export function getPayScalesForDraft(input: DraftInput): PayScaleDisplay[] {
  const group = normalizeGroup(input)
  const level = normalizeLevel(input.selectedLevel) ?? normalizeLevel(input.fullClassification)

  if (!group || !level) {
    return []
  }

  return PAY_SCALE_ENTRIES
    .filter((entry) => entry.group.toUpperCase() === group && normalizeLevel(entry.level) === level)
    .map((entry) => {
      const agreement = latestAgreement(entry)
      if (!agreement) return null

      const steps = agreement.rateStepsList.map((step) => ({
        step: String(step.step),
        amount: formatAmount(step.amount),
      }))
      const numericAmounts = agreement.rateStepsList.flatMap((step) =>
        step.amount.filter((value) => Number.isFinite(value)),
      )
      const range = numericAmounts.length
        ? `${formatCurrency(Math.min(...numericAmounts))} to ${formatCurrency(Math.max(...numericAmounts))}`
        : 'To be confirmed'

      return {
        code: entry.grpLvl,
        effectiveDate: agreement.effectiveDate,
        steps,
        range,
      }
    })
    .filter((entry): entry is PayScaleDisplay => Boolean(entry))
}
