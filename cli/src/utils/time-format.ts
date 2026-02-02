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

/**
 * Format time until reset in human-readable form, including days
 * @param resetDate - The date when the quota/resource resets
 * @returns Human-readable string like "4d 7h" or "2h 30m"
 */
export const formatResetTimeLong = (resetDate: Date | string | null): string => {
  if (!resetDate) return ''
  const date = typeof resetDate === 'string' ? new Date(resetDate) : resetDate
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  if (diffMs <= 0) return 'now'

  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  const remainingHours = diffHours % 24
  const remainingMins = diffMins % 60

  if (diffDays > 0) {
    return `${diffDays}d ${remainingHours}h`
  }
  if (diffHours > 0) {
    return `${diffHours}h ${remainingMins}m`
  }
  return `${diffMins}m`
}
