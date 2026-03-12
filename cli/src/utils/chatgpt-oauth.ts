/**
 * ChatGPT OAuth PKCE flow for connecting a user's ChatGPT subscription.
 * Experimental and feature-flagged.
 */

import crypto from 'crypto'

import {
  CHATGPT_OAUTH_AUTHORIZE_URL,
  CHATGPT_OAUTH_CLIENT_ID,
  CHATGPT_OAUTH_REDIRECT_URI,
  CHATGPT_OAUTH_TOKEN_URL,
} from '@codebuff/common/constants/chatgpt-oauth'
import {
  clearChatGptOAuthCredentials,
  getChatGptOAuthCredentials,
  isChatGptOAuthValid,
  resetChatGptOAuthRateLimit,
  saveChatGptOAuthCredentials,
} from '@codebuff/sdk'
import open from 'open'

import type { ChatGptOAuthCredentials } from '@codebuff/sdk'

function parseOAuthTokenResponse(data: unknown): {
  accessToken: string
  refreshToken: string
  expiresInMs: number
} {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid token response format from ChatGPT OAuth.')
  }

  const tokenData = data as {
    access_token?: unknown
    refresh_token?: unknown
    expires_in?: unknown
  }

  if (
    typeof tokenData.access_token !== 'string' ||
    tokenData.access_token.trim().length === 0
  ) {
    throw new Error('Token exchange did not return a valid access token.')
  }

  const refreshToken =
    typeof tokenData.refresh_token === 'string' ? tokenData.refresh_token : ''
  const expiresInMs =
    typeof tokenData.expires_in === 'number' &&
    Number.isFinite(tokenData.expires_in) &&
    tokenData.expires_in > 0
      ? tokenData.expires_in * 1000
      : 3600 * 1000

  return {
    accessToken: tokenData.access_token,
    refreshToken,
    expiresInMs,
  }
}

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function generateCodeVerifier(): string {
  return toBase64Url(crypto.randomBytes(32))
}

function generateCodeChallenge(verifier: string): string {
  return toBase64Url(crypto.createHash('sha256').update(verifier).digest())
}

let pendingCodeVerifier: string | null = null
let pendingState: string | null = null

export function startChatGptOAuthFlow(): { codeVerifier: string; authUrl: string } {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = codeVerifier

  pendingCodeVerifier = codeVerifier
  pendingState = state

  const authUrl = new URL(CHATGPT_OAUTH_AUTHORIZE_URL)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', CHATGPT_OAUTH_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', CHATGPT_OAUTH_REDIRECT_URI)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('scope', 'openid profile email offline_access')

  return { codeVerifier, authUrl: authUrl.toString() }
}

export async function openChatGptOAuthInBrowser(): Promise<string> {
  const { authUrl, codeVerifier } = startChatGptOAuthFlow()
  await open(authUrl)
  return codeVerifier
}

function parseAuthCodeInput(input: string): { code: string; state?: string } {
  const trimmed = input.trim()

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const callback = new URL(trimmed)
    const code = callback.searchParams.get('code')
    const state = callback.searchParams.get('state') ?? undefined

    if (!code) {
      throw new Error('No authorization code found in callback URL.')
    }

    return { code, state }
  }

  return { code: trimmed }
}

export async function exchangeChatGptCodeForTokens(
  authCodeInput: string,
  codeVerifier?: string,
): Promise<ChatGptOAuthCredentials> {
  const verifier = codeVerifier ?? pendingCodeVerifier
  if (!verifier) {
    throw new Error('No PKCE verifier found. Please run /connect:chatgpt again.')
  }

  const { code, state } = parseAuthCodeInput(authCodeInput)

  if (pendingState && state && pendingState !== state) {
    throw new Error('OAuth state mismatch. Please restart /connect:chatgpt.')
  }

  const response = await fetch(CHATGPT_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CHATGPT_OAUTH_CLIENT_ID,
      redirect_uri: CHATGPT_OAUTH_REDIRECT_URI,
      code,
      code_verifier: verifier,
    }),
  })

  if (!response.ok) {
    throw new Error(
      `Failed to exchange ChatGPT OAuth code (status ${response.status}). Please retry /connect:chatgpt.`,
    )
  }

  const data = await response.json()
  const tokenResponse = parseOAuthTokenResponse(data)

  const credentials: ChatGptOAuthCredentials = {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken,
    expiresAt: Date.now() + tokenResponse.expiresInMs,
    connectedAt: Date.now(),
  }

  saveChatGptOAuthCredentials(credentials)
  resetChatGptOAuthRateLimit()
  pendingCodeVerifier = null
  pendingState = null

  return credentials
}

export function disconnectChatGptOAuth(): void {
  clearChatGptOAuthCredentials()
  resetChatGptOAuthRateLimit()
}

export function getChatGptOAuthStatus(): {
  connected: boolean
  expiresAt?: number
  connectedAt?: number
} {
  const credentials = getChatGptOAuthCredentials()
  if (!credentials) {
    return { connected: false }
  }

  if (!isChatGptOAuthValid()) {
    return { connected: false }
  }

  return {
    connected: true,
    expiresAt: credentials.expiresAt,
    connectedAt: credentials.connectedAt,
  }
}
