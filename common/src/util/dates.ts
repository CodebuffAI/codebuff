/**
 * Calculates the next quota reset date.
 * If the current reset date is in the past or null, it calculates the next
 * reset date based on the current date. Otherwise, it ensures the next
 * reset date is in the future relative to the provided date.
 *
 * @param referenceDate The user's current `next_quota_reset` date, or the date the cycle ended.
 * @returns The Date object representing the next reset time.
 */
export const getNextQuotaReset = (referenceDate: Date | null): Date => {
  const now = new Date()
  let nextMonth = new Date(referenceDate ?? now)
  while (nextMonth <= now) {
    nextMonth.setMonth(nextMonth.getMonth() + 1)
  }
  return nextMonth
}
