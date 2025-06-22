#!/usr/bin/env node

import { execSync } from 'child_process'
import fs from 'fs'

// GitHub App configuration - you'll need to set these
const APP_ID: string | undefined = process.env.GH_APP_ID
const PRIVATE_KEY_CONTENT: string | undefined = process.env.GH_APP_PRIVATE_KEY
const INSTALLATION_ID: string | undefined = process.env.GH_APP_INSTALLATION_ID

function error(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

function base64urlEscape(str) {
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function generateJWT() {
  if (!APP_ID || !PRIVATE_KEY_CONTENT) {
    error('GH_APP_ID and GH_APP_PRIVATE_KEY environment variables are required')
    return
  }

  // Write private key content to temporary file
  const tempKeyFile = '/tmp/github_app_private_key.pem'
  fs.writeFileSync(tempKeyFile, PRIVATE_KEY_CONTENT)

  const now = Math.floor(Date.now() / 1000)

  // Create JWT payload
  const payload = {
    iat: now - 60, // Issued 60 seconds ago
    exp: now + 600, // Expires in 10 minutes
    iss: parseInt(APP_ID), // Make sure this is a number
  }

  // Create header and payload
  const header = { alg: 'RS256', typ: 'JWT' }
  const headerJson = JSON.stringify(header)
  const payloadJson = JSON.stringify(payload)

  console.log(`🔍 Header: ${headerJson}`)
  console.log(`🔍 Payload: ${payloadJson}`)

  const headerB64 = base64urlEscape(Buffer.from(headerJson).toString('base64'))
  const payloadB64 = base64urlEscape(
    Buffer.from(payloadJson).toString('base64')
  )

  console.log(`🔍 Header B64: ${headerB64}`)
  console.log(`🔍 Payload B64: ${payloadB64}`)

  // Sign with private key using openssl
  const unsigned = `${headerB64}.${payloadB64}`

  const tempFile = '/tmp/jwt_unsigned'
  try {
    // Write the unsigned token to a temp file to avoid shell escaping issues
    fs.writeFileSync(tempFile, unsigned)

    // Create signature using openssl
    const signature = execSync(
      `cat "${tempFile}" | openssl dgst -sha256 -sign "${tempKeyFile}" -binary | base64 -w 0`,
      { encoding: 'utf8' }
    )
    const signatureB64 = base64urlEscape(signature.trim())

    // Clean up temp files
    fs.unlinkSync(tempFile)
    fs.unlinkSync(tempKeyFile)

    const jwt = `${unsigned}.${signatureB64}`
    console.log(`🔍 Final JWT length: ${jwt.length}`)
    console.log(`🔍 JWT: ${jwt.substring(0, 50)}...`)
    console.log('✅ JWT generated successfully')
    return jwt
  } catch (err) {
    // Clean up temp files on error
    try {
      fs.unlinkSync(tempFile)
    } catch {}
    try {
      fs.unlinkSync(tempKeyFile)
    } catch {}
    error(`Failed to sign JWT: ${err.message}`)
  }
}

function getInstallationToken(jwt) {
  if (!INSTALLATION_ID) {
    error('GH_APP_INSTALLATION_ID environment variable is required')
  }

  try {
    console.log(
      `🔍 Getting installation token for installation ID: ${INSTALLATION_ID}`
    )

    // Write JWT to temp file to avoid shell escaping issues
    const tempJwtFile = '/tmp/jwt_token'
    fs.writeFileSync(tempJwtFile, jwt)

    const response = execSync(
      `curl -s -X POST \
      -H "Accept: application/vnd.github.v3+json" \
      -H "Authorization: Bearer $(cat ${tempJwtFile})" \
      https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`,
      { encoding: 'utf8' }
    )

    // Clean up temp file
    fs.unlinkSync(tempJwtFile)

    console.log(`📝 API Response: ${response}`)

    const data = JSON.parse(response)

    if (data.token) {
      return data.token
    } else if (data.message) {
      error(`GitHub API error: ${data.message}`)
    } else {
      error(`Failed to get installation token: ${response}`)
    }
  } catch (err) {
    error(`Failed to get installation token: ${err.message}`)
  }
}

function main() {
  console.log('🔑 Generating GitHub App access token...')
  console.log(`📋 App ID: ${APP_ID}`)
  console.log(`📋 Installation ID: ${INSTALLATION_ID}`)
  console.log(`📋 Private Key: ${PRIVATE_KEY_CONTENT ? 'Present' : 'Missing'}`)

  const jwt = generateJWT()
  const token = getInstallationToken(jwt)

  console.log('✅ Token generated successfully!')
  console.log(`export GITHUB_TOKEN="${token}"`)
  console.log('')
  console.log(
    'Copy and run the export command above, then run your release script.'
  )
}

main()
