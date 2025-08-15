import 'dotenv/config'
import * as crypto from 'node:crypto'

import * as schema from '@codebuff/common/db/schema'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) {
    console.error('Missing DATABASE_URL')
    process.exit(1)
  }
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  const db = drizzle(client)

  const userId = 'evals-user'
  const email = 'evals@test.local'
  const token = crypto.randomUUID()

  // Upsert user (adjust to match schema fields)
  try {
    await db
      .insert(schema.user)
      .values({
        id: userId,
        email,
        // Optional common columns; ignore if not present
        created_at: new Date(),
      })
      .onConflictDoNothing()
  } catch {}

  // Upsert session/api token (sessionToken + userId)
  try {
    await db
      .insert(schema.session)
      .values({
        sessionToken: token,
        userId,
        // Optional: expire in 24h if column exists
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .onConflictDoNothing()
  } catch {}

  console.log(`CODEBUFF_API_KEY=${token}`)
  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
