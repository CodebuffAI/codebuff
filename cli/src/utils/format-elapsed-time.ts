/**
 * Format elapsed seconds into a human-readable string.
 * - Under 60 seconds: "Xs"
 * - 60-3599 seconds (1-59 minutes): "Xm"
 * - 3600+ seconds (1+ hours): "Xh"
 */
export const formatElapsedTime = (elapsedSeconds: number): string => {
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`
  }
  
  if (elapsedSeconds < 3600) {
    const minutes = Math.floor(elapsedSeconds / 60)
    return `${minutes}m`
  }
  
  const hours = Math.floor(elapsedSeconds / 3600)
  return `${hours}h`
}
