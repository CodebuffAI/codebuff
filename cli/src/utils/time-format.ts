/**
 * Format time until reset in human-readable form
 * @param resetDate - The date when the quota/resource resets
 * @returns Human-readable string like "2h 30m" or "45m"
 */
export const formatResetTime = (resetDate: Date | null): string => {
  if (!resetDate) return ''
  const now = new Date()
  const diffMs = resetDate.getTime() - now.getTime()
  if (diffMs <= 0) return 'now'

  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMins / 60)
  const remainingMins = diffMins % 60

  if (diffHours > 0) {
    return `${diffHours}h ${remainingMins}m`
  }
  return `${diffMins}m`
}
