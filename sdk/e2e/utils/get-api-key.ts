/**
 * Utility to load Codebuff API key from environment or user credentials.
 */

import { CodebuffClient } from '../../src'
import { BACKEND_URL, WEBSITE_URL } from '../../src/constants'

let backendCheckPromise: Promise<void> | null = null

export function getApiKey(): string {
  const apiKey = process.env.CODEBUFF_API_KEY

  if (!apiKey) {
    throw new Error(
      'CODEBUFF_API_KEY environment variable is required for e2e tests. ' +
        'Get your API key at https://www.codebuff.com/api-keys',
    )
  }

  return apiKey
}

/**
 * Require an API key and return it (fails fast if missing).
 */
export function requireApiKey(): string {
  return getApiKey()
}

/**
 * Ensure the configured backend is reachable with the provided API key.
 * Cached after the first successful check to avoid repeated network calls.
 */
export async function ensureBackendConnection(): Promise<void> {
  if (backendCheckPromise) {
    return backendCheckPromise
  }

  const apiKey = getApiKey()
  const client = new CodebuffClient({ apiKey })

  backendCheckPromise = (async () => {
    const isConnected = await client.checkConnection()
    if (!isConnected) {
      throw new Error(
        `Backend not reachable. Tried WEBSITE_URL=${WEBSITE_URL} and BACKEND_URL=${BACKEND_URL}. ` +
          'Verify the backend is up and the API key is valid.',
      )
    }
  })()

  return backendCheckPromise
}

/**
 * Check if output indicates an authentication error.
 */
export function isAuthError(output: { type: string; message?: string }): boolean {
  if (output.type !== 'error') return false
  const msg = output.message?.toLowerCase() ?? ''
  return msg.includes('authentication') || msg.includes('api key') || msg.includes('unauthorized')
}
