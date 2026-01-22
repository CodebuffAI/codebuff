/** Detects rate limit and authentication errors for Claude OAuth fallback. */

import { getErrorStatusCode } from '../error-utils'

type ErrorDetails = {
  statusCode: number | null
  message: string
  responseBody: string
}

function getErrorDetails(error: unknown): ErrorDetails {
  const statusCode = getErrorStatusCode(error) ?? null
  const err = error as { message?: string; responseBody?: string }
  return {
    statusCode,
    message: (err.message || '').toLowerCase(),
    responseBody: (err.responseBody || '').toLowerCase(),
  }
}

export function isClaudeOAuthRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const { statusCode, message, responseBody } = getErrorDetails(error)

  if (statusCode === 429) return true
  if (message.includes('rate_limit') || message.includes('rate limit')) return true
  if (message.includes('overloaded')) return true
  if (responseBody.includes('rate_limit') || responseBody.includes('overloaded')) return true

  return false
}

/** Indicates we should try refreshing the token. */
export function isClaudeOAuthAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const { statusCode, message, responseBody } = getErrorDetails(error)

  if (statusCode === 401 || statusCode === 403) return true
  if (message.includes('unauthorized') || message.includes('invalid_token')) return true
  if (message.includes('authentication') || message.includes('expired')) return true
  if (responseBody.includes('unauthorized') || responseBody.includes('invalid_token')) return true
  if (responseBody.includes('authentication') || responseBody.includes('expired')) return true

  return false
}
