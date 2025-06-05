#!/usr/bin/env bun
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import os from 'node:os'

import db from '../../common/src/db' // Corrected import path
import * as schema from '../../common/src/db/schema' // Corrected import path
import { genAuthCode } from '../../common/src/util/credentials' // Corrected import path

async function seedTestUser() {
  console.log('🌱 Starting test user seeding...')

  const nextAuthSecret = process.env.NEXTAUTH_SECRET
  if (!nextAuthSecret) {
    console.error('❌ NEXTAUTH_SECRET environment variable is not set.')
    process.exit(1)
  }

  const userId = `test-user-${crypto.randomUUID()}`
  const userEmail = `test-${crypto.randomBytes(8).toString('hex')}@example.com`
  const userName = 'E2E Test User'
  const fingerprintId = `test-fp-${crypto.randomUUID()}`
  const sessionToken = `test-session-${crypto.randomUUID()}`
  
  // For the fingerprintHash, we need an expiry. Let's set it far in the future for the test.
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
  const fingerprintHash = genAuthCode(fingerprintId, expiresAt.getTime().toString(), nextAuthSecret)

  try {
    // 1. Create User
    await db.insert(schema.user).values({
      id: userId,
      email: userEmail,
      name: userName,
      emailVerified: new Date(), // Mark as verified for simplicity
    })
    console.log(`👤 Created user: ${userId} (${userEmail})`)

    // 2. Create Fingerprint
    await db.insert(schema.fingerprint).values({
      id: fingerprintId,
      sig_hash: fingerprintHash, // This hash links the fingerprint to the session/credentials
      created_at: new Date(),
    })
    console.log(`👆 Created fingerprint: ${fingerprintId}`)

    // 3. Create Session
    await db.insert(schema.session).values({
      sessionToken: sessionToken,
      userId: userId,
      expires: expiresAt,
      fingerprint_id: fingerprintId,
    })
    console.log(`🔑 Created session: ${sessionToken} for user ${userId}`)

    // 4. Create credentials.json
    const credentials = {
      default: {
        id: userId,
        email: userEmail,
        name: userName,
        authToken: sessionToken,
        fingerprintId: fingerprintId,
        fingerprintHash: fingerprintHash,
      },
    }

    // Determine credentials path (mimicking npm-app/src/credentials.ts logic for 'local' env)
    const configDir = path.join(os.homedir(), '.config', 'manicode-local')
    const credentialsPath = path.join(configDir, 'credentials.json')

    await fs.mkdir(configDir, { recursive: true })
    await fs.writeFile(credentialsPath, JSON.stringify(credentials, null, 2))
    console.log(`📝 Wrote credentials to: ${credentialsPath}`)

    console.log('✅ Test user seeding complete!')
  } catch (error) {
    console.error('❌ Error during test user seeding:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  seedTestUser().catch((err) => {
    console.error('Unhandled error in seedTestUser:', err)
    process.exit(1)
  })
}
