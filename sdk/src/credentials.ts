import fs from 'fs'
import path from 'node:path'
import os from 'os'

import {
  CHATGPT_OAUTH_CLIENT_ID,
  CHATGPT_OAUTH_TOKEN_URL,
} from '@codebuff/common/constants/chatgpt-oauth'
import { env } from '@codebuff/common/env'
import { userSchema } from '@codebuff/common/util/credentials'
import { z } from 'zod/v4'

import { getChatGptOAuthTokenFromEnv } from './env'

import type { ClientEnv } from '@codebuff/common/types/contracts/env'
import type { User } from '@codebuff/common/util/credentials'

const chatGptOAuthSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
  connectedAt: z.number(),
})

/**
 * Unified schema for the credentials file.
 * Contains both Codebuff user credentials and ChatGPT OAuth credentials.
 */
const credentialsFileSchema = z.object({
  default: userSchema.optional(),
  chatgptOAuth: chatGptOAuthSchema.optional(),
})

const ensureDirectoryExistsSync = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
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
 * ChatGPT OAuth credentials stored in the credentials file.
 */
export interface ChatGptOAuthCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number // Unix timestamp in milliseconds
  connectedAt: number // Unix timestamp in milliseconds
}

/**
 * Get ChatGPT OAuth credentials from environment variable or stored file.
 * Environment variable takes precedence.
 */
export const getChatGptOAuthCredentials = (
  clientEnv: ClientEnv = env,
): ChatGptOAuthCredentials | null => {
  // 1. Environment variable takes highest precedence
  const envToken = getChatGptOAuthTokenFromEnv()
  if (envToken) {
    return {
      accessToken: envToken,
      refreshToken: '',
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      connectedAt: Date.now(),
    }
  }

  // 2. Codebuff's own stored credentials
  const credentialsPath = getCredentialsPath(clientEnv)
  if (fs.existsSync(credentialsPath)) {
    try {
      const credentialsFile = fs.readFileSync(credentialsPath, 'utf8')
      const parsed = credentialsFileSchema.safeParse(JSON.parse(credentialsFile))
      if (parsed.success && parsed.data.chatgptOAuth) {
        return parsed.data.chatgptOAuth
      }
    } catch {
      // Fall through
    }
  }

  return null
}

export const saveChatGptOAuthCredentials = (
  credentials: ChatGptOAuthCredentials,
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
    chatgptOAuth: credentials,
  }

  fs.writeFileSync(credentialsPath, JSON.stringify(updatedData, null, 2))
}

export const clearChatGptOAuthCredentials = (
  clientEnv: ClientEnv = env,
): void => {
  const credentialsPath = getCredentialsPath(clientEnv)
  if (!fs.existsSync(credentialsPath)) {
    return
  }

  try {
    const existingData = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
    delete existingData.chatgptOAuth
    fs.writeFileSync(credentialsPath, JSON.stringify(existingData, null, 2))
  } catch {
    // Ignore errors
  }
}

export const isChatGptOAuthValid = (clientEnv: ClientEnv = env): boolean => {
  const credentials = getChatGptOAuthCredentials(clientEnv)
  if (!credentials) {
    return false
  }
  const bufferMs = 5 * 60 * 1000
  return credentials.expiresAt > Date.now() + bufferMs
}

let chatGptRefreshPromise: Promise<ChatGptOAuthCredentials | null> | null = null

export const refreshChatGptOAuthToken = async (
  clientEnv: ClientEnv = env,
): Promise<ChatGptOAuthCredentials | null> => {
  if (chatGptRefreshPromise) {
    return chatGptRefreshPromise
  }

  const credentials = getChatGptOAuthCredentials(clientEnv)
  if (!credentials?.refreshToken) {
    return null
  }

  chatGptRefreshPromise = (async () => {
    try {
      const response = await fetch(CHATGPT_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: credentials.refreshToken,
          client_id: CHATGPT_OAUTH_CLIENT_ID,
        }),
      })

      if (!response.ok) {
        console.debug(`ChatGPT OAuth token refresh failed (status ${response.status})`)
        return null
      }

      const data = await response.json()

      if (
        typeof data?.access_token !== 'string' ||
        data.access_token.trim().length === 0
      ) {
        console.debug('ChatGPT OAuth token refresh returned empty access token')
        return null
      }

      const expiresIn =
        typeof data.expires_in === 'number' ? data.expires_in * 1000 : 3600 * 1000

      const newCredentials: ChatGptOAuthCredentials = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? credentials.refreshToken,
        expiresAt: Date.now() + expiresIn,
        connectedAt: credentials.connectedAt,
      }

      saveChatGptOAuthCredentials(newCredentials, clientEnv)

      return newCredentials
    } catch (error) {
      console.debug('ChatGPT OAuth token refresh failed:', error instanceof Error ? error.message : String(error))
      return null
    } finally {
      chatGptRefreshPromise = null
    }
  })()

  return chatGptRefreshPromise
}

export const getValidChatGptOAuthCredentials = async (
  clientEnv: ClientEnv = env,
): Promise<ChatGptOAuthCredentials | null> => {
  const credentials = getChatGptOAuthCredentials(clientEnv)
  if (!credentials) {
    return null
  }

  const bufferMs = 5 * 60 * 1000

  // No refresh token (e.g. env var override) — return only if still valid
  if (!credentials.refreshToken) {
    return credentials.expiresAt > Date.now() + bufferMs ? credentials : null
  }

  if (credentials.expiresAt > Date.now() + bufferMs) {
    return credentials
  }

  return refreshChatGptOAuthToken(clientEnv)
}
