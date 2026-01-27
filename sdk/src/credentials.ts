import fs from 'fs'
import path from 'node:path'
import os from 'os'

import { env } from '@codebuff/common/env'
import { CLAUDE_OAUTH_CLIENT_ID } from '@codebuff/common/constants/claude-oauth'
import { CODEX_OAUTH_CLIENT_ID } from '@codebuff/common/constants/codex-oauth'
import { userSchema } from '@codebuff/common/util/credentials'
import { z } from 'zod/v4'

import { getClaudeOAuthTokenFromEnv, getCodexOAuthTokenFromEnv } from './env'

import type { ClientEnv } from '@codebuff/common/types/contracts/env'
import type { User } from '@codebuff/common/util/credentials'

/**
 * Schema for Claude OAuth credentials.
 */
const claudeOAuthSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
  connectedAt: z.number(),
})

/**
 * Schema for Codex OAuth credentials.
 */
const codexOAuthSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
  connectedAt: z.number(),
})

/**
 * Unified schema for the credentials file.
 * Contains Codebuff user credentials, Claude OAuth credentials, and Codex OAuth credentials.
 */
const credentialsFileSchema = z.object({
  default: userSchema.optional(),
  claudeOAuth: claudeOAuthSchema.optional(),
  codexOAuth: codexOAuthSchema.optional(),
})

const ensureDirectoryExistsSync = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
}

export const userFromJson = (json: string): User | null => {
  try {
    const credentials = credentialsFileSchema.parse(JSON.parse(json))
    return credentials.default ?? null
  } catch {
    return null
  }
}

/**
 * Get the config directory path based on the environment.
 * Uses the clientEnv to determine the environment suffix.
 */
export const getConfigDir = (clientEnv: ClientEnv = env): string => {
  const envSuffix =
    clientEnv.NEXT_PUBLIC_CB_ENVIRONMENT &&
    clientEnv.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod'
      ? `-${clientEnv.NEXT_PUBLIC_CB_ENVIRONMENT}`
      : ''
  return path.join(os.homedir(), '.config', `manicode${envSuffix}`)
}

/**
 * Get the credentials file path based on the environment.
 */
export const getCredentialsPath = (clientEnv: ClientEnv = env): string => {
  return path.join(getConfigDir(clientEnv), 'credentials.json')
}

export const getUserCredentials = (clientEnv: ClientEnv = env): User | null => {
  const credentialsPath = getCredentialsPath(clientEnv)
  if (!fs.existsSync(credentialsPath)) {
    return null
  }

  try {
    const credentialsFile = fs.readFileSync(credentialsPath, 'utf8')
    const user = userFromJson(credentialsFile)
    return user || null
  } catch (error) {
    console.error('Error reading credentials', error)
    return null
  }
}

/**
 * Claude OAuth credentials stored in the credentials file.
 */
export interface ClaudeOAuthCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number // Unix timestamp in milliseconds
  connectedAt: number // Unix timestamp in milliseconds
}

/**
 * Codex OAuth credentials stored in the credentials file.
 */
export interface CodexOAuthCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number // Unix timestamp in milliseconds
  connectedAt: number // Unix timestamp in milliseconds
}

/**
 * Get Claude OAuth credentials from file or environment variable.
 * Environment variable takes precedence.
 * @returns OAuth credentials or null if not found
 */
export const getClaudeOAuthCredentials = (
  clientEnv: ClientEnv = env,
): ClaudeOAuthCredentials | null => {
  // Check environment variable first
  const envToken = getClaudeOAuthTokenFromEnv()
  if (envToken) {
    // Return a synthetic credentials object for env var tokens
    // These tokens are assumed to be valid and non-expiring for simplicity
    return {
      accessToken: envToken,
      refreshToken: '',
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year from now
      connectedAt: Date.now(),
    }
  }

  const credentialsPath = getCredentialsPath(clientEnv)
  if (!fs.existsSync(credentialsPath)) {
    return null
  }

  try {
    const credentialsFile = fs.readFileSync(credentialsPath, 'utf8')
    const parsed = credentialsFileSchema.safeParse(JSON.parse(credentialsFile))
    if (!parsed.success || !parsed.data.claudeOAuth) {
      return null
    }
    return parsed.data.claudeOAuth
  } catch (error) {
    console.error('Error reading Claude OAuth credentials', error)
    return null
  }
}

/**
 * Save Claude OAuth credentials to the credentials file.
 * Preserves existing user credentials.
 */
export const saveClaudeOAuthCredentials = (
  credentials: ClaudeOAuthCredentials,
  clientEnv: ClientEnv = env,
): void => {
  const configDir = getConfigDir(clientEnv)
  const credentialsPath = getCredentialsPath(clientEnv)

  ensureDirectoryExistsSync(configDir)

  let existingData: Record<string, unknown> = {}
  if (fs.existsSync(credentialsPath)) {
    try {
      existingData = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
    } catch {
      // Ignore parse errors, start fresh
    }
  }

  const updatedData = {
    ...existingData,
    claudeOAuth: credentials,
  }

  fs.writeFileSync(credentialsPath, JSON.stringify(updatedData, null, 2), { mode: 0o600 })
}

