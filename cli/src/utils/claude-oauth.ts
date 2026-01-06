/**
 * Claude OAuth PKCE flow implementation for connecting to user's Claude Pro/Max subscription.
 */

import crypto from 'crypto'
import open from 'open'
import { CLAUDE_OAUTH_CLIENT_ID } from '@codebuff/common/constants/claude-oauth'
import {
  saveClaudeOAuthCredentials,
  clearClaudeOAuthCredentials,
  getClaudeOAuthCredentials,
  isClaudeOAuthValid,
  resetClaudeOAuthRateLimit,
} from '@codebuff/sdk'

import type { ClaudeOAuthCredentials } from '@codebuff/sdk'

// PKCE code verifier and challenge generation
function generateCodeVerifier(): string {
  // Generate 32 random bytes and encode as base64url
  const buffer = crypto.randomBytes(32)
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function generateCodeChallenge(verifier: string): string {
  // SHA256 hash of the verifier, encoded as base64url
  const hash = crypto.createHash('sha256').update(verifier).digest()
  return hash
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// Store the code verifier and state during the OAuth flow
let pendingCodeVerifier: string | null = null

/**
 * Start the OAuth authorization flow.
 * Opens the browser to Anthropic's authorization page.
 * @returns The code verifier to be used when exchanging the authorization code
 */
export function startOAuthFlow(): { codeVerifier: string; authUrl: string } {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)

  // Store the code verifier and state for later use
  pendingCodeVerifier = codeVerifier

  // Build the authorization URL
  // Use claude.ai for Max subscription (same as opencode)
  const authUrl = new URL('https://claude.ai/oauth/authorize')
  authUrl.searchParams.set('code', 'true')
  authUrl.searchParams.set('client_id', CLAUDE_OAUTH_CLIENT_ID)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set(
    'redirect_uri',
    'https://console.anthropic.com/oauth/code/callback',
  )
  authUrl.searchParams.set(
    'scope',
    'org:create_api_key user:profile user:inference',
  )
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', codeVerifier) // opencode uses verifier as state

  return { codeVerifier, authUrl: authUrl.toString() }
}

/**
 * Open the browser to start OAuth flow.
 */
export async function openOAuthInBrowser(): Promise<string> {
  const { authUrl, codeVerifier } = startOAuthFlow()
  await open(authUrl)
  return codeVerifier
}

/**
 * Exchange an authorization code for access and refresh tokens.
 */
export async function exchangeCodeForTokens(
  authorizationCode: string,
  codeVerifier?: string,
): Promise<ClaudeOAuthCredentials> {
  const verifier = codeVerifier ?? pendingCodeVerifier
  if (!verifier) {
    throw new Error(
      'No code verifier found. Please start the OAuth flow again.',
    )
  }

  // The authorization code from claude.ai comes in format: code#state
  // We need to split it and send both parts
  const splits = authorizationCode.trim().split('#')
  const code = splits[0]
  const state = splits[1]

  // Use the v1 OAuth token endpoint (same as opencode)
  const response = await fetch('https://console.anthropic.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code: code,
      state: state,
      grant_type: 'authorization_code',
      client_id: CLAUDE_OAUTH_CLIENT_ID,
      redirect_uri: 'https://console.anthropic.com/oauth/code/callback',
      code_verifier: verifier,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to exchange code for tokens: ${errorText}`)
  }

  const data = await response.json()

  // Clear the pending code verifier
  pendingCodeVerifier = null

  const credentials: ClaudeOAuthCredentials = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    connectedAt: Date.now(),
  }

  // Save credentials to file
  saveClaudeOAuthCredentials(credentials)

  // Reset any cached rate limit since user just reconnected
  resetClaudeOAuthRateLimit()

  return credentials
}

/**
 * Disconnect from Claude OAuth (clear credentials).
 */
export function disconnectClaudeOAuth(): void {
  clearClaudeOAuthCredentials()
}

/**
 * Get the current Claude OAuth connection status.
 */
export function getClaudeOAuthStatus(): {
  connected: boolean
  expiresAt?: number
  connectedAt?: number
} {
  if (!isClaudeOAuthValid()) {
    return { connected: false }
  }

  const credentials = getClaudeOAuthCredentials()
  if (!credentials) {
    return { connected: false }
  }

  return {
    connected: true,
    expiresAt: credentials.expiresAt,
    connectedAt: credentials.connectedAt,
  }
}
