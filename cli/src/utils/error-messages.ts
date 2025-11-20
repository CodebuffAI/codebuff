import {
  AuthenticationError,
  NetworkError,
  ErrorCodes,
  isErrorWithCode,
  sanitizeErrorMessage,
} from '@codebuff/sdk'

/**
 * Formats an unknown error into a user-facing markdown string.
 *
 * The goal is to provide clear, consistent messaging across the CLI while
 * reusing the SDK error typing and sanitization logic.
 */
export function formatErrorForDisplay(error: unknown, fallbackTitle: string): string {
  // Authentication-specific messaging
  if (error instanceof AuthenticationError) {
    if (error.status === 401) {
      return `${fallbackTitle}: Authentication failed. Please check your API key.`
    }

    if (error.status === 403) {
      return `${fallbackTitle}: Access forbidden. You do not have permission to access this resource.`
    }

    return `${fallbackTitle}: Invalid API key. Please check your credentials.`
  }

  // Network-specific messaging
  if (error instanceof NetworkError) {
    let detail: string

    switch (error.code) {
      case ErrorCodes.TIMEOUT:
        detail = 'Request timed out. Please check your internet connection.'
        break
      case ErrorCodes.CONNECTION_REFUSED:
        detail = 'Connection refused. The server may be down.'
        break
      case ErrorCodes.DNS_FAILURE:
        detail = 'DNS resolution failed. Please check your internet connection.'
        break
      case ErrorCodes.SERVER_ERROR:
      case ErrorCodes.SERVICE_UNAVAILABLE:
        detail = 'Server error. Please try again later.'
        break
      case ErrorCodes.NETWORK_ERROR:
      default:
        detail = 'Network error. Please check your internet connection.'
        break
    }

    return `${fallbackTitle}: ${detail}`
  }

  // Any other typed error that exposes a code
  if (isErrorWithCode(error)) {
    const safeMessage = sanitizeErrorMessage(error)
    return `${fallbackTitle}: ${safeMessage}`
  }

  // Generic Error instance
  if (error instanceof Error) {
    const message = error.message || 'An unexpected error occurred.'
    return `${fallbackTitle}: ${message}`
  }

  // Fallback for unknown values
  return `${fallbackTitle}: ${String(error)}`
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