/**
 * Clear Claude OAuth credentials from the credentials file.
 * Preserves other credentials.
 */
export const clearClaudeOAuthCredentials = (
  clientEnv: ClientEnv = env,
): void => {
  const credentialsPath = getCredentialsPath(clientEnv)
  if (!fs.existsSync(credentialsPath)) {
    return
  }

  try {
    const existingData = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
    delete existingData.claudeOAuth
    fs.writeFileSync(credentialsPath, JSON.stringify(existingData, null, 2))
  } catch {
    // Ignore errors
  }
}

/**
 * Check if Claude OAuth credentials are valid (not expired).
 * Returns true if credentials exist and haven't expired.
 */
export const isClaudeOAuthValid = (clientEnv: ClientEnv = env): boolean => {
  const credentials = getClaudeOAuthCredentials(clientEnv)
  if (!credentials) {
    return false
  }
  // Add 5 minute buffer before expiry
  const bufferMs = 5 * 60 * 1000
  return credentials.expiresAt > Date.now() + bufferMs
}

// Mutex to prevent concurrent refresh attempts
let refreshPromise: Promise<ClaudeOAuthCredentials | null> | null = null

/**
 * Refresh the Claude OAuth access token using the refresh token.
 * Returns the new credentials if successful, null if refresh fails.
 * Uses a mutex to prevent concurrent refresh attempts.
 */
export const refreshClaudeOAuthToken = async (
  clientEnv: ClientEnv = env,
): Promise<ClaudeOAuthCredentials | null> => {
  // If a refresh is already in progress, wait for it
  if (refreshPromise) {
    return refreshPromise
  }

  const credentials = getClaudeOAuthCredentials(clientEnv)
  if (!credentials?.refreshToken) {
    return null
  }

  // Start the refresh and store the promise
  refreshPromise = (async () => {
    try {
      const response = await fetch(
        'https://console.anthropic.com/v1/oauth/token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: credentials.refreshToken,
            client_id: CLAUDE_OAUTH_CLIENT_ID,
          }),
        },
      )

      if (!response.ok) {
        // Refresh failed, clear credentials
        clearClaudeOAuthCredentials(clientEnv)
        return null
      }

      const data = await response.json()

      const newCredentials: ClaudeOAuthCredentials = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? credentials.refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000,
        connectedAt: credentials.connectedAt,
      }

      // Save updated credentials
      saveClaudeOAuthCredentials(newCredentials, clientEnv)

      return newCredentials
    } catch {
      // Refresh failed, clear credentials
      clearClaudeOAuthCredentials(clientEnv)
      return null
    } finally {
      // Clear the mutex after completion
      refreshPromise = null
    }
  })()

  return refreshPromise
}

/**
 * Get valid Claude OAuth credentials, refreshing if necessary.
 * This is the main function to use when you need credentials for an API call.
 *
 * - Returns credentials immediately if valid (>5 min until expiry)
 * - Attempts refresh if token is expired or near-expiry
 * - Returns null if no credentials or refresh fails
 */
export const getValidClaudeOAuthCredentials = async (
  clientEnv: ClientEnv = env,
): Promise<ClaudeOAuthCredentials | null> => {
  const credentials = getClaudeOAuthCredentials(clientEnv)
  if (!credentials) {
    return null
  }

  // Check if token is from environment variable (synthetic credentials, no refresh needed)
  if (!credentials.refreshToken) {
    // Environment variable tokens are assumed valid
    return credentials
  }

  // Check if token is valid with 5 minute buffer
  const bufferMs = 5 * 60 * 1000
  if (credentials.expiresAt > Date.now() + bufferMs) {
    return credentials
  }

  // Token is expired or expiring soon, try to refresh
  return refreshClaudeOAuthToken(clientEnv)
}

// ============================================================================
// Codex OAuth Credentials
// ============================================================================

/**
 * Get Codex OAuth credentials from file or environment variable.
 * Environment variable takes precedence.
 * @returns OAuth credentials or null if not found
 */
export const getCodexOAuthCredentials = (
  clientEnv: ClientEnv = env,
): CodexOAuthCredentials | null => {
  // Check environment variable first
  const envToken = getCodexOAuthTokenFromEnv()
  if (envToken) {
    // Return a synthetic credentials object for env var tokens
    // These tokens are assumed to be valid and non-expiring for simplicity
    return {
      accessToken: envToken,
      refreshToken: '',
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year from now
      connectedAt: Date.now(),
    }
  }

  const credentialsPath = getCredentialsPath(clientEnv)
  if (!fs.existsSync(credentialsPath)) {
    return null
  }

  try {
    const credentialsFile = fs.readFileSync(credentialsPath, 'utf8')
    const parsed = credentialsFileSchema.safeParse(JSON.parse(credentialsFile))
    if (!parsed.success || !parsed.data.codexOAuth) {
      return null
    }
    return parsed.data.codexOAuth
  } catch (error) {
    console.error('Error reading Codex OAuth credentials', error)
    return null
  }
}

