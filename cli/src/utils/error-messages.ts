import { sanitizeErrorMessage, getErrorStatusCode } from '@codebuff/sdk'

/**
 * Formats an unknown error into a user-facing markdown string.
 *
 * The goal is to provide clear, consistent messaging across the CLI.
 */
export function formatErrorForDisplay(error: unknown, fallbackTitle: string): string {
  const statusCode = getErrorStatusCode(error)

  // Authentication-specific messaging based on statusCode
  if (statusCode === 401) {
    return `${fallbackTitle}: Authentication failed. Please check your API key.`
  }
  if (statusCode === 403) {
    return `${fallbackTitle}: Access forbidden. You do not have permission to access this resource.`
  }

  // Network/server error messaging based on statusCode
  if (statusCode !== undefined) {
    if (statusCode === 408) {
      return `${fallbackTitle}: Request timed out. Please check your internet connection.`
    }
    if (statusCode === 503) {
      return `${fallbackTitle}: Service unavailable. The server may be down.`
    }
    if (statusCode >= 500) {
      return `${fallbackTitle}: Server error. Please try again later.`
    }
    if (statusCode === 429) {
      return `${fallbackTitle}: Rate limited. Please try again later.`
    }
  }

  // Generic Error instance
  if (error instanceof Error) {
    const message = error.message || 'An unexpected error occurred.'
    return `${fallbackTitle}: ${message}`
  }

  // Try sanitizeErrorMessage for other cases
  const safeMessage = sanitizeErrorMessage(error)
  return `${fallbackTitle}: ${safeMessage}`
}

/**
 * Formats a retry banner message for offline / retry scenarios.
 *
 * Example output:
 *   "⚠️ Network error: Server error. Please try again later. • 3 messages will retry when connection is restored"
 */
export function formatRetryBannerMessage(error: unknown, pendingCount: number): string {
  const baseTitle = 'Network error'
  const formatted = formatErrorForDisplay(error, baseTitle)

  const suffix =
    pendingCount > 0
      ? ` • ${pendingCount} message${pendingCount === 1 ? '' : 's'} will retry when connection is restored`
      : ''

  return `⚠️ ${formatted}${suffix}`
}
