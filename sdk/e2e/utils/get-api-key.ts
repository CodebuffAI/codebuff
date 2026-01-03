import { E2E_MOCK_API_KEY, setupE2eMocks } from './e2e-mocks'

const shouldRunLiveE2e = process.env.RUN_CODEBUFF_E2E === 'true'

/**
 * Utility to load Codebuff API key from environment or user credentials.
 * Defaults to a mock key for deterministic local runs.
 */
export function getApiKey(): string {
  if (shouldRunLiveE2e) {
    const apiKey = process.env.CODEBUFF_API_KEY
    if (!apiKey) {
      throw new Error(
        'CODEBUFF_API_KEY environment variable is required for live e2e tests. ' +
          'Get your API key at https://www.codebuff.com/api-keys',
      )
    }
    return apiKey
  }

  setupE2eMocks()
  process.env.CODEBUFF_API_KEY = E2E_MOCK_API_KEY
  return E2E_MOCK_API_KEY
}

/**
 * E2E tests should always run; use mock mode when not opted-in.
 */
export function skipIfNoApiKey(): boolean {
  return false
}

/**
 * Check if output indicates an authentication error.
 */
export function isAuthError(output: {
  type: string
  message?: string
}): boolean {
  if (output.type !== 'error') return false
  const msg = output.message?.toLowerCase() ?? ''
  return (
    msg.includes('authentication') ||
    msg.includes('api key') ||
    msg.includes('unauthorized')
  )
}

/**
 * Check if output indicates a network error (e.g., backend unreachable, timeout, rate limit).
 */
export function isNetworkError(output: {
  type: string
  message?: string
  statusCode?: number
}): boolean {
  if (output.type !== 'error') return false
  const msg = output.message?.toLowerCase() ?? ''
  // Check for retryable status codes (408 timeout, 429 rate limit, 5xx server errors)
  // or network-related messages
  const isRetryableStatusCode =
    output.statusCode !== undefined &&
    (output.statusCode === 408 ||
      output.statusCode === 429 ||
      output.statusCode >= 500)
  return isRetryableStatusCode || msg.includes('network error')
}