/**
 * Save Codex OAuth credentials to the credentials file.
 * Preserves existing user credentials.
 */
export const saveCodexOAuthCredentials = (
  credentials: CodexOAuthCredentials,
  clientEnv: ClientEnv = env,
): void => {
  const configDir = getConfigDir(clientEnv)
  const credentialsPath = getCredentialsPath(clientEnv)

  ensureDirectoryExistsSync(configDir)

  let existingData: Record<string, unknown> = {}
  if (fs.existsSync(credentialsPath)) {
    try {
      existingData = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
    } catch {
      // Ignore parse errors, start fresh
    }
  }

  const updatedData = {
    ...existingData,
    codexOAuth: credentials,
  }

  fs.writeFileSync(credentialsPath, JSON.stringify(updatedData, null, 2), { mode: 0o600 })
}

/**
 * Clear Codex OAuth credentials from the credentials file.
 * Preserves other credentials.
 */
export const clearCodexOAuthCredentials = (
  clientEnv: ClientEnv = env,
): void => {
  const credentialsPath = getCredentialsPath(clientEnv)
  if (!fs.existsSync(credentialsPath)) {
    return
  }

  try {
    const existingData = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
    delete existingData.codexOAuth
    fs.writeFileSync(credentialsPath, JSON.stringify(existingData, null, 2))
  } catch {
    // Ignore errors
  }
}

/**
 * Check if Codex OAuth credentials are valid (not expired).
 * Returns true if credentials exist and haven't expired.
 */
export const isCodexOAuthValid = (clientEnv: ClientEnv = env): boolean => {
  const credentials = getCodexOAuthCredentials(clientEnv)
  if (!credentials) {
    return false
  }
  // Add 5 minute buffer before expiry
  const bufferMs = 5 * 60 * 1000
  return credentials.expiresAt > Date.now() + bufferMs
}

// Mutex to prevent concurrent Codex refresh attempts
let codexRefreshPromise: Promise<CodexOAuthCredentials | null> | null = null

/**
 * Refresh the Codex OAuth access token using the refresh token.
 * Returns the new credentials if successful, null if refresh fails.
 * Uses a mutex to prevent concurrent refresh attempts.
 */
export const refreshCodexOAuthToken = async (
  clientEnv: ClientEnv = env,
): Promise<CodexOAuthCredentials | null> => {
  // If a refresh is already in progress, wait for it
  if (codexRefreshPromise) {
    return codexRefreshPromise
  }

  const credentials = getCodexOAuthCredentials(clientEnv)
  if (!credentials?.refreshToken) {
    return null
  }

  // Start the refresh and store the promise
  codexRefreshPromise = (async () => {
    try {
      // IMPORTANT: Use application/x-www-form-urlencoded, NOT application/json
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken,
        client_id: CODEX_OAUTH_CLIENT_ID,
      })

      const response = await fetch(
        'https://auth.openai.com/oauth/token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        },
      )

      if (!response.ok) {
        // Refresh failed, clear credentials
        clearCodexOAuthCredentials(clientEnv)
        return null
      }

      const data = await response.json()

      const newCredentials: CodexOAuthCredentials = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? credentials.refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000,
        connectedAt: credentials.connectedAt,
      }

      // Save updated credentials
      saveCodexOAuthCredentials(newCredentials, clientEnv)

      return newCredentials
    } catch {
      // Refresh failed, clear credentials
      clearCodexOAuthCredentials(clientEnv)
      return null
    } finally {
      // Clear the mutex after completion
      codexRefreshPromise = null
    }
  })()

  return codexRefreshPromise
}

/**
 * Get valid Codex OAuth credentials, refreshing if necessary.
 * This is the main function to use when you need credentials for an API call.
 *
 * - Returns credentials immediately if valid (>5 min until expiry)
 * - Attempts refresh if token is expired or near-expiry
 * - Returns null if no credentials or refresh fails
 */
export const getValidCodexOAuthCredentials = async (
  clientEnv: ClientEnv = env,
): Promise<CodexOAuthCredentials | null> => {
  const credentials = getCodexOAuthCredentials(clientEnv)
  if (!credentials) {
    return null
  }

  // Check if token is from environment variable (synthetic credentials, no refresh needed)
  if (!credentials.refreshToken) {
    // Environment variable tokens are assumed valid
    return credentials
  }

  // Check if token is valid with 5 minute buffer
  const bufferMs = 5 * 60 * 1000
  if (credentials.expiresAt > Date.now() + bufferMs) {
    return credentials
  }

  // Token is expired or expiring soon, try to refresh
  return refreshCodexOAuthToken(clientEnv)
}
