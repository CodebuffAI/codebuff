import { resolution } from 'common/contract'

const OUTCOME_TO_COLOR_TEXT = {
  YES: 'text-teal-600',
  NO: 'text-scarlet-600 ',
  CANCEL: 'text-ink-400',
  MKT: 'text-blue-600 dark:text-blue-200',
}

export function getTextColor(contract: {
  resolution?: string
  closeTime?: number
}) {
  const { resolution } = contract

  if (resolution) {
    return OUTCOME_TO_COLOR_TEXT[resolution as resolution] ?? 'text-primary-200'
  }
  if ((contract.closeTime ?? Infinity) < Date.now()) {
    return 'text-ink-600'
  }

  return 'text-ink-900'
}
