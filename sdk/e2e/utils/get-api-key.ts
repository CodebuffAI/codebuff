/**
 * Utility to load Codebuff API key from environment or user credentials.
 */

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
 * Skip test if no API key is available (for CI environments without credentials).
 */
export function skipIfNoApiKey(): boolean {
  return !process.env.CODEBUFF_API_KEY
}

/**
 * Check if output indicates an authentication error.
 */
export function isAuthError(output: { type: string; message?: string }): boolean {
  if (output.type !== 'error') return false
  const msg = output.message?.toLowerCase() ?? ''
  return msg.includes('authentication') || msg.includes('api key') || msg.includes('unauthorized')
}
