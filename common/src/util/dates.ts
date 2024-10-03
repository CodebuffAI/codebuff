export const getNextQuotaReset = (currentQuotaReset: Date | null): Date => {
  const now = new Date()
  let nextMonth = currentQuotaReset ?? now
  while (nextMonth <= now) {
    nextMonth.setMonth(nextMonth.getMonth() + 1)
  }
  return nextMonth
}
