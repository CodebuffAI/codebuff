#!/usr/bin/env bun

import crypto from 'crypto'
import { createInterface } from 'readline/promises'
import { stdin as input, stdout as output } from 'process'

import {
  CHATGPT_OAUTH_AUTHORIZE_URL,
  CHATGPT_OAUTH_CLIENT_ID,
  CHATGPT_OAUTH_REDIRECT_URI,
  CHATGPT_OAUTH_TOKEN_URL,
} from '@codebuff/common/constants/chatgpt-oauth'

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function generatePkce() {
  const codeVerifier = toBase64Url(crypto.randomBytes(32))
  const codeChallenge = toBase64Url(
    crypto.createHash('sha256').update(codeVerifier).digest(),
  )
  return { codeVerifier, codeChallenge }
}

function extractAuthCode(rawInput: string): { code: string; state?: string } {
  const trimmed = rawInput.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const callbackUrl = new URL(trimmed)
    const code = callbackUrl.searchParams.get('code')
    const state = callbackUrl.searchParams.get('state') ?? undefined
    if (!code) {
      throw new Error('No `code` query param found in callback URL')
    }
    return { code, state }
  }

  if (!trimmed) {
    throw new Error('Empty input. Provide auth code or callback URL.')
  }
  return { code: trimmed }
}

async function main() {
  const rl = createInterface({ input, output })

  try {
    const { codeVerifier, codeChallenge } = generatePkce()
    const state = codeVerifier

    const authUrl = new URL(CHATGPT_OAUTH_AUTHORIZE_URL)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', CHATGPT_OAUTH_CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', CHATGPT_OAUTH_REDIRECT_URI)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('scope', 'openid profile email offline_access')

    console.log('\n=== ChatGPT OAuth validation (experimental) ===\n')
    console.log('1) Open this URL in your browser and authorize:')
    console.log(authUrl.toString())
    console.log('\n2) Paste either the auth code OR full callback URL.')

    const authInput = await rl.question('\nAuth code / callback URL: ')
    const { code, state: returnedState } = extractAuthCode(authInput)

    if (returnedState && returnedState !== state) {
      throw new Error('State mismatch. Restart and try again.')
    }

    console.log('\n3) Exchanging code for tokens...')
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
        code_verifier: codeVerifier,
      }),
    })

    if (!response.ok) {
      throw new Error(
        `Token exchange failed (status ${response.status}). Retry and re-authorize if needed.`,
      )
    }

    const tokenResponse = await response.json()
    console.log('\n✅ Token exchange succeeded.')
    console.log(`access_token present: ${Boolean(tokenResponse?.access_token)}`)
    console.log(`refresh_token present: ${Boolean(tokenResponse?.refresh_token)}`)
    console.log(`expires_in: ${tokenResponse?.expires_in ?? 'unknown'}`)
    console.log('\n(Access/refresh token values intentionally not printed.)')
  } finally {
    rl.close()
  }
}

main().catch((error) => {
  console.error('\n❌ Validation failed:')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
