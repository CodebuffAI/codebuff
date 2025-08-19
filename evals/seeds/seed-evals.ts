import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'
import crypto from 'crypto'
import {
  user,
  session,
} from '../../common/src/db/schema'

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL!
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  const db = drizzle(client)

  // deterministic IDs for idempotency
  const userId = 'test-user'
  const email = 'evals@test.local'
  const token = crypto.randomUUID() // or deterministic for replay

  // upsert user
  await db
    .insert(user)
    .values({
      id: userId,
      email,
      name: 'Test User',
      created_at: new Date(),
    })
    .onConflictDoNothing()

  // upsert session / api token row
  await db
    .insert(session)
    .values({
      sessionToken: token,
      userId,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    })
    .onConflictDoNothing()

  console.log(`CODEBUFF_API_KEY=${token}`)
  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})