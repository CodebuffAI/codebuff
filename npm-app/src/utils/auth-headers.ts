import { getUserCredentials } from '../credentials'
import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'

/**
 * Get the auth token from user credentials or environment variable
 */
export function getAuthToken(): string | undefined {
  const userCredentials = getUserCredentials()
  return userCredentials?.authToken || process.env[API_KEY_ENV_VAR]
}

/**
 * Create headers with x-codebuff-api-key for API requests
 */
export function createAuthHeaders(
  contentType = 'application/json',
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': contentType,
  }

  const authToken = getAuthToken()
  if (authToken) {
    headers['x-codebuff-api-key'] = authToken
  }

  return headers
}

/**
 * Add x-codebuff-api-key to existing headers
 */
export function addAuthHeader(
  headers: Record<string, string>,
  authToken?: string,
): Record<string, string> {
  const token = authToken || getAuthToken()
  if (token) {
    return {
      ...headers,
      'x-codebuff-api-key': token,
    }
  }
  return headers
}
