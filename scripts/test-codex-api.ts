#!/usr/bin/env bun
/**
 * Test script for Codex OAuth API requests
 *
 * This script reads your stored Codex OAuth credentials and makes a test request
 * to the ChatGPT backend API to verify the OAuth flow is working correctly.
 *
 * Usage: bun scripts/test-codex-api.ts [model]
 *
 * Examples:
 *   bun scripts/test-codex-api.ts           # Uses gpt-5.1 by default
 *   bun scripts/test-codex-api.ts gpt-5.2   # Uses gpt-5.2
 */

import fs from 'fs'
import path from 'path'
import os from 'os'

// Constants from the codebase
const CHATGPT_BACKEND_API_URL = 'https://chatgpt.com/backend-api'

// Get model from command line args or default to gpt-5.1
const model = process.argv[2] || 'gpt-5.1'

console.log('🔍 Codex OAuth API Test Script')
console.log('==============================')
console.log(`Model: ${model}`)
console.log('')

// Read credentials from the credentials file
function getCredentialsPath(): string {
  const env = process.env.NEXT_PUBLIC_CB_ENVIRONMENT
  const envSuffix = env && env !== 'prod' ? `-${env}` : ''
  return path.join(os.homedir(), '.config', `manicode${envSuffix}`, 'credentials.json')
}

function getCodexOAuthCredentials(): { accessToken: string; refreshToken: string; expiresAt: number } | null {
  const credentialsPath = getCredentialsPath()
  console.log(`📁 Credentials path: ${credentialsPath}`)

  if (!fs.existsSync(credentialsPath)) {
    console.error('❌ Credentials file not found')
    return null
  }

  try {
    const content = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
    if (!content.codexOAuth) {
      console.error('❌ No Codex OAuth credentials found in credentials file')
      console.log('   Run /connect:codex in the CLI to authenticate first')
      return null
    }
    return content.codexOAuth
  } catch (error) {
    console.error('❌ Error reading credentials:', error)
    return null
  }
}

/**
 * Extract the ChatGPT account ID from the JWT access token.
 * The token contains a claim at "https://api.openai.com/auth" with the account ID.
 */
function extractAccountIdFromToken(accessToken: string): string | null {
  try {
    // JWT format: header.payload.signature
    const parts = accessToken.split('.')
    if (parts.length !== 3) {
      console.error('❌ Invalid JWT format')
      return null
    }

    // Decode the payload (base64url)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    console.log('📋 JWT payload claims:', Object.keys(payload))

    // The account ID is in the custom claim at "https://api.openai.com/auth"
    // IMPORTANT: Use chatgpt_account_id, NOT user_id
    const authClaim = payload['https://api.openai.com/auth']
    if (authClaim?.chatgpt_account_id) {
      console.log('📋 Found chatgpt_account_id:', authClaim.chatgpt_account_id)
      return authClaim.chatgpt_account_id
    }

    console.log('📋 Full auth claim:', JSON.stringify(authClaim, null, 2))
    return null
  } catch (error) {
    console.error('❌ Error decoding JWT:', error)
    return null
  }
}

async function makeCodexRequest(accessToken: string, accountId: string) {
  const url = `${CHATGPT_BACKEND_API_URL}/codex/responses`

  // Request body matching opencode's format
  const requestBody = {
    model: model,
    input: [
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Say "Hello from Codex!" and nothing else.',
          },
        ],
      },
    ],
    instructions: 'You are a helpful assistant.',
    // IMPORTANT: These are required by the ChatGPT backend
    store: false, // ChatGPT backend REQUIRES store=false
    stream: true, // Always stream
    // Reasoning configuration
    reasoning: {
      effort: 'medium',
      summary: 'auto',
    },
    // Text verbosity
    text: {
      verbosity: 'medium',
    },
    // Include encrypted reasoning content for stateless operation
    include: ['reasoning.encrypted_content'],
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'chatgpt-account-id': accountId,
    'OpenAI-Beta': 'responses=experimental',
    originator: 'codex_cli_rs',
    accept: 'text/event-stream',
  }

  console.log('📤 Request URL:', url)
  console.log('📤 Request headers:', JSON.stringify(headers, null, 2))
  console.log('📤 Request body:', JSON.stringify(requestBody, null, 2))
  console.log('')

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    })

    console.log('📥 Response status:', response.status, response.statusText)
    console.log('📥 Response headers:')
    response.headers.forEach((value, key) => {
      console.log(`   ${key}: ${value}`)
    })
    console.log('')

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Error response body:', errorText)
      return
    }

    // Handle streaming response
    console.log('📥 Streaming response:')
    console.log('---')

    const reader = response.body?.getReader()
    if (!reader) {
      console.error('❌ No response body')
      return
    }

    const decoder = new TextDecoder()
    let fullResponse = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      fullResponse += chunk

      // Parse SSE events
      const lines = chunk.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') {
            console.log('\n[DONE]')
          } else {
            try {
              const parsed = JSON.parse(data)
              // Extract text content from the response
              if (parsed.type === 'response.output_text.delta') {
                process.stdout.write(parsed.delta || '')
              } else if (parsed.type === 'response.completed') {
                console.log('\n\n✅ Response completed!')
              } else {
                // Log other event types for debugging
                console.log(`[${parsed.type}]`)
              }
            } catch {
              // Non-JSON data, just log it
              if (data.trim()) {
                console.log(`[raw]: ${data}`)
              }
            }
          }
        }
      }
    }

    console.log('---')
    console.log('')
    console.log('✅ Request completed successfully!')
  } catch (error) {
    console.error('❌ Request failed:', error)
  }
}

async function main() {
  // Get credentials
  const credentials = getCodexOAuthCredentials()
  if (!credentials) {
    process.exit(1)
  }

  console.log('✅ Found Codex OAuth credentials')
  console.log(`   Expires at: ${new Date(credentials.expiresAt).toISOString()}`)
  console.log(`   Is expired: ${credentials.expiresAt < Date.now()}`)
  console.log('')

  // Extract account ID from token
  const accountId = extractAccountIdFromToken(credentials.accessToken)
  if (!accountId) {
    console.error('❌ Could not extract account ID from access token')
    process.exit(1)
  }

  console.log(`✅ Extracted account ID: ${accountId}`)
  console.log('')

  // Make the test request
  await makeCodexRequest(credentials.accessToken, accountId)
}

main().catch(console.error)
