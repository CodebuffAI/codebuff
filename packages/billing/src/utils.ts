/**
 * Generates a standardized timestamp string for operation IDs.
 * Format: YYYYMMDDHHMM (year, month, day, hour, minute)
 *
 * @param date The date to format
 * @returns A 12-character string in YYYY-MM-DDTHH:mm format
 */
export function generateOperationIdTimestamp(date: Date): string {
  return date.toISOString().slice(0, 16) // Take YYYY-MM-DDTHH:mm
}

/**
 * Gets the quota reset date (first day of the current month).
 * This is used as the start date for calculating usage in the current billing cycle.
 *
 * @param date Optional date to calculate from (defaults to current date)
 * @returns Date representing the first day of the month
 */
export function getQuotaResetDate(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}
