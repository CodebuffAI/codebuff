/**
 * SDK Error Utilities
 *
 * Simple utilities for error handling based on HTTP status codes.
 * Uses the AI SDK's error types which include statusCode property.
 */

/**
 * Error type with statusCode property
 */
export type HttpError = Error & { statusCode: number }

/**
 * HTTP status codes that should trigger automatic retry
 */
export const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504])

// ============================================================================
// Error Factory Functions
// ============================================================================

/**
 * Creates an Error with a statusCode property
 */
export function createHttpError(message: string, statusCode: number): HttpError {
  const error = new Error(message) as HttpError
  error.statusCode = statusCode
  return error
}

/**
 * Creates an authentication error (401)
 */
export function createAuthError(message = 'Authentication failed'): HttpError {
  return createHttpError(message, 401)
}

/**
 * Creates a forbidden error (403)
 */
export function createForbiddenError(message = 'Access forbidden'): HttpError {
  return createHttpError(message, 403)
}

/**
 * Creates a payment required error (402)
 */
export function createPaymentRequiredError(message = 'Payment required'): HttpError {
  return createHttpError(message, 402)
}

/**
 * Creates a server error (500 by default, or custom 5xx)
 */
export function createServerError(message = 'Server error', statusCode = 500): HttpError {
  return createHttpError(message, statusCode)
}

/**
 * Creates a network error (503 - service unavailable)
 * Used for connection failures, DNS errors, timeouts, etc.
 */
export function createNetworkError(message = 'Network error'): HttpError {
  return createHttpError(message, 503)
}

/**
 * Checks if an HTTP status code is retryable
 */
export function isRetryableStatusCode(statusCode: number | undefined): boolean {
  if (statusCode === undefined) return false
  return RETRYABLE_STATUS_CODES.has(statusCode)
}

/**
 * Extracts the statusCode from an error if available
 */
export function getErrorStatusCode(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode: unknown }).statusCode
    if (typeof statusCode === 'number') {
      return statusCode
    }
  }
  return undefined
}

/**
 * Sanitizes error messages for display
 * Removes sensitive information and formats for user consumption
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === 'string') {
      return message
    }
  }
  return String(error)
}
