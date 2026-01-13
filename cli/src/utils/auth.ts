import fs from 'fs'
import os from 'os'
import path from 'path'

import { getCiEnv } from '@codebuff/common/env-ci'
import { env } from '@codebuff/common/env'
import { z } from 'zod'

import type { CiEnv } from '@codebuff/common/types/contracts/env'

import { getApiClient, setApiClientAuthToken } from './codebuff-api'
import { logger } from './logger'

// User schema
const userSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  email: z.string(),
  authToken: z.string(),
  fingerprintId: z.string().optional(),
  fingerprintHash: z.string().optional(),
  credits: z.number().optional(),
})

export type User = z.infer<typeof userSchema>

// Claude OAuth credentials schema (for passthrough, not strict validation here)
const claudeOAuthSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresAt: z.number(),
    connectedAt: z.number(),
  })
  .optional()

const credentialsSchema = z
  .object({
    default: userSchema,
    claudeOAuth: claudeOAuthSchema,
  })
  .catchall(z.unknown())

// Get the config directory path
export const getConfigDir = (): string => {
  return path.join(
    os.homedir(),
    '.config',
    'manicode' +
      // on a development stack?
      (env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod'
        ? `-${env.NEXT_PUBLIC_CB_ENVIRONMENT}`
        : ''),
  )
}

// Get the credentials file path
export const getCredentialsPath = (): string => {
  return path.join(getConfigDir(), 'credentials.json')
}

/**
 * Parse user from JSON string
 */
const userFromJson = (
  json: string,
  profileName: string = 'default',
): User | undefined => {
  try {
    const allCredentials = credentialsSchema.parse(JSON.parse(json))
    const profile = allCredentials[profileName]
    // Validate that the profile matches the user schema
    const parsed = userSchema.safeParse(profile)
    return parsed.success ? parsed.data : undefined
  } catch (error) {
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        profileName,
      },
      'Error parsing user JSON',
    )
    return
  }
}

/**
 * Get user credentials from file system
 * @returns User object or null if not found/authenticated
 */
export const getUserCredentials = (): User | null => {
  const credentialsPath = getCredentialsPath()

  // Read user credentials directly from file
  if (!fs.existsSync(credentialsPath)) {
    return null
  }

  try {
    const credentialsFile = fs.readFileSync(credentialsPath, 'utf8')
    const user = userFromJson(credentialsFile)
    return user || null
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error reading credentials',
    )
    return null
  }
}

export type AuthTokenSource = 'credentials' | 'environment' | null

export interface AuthTokenDetails {
  token?: string
  source: AuthTokenSource
}

/**
 * Resolve the auth token and track where it came from.
 */
export const getAuthTokenDetails = (
  ciEnv: CiEnv = getCiEnv(),
): AuthTokenDetails => {
  const userCredentials = getUserCredentials()
  if (userCredentials?.authToken) {
    return { token: userCredentials.authToken, source: 'credentials' }
  }

  const envToken = ciEnv.CODEBUFF_API_KEY
  if (envToken) {
    return { token: envToken, source: 'environment' }
  }

  return { source: null }
}

/**
 * Get the auth token from user credentials or environment variable
 */
export const getAuthToken = (): string | undefined => {
  return getAuthTokenDetails().token
}

/**
 * Check if the user has authentication credentials (but doesn't validate them)
 */
export const hasAuthCredentials = (): boolean => {
  return !!getAuthTokenDetails().token
}

export interface AuthValidationResult {
  authenticated: boolean
  hasInvalidCredentials: boolean
}

/**
 * Save user credentials to file system
 */
export const saveUserCredentials = (user: User): void => {
  const configDir = getConfigDir()
  const credentialsPath = getCredentialsPath()

  try {
    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    // Save credentials
    fs.writeFileSync(credentialsPath, JSON.stringify({ default: user }))
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error saving credentials',
    )
    throw error
  }
}

/**
 * Clear user credentials from file system
 */
export const clearUserCredentials = (): void => {
  const credentialsPath = getCredentialsPath()

  try {
    if (fs.existsSync(credentialsPath)) {
      fs.unlinkSync(credentialsPath)
    }
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error clearing credentials',
    )
    throw error
  }
}

export async function logoutUser(): Promise<boolean> {
  try {
    const user = getUserCredentials()
    if (user?.authToken) {
      setApiClientAuthToken(user.authToken)
      const apiClient = getApiClient()
      try {
        const response = await apiClient.logout({
          userId: user.id,
          fingerprintId: user.fingerprintId,
          fingerprintHash: user.fingerprintHash,
        })
        if (!response.ok) {
          logger.error(
            { status: response.status, error: response.error },
            'Logout request failed',
          )
        }
      } catch (err) {
        logger.error(err, 'Logout request error')
      }
    }
  } catch (error) {
    logger.error(error, 'Unexpected error preparing logout')
  }

  try {
    clearUserCredentials()
  } catch (error) {
    logger.debug({ error }, 'Failed to clear credentials during logout')
  }
  return true
}
