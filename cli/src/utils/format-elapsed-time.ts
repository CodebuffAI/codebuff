/**
 * Format elapsed seconds into a human-readable string.
 *
 * @param elapsedSeconds - Number of seconds elapsed (should be non-negative)
 * @returns Formatted time string
 *
 * @example
 * formatElapsedTime(30)    // "30s"
 * formatElapsedTime(60)    // "1m"
 * formatElapsedTime(90)    // "1m 30s"
 * formatElapsedTime(3600)  // "1h"
 * formatElapsedTime(3700)  // "1h 1m"
 *
 * Format rules:
 * - Under 60 seconds: "Xs" (e.g., "45s")
 * - 60-3599 seconds (1-59 minutes): "Xm" or "Xm Ys" (e.g., "1m", "12m 5s")
 * - 3600+ seconds (1+ hours): "Xh" or "Xh Ym" (e.g., "1h", "2h 15m")
 */
export const formatElapsedTime = (elapsedSeconds: number): string => {
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`
  }

  const hours = Math.floor(elapsedSeconds / 3600)
  const minutes = Math.floor((elapsedSeconds % 3600) / 60)
  const seconds = elapsedSeconds % 60

  if (hours > 0) {
    return `${hours}h` + (minutes > 0 ? ` ${minutes}m` : '')
  }

  return `${minutes}m` + (seconds > 0 ? ` ${seconds}s` : '')
}
