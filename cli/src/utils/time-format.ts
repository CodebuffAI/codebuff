import { formatTimeUntil } from '@codebuff/common/util/dates'

/**
 * Format time until reset in human-readable form, including days.
 * @param resetDate - The date when the quota/resource resets
 * @returns Human-readable string like "4d 7h" or "2h 30m"
 */
export const formatResetTimeLong = (resetDate: Date | string | null): string => {
  if (!resetDate) return ''
  return formatTimeUntil(resetDate, { fallback: 'now' })
}
