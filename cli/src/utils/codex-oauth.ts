/**
 * Codex OAuth PKCE flow implementation for connecting to user's ChatGPT Plus/Pro subscription.
 */

import crypto from 'crypto'
import http from 'http'
import open from 'open'
import {
  CODEX_OAUTH_CLIENT_ID,
  CODEX_OAUTH_AUTHORIZE_URL,
  CODEX_OAUTH_SCOPES,
  CODEX_OAUTH_REDIRECT_URI,
} from '@codebuff/common/constants/codex-oauth'
import {
  saveCodexOAuthCredentials,
  clearCodexOAuthCredentials,
  getCodexOAuthCredentials,
  isCodexOAuthValid,
  resetCodexOAuthRateLimit,
} from '@codebuff/sdk'

import type { CodexOAuthCredentials } from '@codebuff/sdk'
import type { Server } from 'http'

// Port for the local OAuth callback server
const OAUTH_CALLBACK_PORT = 1455

/**
 * Generate a nicely styled success HTML page for OAuth callback.
 */
function getSuccessPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorization Successful - Codebuff</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
    }
    .container {
      text-align: center;
      padding: 40px;
      max-width: 480px;
    }
    .icon {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      box-shadow: 0 10px 40px rgba(16, 185, 129, 0.3);
    }
    .icon svg {
      width: 40px;
      height: 40px;
      stroke: white;
      stroke-width: 3;
      fill: none;
    }
    h1 {
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #fff;
    }
    p {
      font-size: 16px;
      color: #94a3b8;
      line-height: 1.6;
    }
    .hint {
      margin-top: 32px;
      padding: 16px 24px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .hint p {
      font-size: 14px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
    </div>
    <h1>Authorization Successful</h1>
    <p>Your ChatGPT Plus/Pro subscription has been connected to Codebuff.</p>
    <div class="hint">
      <p>You can close this window and return to the terminal.</p>
    </div>
  </div>
</body>
</html>`
}

/**
 * Generate a nicely styled error HTML page for OAuth callback.
 */
function getErrorPage(errorMessage: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorization Failed - Codebuff</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
    }
    .container {
      text-align: center;
      padding: 40px;
      max-width: 480px;
    }
    .icon {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      box-shadow: 0 10px 40px rgba(239, 68, 68, 0.3);
    }
    .icon svg {
      width: 40px;
      height: 40px;
      stroke: white;
      stroke-width: 3;
      fill: none;
    }
    h1 {
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #fff;
    }
    .error-message {
      font-size: 16px;
      color: #fca5a5;
      line-height: 1.6;
      margin-bottom: 8px;
    }
    p {
      font-size: 16px;
      color: #94a3b8;
      line-height: 1.6;
    }
    .hint {
      margin-top: 32px;
      padding: 16px 24px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .hint p {
      font-size: 14px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </div>
    <h1>Authorization Failed</h1>
    <p class="error-message">${escapeHtml(errorMessage)}</p>
    <div class="hint">
      <p>You can close this window and try again from the terminal.</p>
    </div>
  </div>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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

function generateState(): string {
  return crypto.randomBytes(16).toString('hex')
}

// Store the code verifier and state during the OAuth flow
let pendingCodeVerifier: string | null = null
let pendingState: string | null = null
let callbackServer: Server | null = null

/**
 * Start the OAuth authorization flow.
 * Opens the browser to OpenAI's authorization page.
 * @returns The code verifier, state, and auth URL
 */
export function startOAuthFlow(): { codeVerifier: string; state: string; authUrl: string } {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateState()

  // Store the code verifier and state for later use
  pendingCodeVerifier = codeVerifier
  pendingState = state

  // Build the authorization URL
  const authUrl = new URL(CODEX_OAUTH_AUTHORIZE_URL)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', CODEX_OAUTH_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', CODEX_OAUTH_REDIRECT_URI)
  authUrl.searchParams.set('scope', CODEX_OAUTH_SCOPES)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', state)
  // Additional parameters required by OpenAI's Codex OAuth flow
  authUrl.searchParams.set('id_token_add_organizations', 'true')
  authUrl.searchParams.set('codex_cli_simplified_flow', 'true')
  authUrl.searchParams.set('originator', 'codex_cli_rs')

  return { codeVerifier, state, authUrl: authUrl.toString() }
}

/**
 * Stop the callback server if it's running.
 */
export function stopCallbackServer(): void {
  if (callbackServer) {
    callbackServer.close()
    callbackServer = null
  }
}

/**
 * Start the OAuth flow with a local callback server.
 * This starts a local HTTP server to catch the OAuth redirect,
 * opens the browser, and returns a promise that resolves with the credentials.
 */
export function startOAuthFlowWithCallback(
  onStatusChange?: (status: 'waiting' | 'success' | 'error', message?: string) => void,
): Promise<CodexOAuthCredentials> {
  return new Promise((resolve, reject) => {
    const { authUrl, codeVerifier, state } = startOAuthFlow()

    // Stop any existing server
    stopCallbackServer()

    // Create local server to catch the callback
    callbackServer = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${OAUTH_CALLBACK_PORT}`)

      if (url.pathname === '/auth/callback') {
        const code = url.searchParams.get('code')
        const returnedState = url.searchParams.get('state')
        const error = url.searchParams.get('error')
        const errorDescription = url.searchParams.get('error_description')

        // Handle error response from OAuth provider
        if (error) {
          const errorMsg = errorDescription || error
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(getErrorPage(errorMsg))
          stopCallbackServer()
          onStatusChange?.('error', errorMsg)
          reject(new Error(errorMsg))
          return
        }

        // Verify state matches
        if (returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(getErrorPage('State mismatch - possible CSRF attack.'))
          stopCallbackServer()
          onStatusChange?.('error', 'State mismatch')
          reject(new Error('State mismatch - possible CSRF attack'))
          return
        }

        if (code) {
          try {
            // Exchange the code for tokens
            const credentials = await exchangeCodeForTokens(code, codeVerifier)

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(getSuccessPage())
            stopCallbackServer()
            onStatusChange?.('success')
            resolve(credentials)
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Token exchange failed'
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(getErrorPage(errorMsg))
            stopCallbackServer()
            onStatusChange?.('error', errorMsg)
            reject(err)
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(getErrorPage('No authorization code received.'))
          stopCallbackServer()
          onStatusChange?.('error', 'No authorization code received')
          reject(new Error('No authorization code received'))
        }
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
    })

    callbackServer.on('error', (err) => {
      const nodeErr = err as NodeJS.ErrnoException
      if (nodeErr.code === 'EADDRINUSE') {
        onStatusChange?.('error', `Port ${OAUTH_CALLBACK_PORT} is already in use`)
        reject(new Error(`Port ${OAUTH_CALLBACK_PORT} is already in use. Please close any other OAuth flows.`))
      } else {
        onStatusChange?.('error', err.message)
        reject(err)
      }
    })

    // Bind to loopback only for security - prevents remote access to the callback server
    callbackServer.listen(OAUTH_CALLBACK_PORT, '127.0.0.1', async () => {
      onStatusChange?.('waiting')
      try {
        await open(authUrl)
      } catch {
        // Browser open failed - surface the URL so the user can open it manually
        onStatusChange?.('waiting', authUrl)
      }
    })
  })
}

