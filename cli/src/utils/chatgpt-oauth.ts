/**
 * ChatGPT OAuth PKCE flow for connecting a user's ChatGPT subscription.
 * Experimental and feature-flagged.
 */

import crypto from 'crypto'
import http from 'http'

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
  authUrl.searchParams.set('id_token_add_organizations', 'true')
  authUrl.searchParams.set('codex_cli_simplified_flow', 'true')
  authUrl.searchParams.set('originator', 'codex_cli_rs')

  return { codeVerifier, authUrl: authUrl.toString() }
}

const CALLBACK_SERVER_TIMEOUT_MS = 5 * 60 * 1000

let callbackServer: http.Server | null = null

export function stopChatGptOAuthServer(): void {
  if (callbackServer) {
    try { callbackServer.close() } catch { /* ignore */ }
    callbackServer = null
  }
  pendingCodeVerifier = null
  pendingState = null
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function callbackPageHtml(success: boolean, errorMessage?: string): string {
  const title = success ? 'Connected — Codebuff' : 'Connection Failed — Codebuff'
  const heading = success ? '✓ Connected to ChatGPT' : 'Connection Failed'
  const headingColor = success ? '#4ade80' : '#f87171'
  const body = success
    ? 'You can close this tab and return to Codebuff.'
    : `${escapeHtml(errorMessage ?? 'Unknown error')}. Return to Codebuff and try /connect:chatgpt again.`
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5">
<div style="text-align:center;padding:2rem">
<h1 style="color:${headingColor};margin-bottom:0.5rem">${heading}</h1>
<p style="color:#a3a3a3">${body}</p>
</div></body></html>`
}

function startCallbackServer(codeVerifier: string): Promise<ChatGptOAuthCredentials> {
  const redirectUrl = new URL(CHATGPT_OAUTH_REDIRECT_URI)
  const port = parseInt(redirectUrl.port, 10)
  const callbackPath = redirectUrl.pathname

  return new Promise<ChatGptOAuthCredentials>((resolve, reject) => {
    const timeout = setTimeout(() => {
      stopChatGptOAuthServer()
      reject(new Error('Timeout waiting for ChatGPT authorization'))
    }, CALLBACK_SERVER_TIMEOUT_MS)

    const server = http.createServer(async (req, res) => {
      const reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)

      if (reqUrl.pathname !== callbackPath) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not found')
        return
      }

      const code = reqUrl.searchParams.get('code')
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(callbackPageHtml(false, 'No authorization code received.'))
        clearTimeout(timeout)
        stopChatGptOAuthServer()
        reject(new Error('No authorization code in callback'))
        return
      }

      const state = reqUrl.searchParams.get('state')
      if (pendingState && (!state || state !== pendingState)) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(callbackPageHtml(false, 'OAuth state mismatch. Please try again.'))
        clearTimeout(timeout)
        stopChatGptOAuthServer()
        reject(new Error('OAuth state mismatch in callback'))
        return
      }

      try {
        const fullCallbackUrl = `${CHATGPT_OAUTH_REDIRECT_URI}${reqUrl.search}`
        const credentials = await exchangeChatGptCodeForTokens(fullCallbackUrl, codeVerifier)

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(callbackPageHtml(true))

        clearTimeout(timeout)
        stopChatGptOAuthServer()
        resolve(credentials)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Token exchange failed'
        res.writeHead(500, { 'Content-Type': 'text/html' })
        res.end(callbackPageHtml(false, message))

        clearTimeout(timeout)
        stopChatGptOAuthServer()
        reject(err instanceof Error ? err : new Error(message))
      }
    })

    server.on('error', (err) => {
      clearTimeout(timeout)
      callbackServer = null
      reject(err)
    })

    server.listen(port, '127.0.0.1', () => {
      callbackServer = server
    })
  })
}

export function connectChatGptOAuth(): {
  authUrl: string
  credentials: Promise<ChatGptOAuthCredentials>
} {
  stopChatGptOAuthServer()

  const { codeVerifier, authUrl } = startChatGptOAuthFlow()
  const credentials = startCallbackServer(codeVerifier)

  open(authUrl).catch(() => {
    console.debug(
      'Failed to open browser for ChatGPT OAuth. Manual URL:',
      authUrl,
    )
  })

  return { authUrl, credentials }
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
  stopChatGptOAuthServer()
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
