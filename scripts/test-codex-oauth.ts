/**
 * Test script for Codex OAuth protocol.
 * 
 * This script tests the OAuth flow for connecting to ChatGPT Plus/Pro subscriptions.
 * Based on the opencode implementation: https://github.com/numman-ali/opencode-openai-codex-auth
 * 
 * Usage:
 *   bun scripts/test-codex-oauth.ts
 *   bun scripts/test-codex-oauth.ts --exchange <code>  # Exchange an auth code for tokens
 */

import crypto from 'crypto'
import http from 'http'

// Correct OAuth constants (from opencode/codex CLI)
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize'
const TOKEN_URL = 'https://auth.openai.com/oauth/token'
const REDIRECT_URI = 'http://localhost:1455/auth/callback'
const SCOPE = 'openid profile email offline_access'

// PKCE helpers
function generateCodeVerifier(): string {
  const buffer = crypto.randomBytes(32)
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function generateCodeChallenge(verifier: string): string {
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

// Build the authorization URL
function buildAuthUrl(codeChallenge: string, state: string): string {
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('redirect_uri', REDIRECT_URI)
  url.searchParams.set('scope', SCOPE)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', state)
  // Additional parameters from opencode implementation
  url.searchParams.set('id_token_add_organizations', 'true')
  url.searchParams.set('codex_cli_simplified_flow', 'true')
  url.searchParams.set('originator', 'codex_cli_rs')
  return url.toString()
}

// Exchange authorization code for tokens
async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<void> {
  console.log('\n📤 Exchanging authorization code for tokens...')
  console.log('Code:', code.substring(0, 20) + '...')
  console.log('Verifier:', codeVerifier.substring(0, 20) + '...')
  
  // IMPORTANT: Use application/x-www-form-urlencoded, NOT application/json
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code: code,
    code_verifier: codeVerifier,
    redirect_uri: REDIRECT_URI,
  })

  console.log('\nRequest details:')
  console.log('URL:', TOKEN_URL)
  console.log('Content-Type: application/x-www-form-urlencoded')
  console.log('Body:', body.toString())

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    const responseText = await response.text()
    
    if (!response.ok) {
      console.error('\n❌ Token exchange failed!')
      console.error('Status:', response.status, response.statusText)
      console.error('Response:', responseText)
      return
    }

    const data = JSON.parse(responseText)
    console.log('\n✅ Token exchange successful!')
    console.log('Access Token:', data.access_token?.substring(0, 30) + '...')
    console.log('Refresh Token:', data.refresh_token?.substring(0, 30) + '...')
    console.log('Expires In:', data.expires_in, 'seconds')
    console.log('Token Type:', data.token_type)
  } catch (error) {
    console.error('\n❌ Error during token exchange:', error)
  }
}

// Parse authorization response from URL
function parseAuthResponse(url: string): { code?: string; state?: string } {
  try {
    const parsed = new URL(url)
    return {
      code: parsed.searchParams.get('code') ?? undefined,
      state: parsed.searchParams.get('state') ?? undefined,
    }
  } catch {
    // Maybe it's just the code or code#state format
    if (url.includes('#')) {
      const [code, state] = url.split('#', 2)
      return { code, state }
    }
    return { code: url }
  }
}

// Main flow
async function main() {
  const args = process.argv.slice(2)
  
  // If --exchange flag is provided, exchange the code
  if (args[0] === '--exchange' && args[1]) {
    const input = args[1]
    const verifier = args[2] // Optional: provide verifier if you have it
    
    const { code } = parseAuthResponse(input)
    if (!code) {
      console.error('❌ No authorization code found in input')
      process.exit(1)
    }
    
    if (!verifier) {
      console.error('❌ Code verifier is required. Run the script without --exchange first to get one.')
      process.exit(1)
    }
    
    await exchangeCodeForTokens(code, verifier)
    return
  }

  console.log('🔐 Codex OAuth Test Script')
  console.log('=' .repeat(50))
  
  // Generate PKCE values
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateState()
  
  console.log('\n📋 PKCE Values:')
  console.log('Code Verifier:', codeVerifier)
  console.log('Code Challenge:', codeChallenge)
  console.log('State:', state)
  
  // Build authorization URL
  const authUrl = buildAuthUrl(codeChallenge, state)
  
  console.log('\n🌐 Authorization URL:')
  console.log(authUrl)
  
  console.log('\n📝 Instructions:')
  console.log('1. Open the URL above in your browser')
  console.log('2. Sign in with your OpenAI account')
  console.log('3. After authorization, you will be redirected to localhost:1455')
  console.log('4. Copy the "code" parameter from the redirect URL')
  console.log('5. Run: bun scripts/test-codex-oauth.ts --exchange <code> ' + codeVerifier)
  
  // Start a local server to catch the redirect
  console.log('\n🖥️  Starting local server on http://localhost:1455 to catch the redirect...')
  console.log('   (Press Ctrl+C to stop)\n')
  
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:1455`)
    
    if (url.pathname === '/auth/callback') {
      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      
      console.log('\n📥 Received callback!')
      console.log('Code:', code?.substring(0, 30) + '...')
      console.log('State:', returnedState)
      
      if (returnedState !== state) {
        console.error('⚠️  State mismatch! Expected:', state, 'Got:', returnedState)
      }
      
      if (code) {
        // Exchange the code for tokens
        await exchangeCodeForTokens(code, codeVerifier)
        
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1>✅ Authorization Successful!</h1>
              <p>You can close this window and return to the terminal.</p>
            </body>
          </html>
        `)
        
        // Close server after a short delay
        setTimeout(() => {
          server.close()
          process.exit(0)
        }, 1000)
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1>❌ Authorization Failed</h1>
              <p>No authorization code received.</p>
            </body>
          </html>
        `)
      }
    } else {
      res.writeHead(404)
      res.end('Not found')
    }
  })
  
  server.listen(1455, () => {
    console.log('Server listening on http://localhost:1455')
    console.log('Waiting for OAuth callback...\n')
    
    // Try to open the URL in the browser
    import('open').then(({ default: open }) => {
      open(authUrl).catch(() => {
        console.log('Could not auto-open browser. Please open the URL manually.')
      })
    }).catch(() => {
      console.log('Could not auto-open browser. Please open the URL manually.')
    })
  })
  
  server.on('error', (err) => {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error('❌ Port 1455 is already in use. Please close any other instances.')
    } else {
      console.error('❌ Server error:', err)
    }
    process.exit(1)
  })
}

main().catch(console.error)
