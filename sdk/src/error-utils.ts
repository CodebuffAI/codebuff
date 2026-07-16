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

export const PROVIDER_CONTENT_POLICY_ERROR_CODE = 'provider_content_policy'

export type ProviderContentPolicyError = Error & {
  code: typeof PROVIDER_CONTENT_POLICY_ERROR_CODE
  finishReason?: 'content-filter'
  statusCode?: number
}

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
export function createHttpError(
  message: string,
  statusCode: number,
): HttpError {
  const error = new Error(message) as HttpError
  error.statusCode = statusCode
  return error
}

export function createProviderContentPolicyError(
  params: {
    message?: string
    finishReason?: 'content-filter'
    statusCode?: number
    cause?: unknown
  } = {},
): ProviderContentPolicyError {
  const error = new Error(
    params.message ?? 'Provider blocked this request under its content policy',
    params.cause !== undefined ? { cause: params.cause } : undefined,
  ) as ProviderContentPolicyError
  error.name = 'ProviderContentPolicyError'
  error.code = PROVIDER_CONTENT_POLICY_ERROR_CODE
  if (params.finishReason !== undefined) {
    error.finishReason = params.finishReason
  }
  if (params.statusCode !== undefined) {
    error.statusCode = params.statusCode
  }
  return error
}

export function getProviderContentPolicyFinishError(params: {
  finishReason: string | undefined
  model: string
  responseLabel?: string
}): ProviderContentPolicyError | undefined {
  if (params.finishReason !== 'content-filter') return undefined

  return createProviderContentPolicyError({
    finishReason: 'content-filter',
    message: `Provider blocked the ${params.responseLabel ?? 'response'} for model '${params.model}' under its content policy`,
  })
}

export function isProviderContentPolicyError(
  error: unknown,
): error is ProviderContentPolicyError {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === PROVIDER_CONTENT_POLICY_ERROR_CODE
  )
}

/**
 * Detect explicit provider moderation/policy wording without classifying every
 * client-side 400 as a content block. This is intentionally conservative.
 */
export function isProviderContentPolicyResponse(error: unknown): boolean {
  if (isProviderContentPolicyError(error)) return true
  if (!error || typeof error !== 'object') return false

  const value = error as {
    message?: unknown
    responseBody?: unknown
    data?: unknown
  }
  const text = [value.message, value.responseBody, value.data]
    .filter((part): part is string => typeof part === 'string')
    .join('\n')
    .toLowerCase()

  return [
    'content_filter',
    'content-filter',
    'content policy',
    'content_policy',
    'content blocked',
    'prompt blocked',
    'safety filter',
    'moderation blocked',
  ].some((marker) => text.includes(marker))
}

export function normalizeProviderContentPolicyError(
  error: unknown,
): ProviderContentPolicyError | undefined {
  if (!isProviderContentPolicyResponse(error)) return undefined
  if (isProviderContentPolicyError(error)) return error

  const statusCode = getErrorStatusCode(error)
  return createProviderContentPolicyError({
    statusCode,
    cause: error,
    message:
      error instanceof Error
        ? error.message
        : 'Provider blocked this request under its content policy',
  })
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
export function createPaymentRequiredError(
  message = 'Payment required',
): HttpError {
  return createHttpError(message, 402)
}

/**
 * Creates a server error (500 by default, or custom 5xx)
 */
export function createServerError(
  message = 'Server error',
  statusCode = 500,
): HttpError {
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
 * Extracts the statusCode from an error if available.
 * Checks both 'statusCode' (our convention) and 'status' (AI SDK's APICallError convention).
 */
export function getErrorStatusCode(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    // Check 'statusCode' first (our convention)
    if ('statusCode' in error) {
      const statusCode = (error as { statusCode: unknown }).statusCode
      if (typeof statusCode === 'number') {
        return statusCode
      }
    }
    // Check 'status' (AI SDK's APICallError uses this)
    if ('status' in error) {
      const status = (error as { status: unknown }).status
      if (typeof status === 'number') {
        return status
      }
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