/**
 * Open the browser to start OAuth flow (legacy - for manual code entry).
 * @deprecated Use startOAuthFlowWithCallback instead for automatic callback handling.
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
): Promise<CodexOAuthCredentials> {
  const verifier = codeVerifier ?? pendingCodeVerifier
  if (!verifier) {
    throw new Error(
      'No code verifier found. Please start the OAuth flow again.',
    )
  }

  // The authorization code might be a full callback URL or just the code
  let code: string
  const trimmed = authorizationCode.trim()
  try {
    const parsed = new URL(trimmed)
    const extractedCode = parsed.searchParams.get('code')
    code = extractedCode ?? trimmed.split('#')[0]
  } catch {
    // Not a URL - treat as a raw authorization code
    code = trimmed.split('#')[0]
  }

  // Exchange the code for tokens
  // IMPORTANT: Use application/x-www-form-urlencoded, NOT application/json
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CODEX_OAUTH_CLIENT_ID,
    code: code,
    code_verifier: verifier,
    redirect_uri: CODEX_OAUTH_REDIRECT_URI,
  })

  const response = await fetch('https://auth.openai.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to exchange code for tokens: ${errorText}`)
  }

  const data = await response.json()

  // Clear the pending code verifier and state
  pendingCodeVerifier = null
  pendingState = null

  const credentials: CodexOAuthCredentials = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    connectedAt: Date.now(),
  }

  // Save credentials to file
  saveCodexOAuthCredentials(credentials)

  // Reset any cached rate limit since user just reconnected
  resetCodexOAuthRateLimit()

  return credentials
}

/**
 * Disconnect from Codex OAuth (clear credentials).
 */
export function disconnectCodexOAuth(): void {
  clearCodexOAuthCredentials()
}

/**
 * Get the current Codex OAuth connection status.
 */
export function getCodexOAuthStatus(): {
  connected: boolean
  expiresAt?: number
  connectedAt?: number
} {
  if (!isCodexOAuthValid()) {
    return { connected: false }
  }

  const credentials = getCodexOAuthCredentials()
  if (!credentials) {
    return { connected: false }
  }

  return {
    connected: true,
    expiresAt: credentials.expiresAt,
    connectedAt: credentials.connectedAt,
  }
}
