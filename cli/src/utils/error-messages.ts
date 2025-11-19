/**
 * Standardized error message formatting utilities
 * Ensures consistent error messaging across the application
 */

import type { ErrorCode } from '@codebuff/sdk'

export interface FormattedError {
  title: string
  message: string
  guidance?: string
  retryable: boolean
}

/**
 * Formats an error into a consistent user-facing message
 */
export function formatErrorMessage(
  error: unknown,
  context?: string,
): FormattedError {
  // Handle null/undefined
  if (error === null || error === undefined) {
    return {
      title: context || 'Error',
      message: 'Unknown error',
      retryable: false,
    }
  }

  const errorWithCode = error as { code?: ErrorCode; message?: string }
  const errorMessage =
    errorWithCode.message || (typeof error === 'string' ? error : 'Unknown error')

  switch (errorWithCode.code) {
    case 'AUTH_FAILED':
      return {
        title: 'Authentication Failed',
        message: 'Your credentials are invalid or have expired.',
        guidance:
          'Please verify your API key is correct and try logging in again.',
        retryable: false,
      }

    case 'NETWORK_ERROR':
      return {
        title: 'Network Error',
        message: errorMessage,
        guidance:
          'Check your internet connection and ensure the server is reachable.',
        retryable: true,
      }

    case 'TIMEOUT':
      return {
        title: 'Request Timeout',
        message: 'The request took too long to complete.',
        guidance: 'The server may be experiencing high load. Please try again.',
        retryable: true,
      }

    case 'CONNECTION_LOST':
      return {
        title: 'Connection Lost',
        message: 'The connection to the server was interrupted.',
        guidance: 'Your message will be retried when the connection is restored.',
        retryable: true,
      }

    case 'VALIDATION_ERROR':
      return {
        title: 'Validation Error',
        message: errorMessage,
        guidance: 'Please check your input and try again.',
        retryable: false,
      }

    case 'INTERNAL_ERROR':
      return {
        title: 'Internal Error',
        message: errorMessage,
        guidance: 'An unexpected error occurred. Please try again later.',
        retryable: false,
      }

    default:
      return {
        title: context ? `Error: ${context}` : 'Error',
        message: errorMessage,
        guidance: 'Please try again or contact support if the issue persists.',
        retryable: false,
      }
  }
}

/**
 * Formats an error for display in the CLI
 */
export function formatErrorForDisplay(error: unknown, context?: string): string {
  const formatted = formatErrorMessage(error, context)
  const parts = [`**${formatted.title}:** ${formatted.message}`]

  if (formatted.guidance) {
    parts.push(`*${formatted.guidance}*`)
  }

  return parts.join('\n\n')
}

/**
 * Formats an error for retry banner display
 */
export function formatRetryBannerMessage(
  error: unknown,
  pendingCount: number,
): string {
  const formatted = formatErrorMessage(error)
  const baseMessage = `⚠️ ${formatted.title}: ${formatted.message}`

  const retryMessage =
    pendingCount > 0 && formatted.retryable
      ? ` • ${pendingCount} message${
          pendingCount === 1 ? '' : 's'
        } will retry when the connection is restored`
      : ''

  const guidance = formatted.guidance ? ` • ${formatted.guidance}` : ''

  return `${baseMessage}${retryMessage}${guidance}`
}

/**
 * Determines if an error message should show retry information
 */
export function shouldShowRetryInfo(error: unknown): boolean {
  const formatted = formatErrorMessage(error)
  return formatted.retryable
}
