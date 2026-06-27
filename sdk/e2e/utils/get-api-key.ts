import { setupE2eMocks } from './e2e-mocks'

/**
 * Openbuff has no hosted API key; tests run in local/BYOK mode against mocked
 * providers unless they explicitly configure a BYOK provider. This helper is
 * retained for e2e test call-sites that still pass an `apiKey` field.
 */
export function getApiKey(): string {
  setupE2eMocks()
  return ''
}

/**
 * E2E tests should always run in local/BYOK mode.
 */
export function skipIfNoApiKey(): boolean {
  return false
}

export function getByokTestClientOptions(): { apiKey: string } {
  return { apiKey: getApiKey() }
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
