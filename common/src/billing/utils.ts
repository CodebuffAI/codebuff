/**
 * Generates a standardized timestamp string for operation IDs.
 * Format: YYYYMMDDHHMM (year, month, day, hour, minute)
 *
 * @param date The date to format
 * @returns A 12-character string in YYYYMMDDHHMM format
 */
export function generateOperationIdTimestamp(date: Date): string {
  return date.toISOString().slice(0, 16) // Take YYYY-MM-DDTHH:mm
}
