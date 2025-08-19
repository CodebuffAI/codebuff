import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'
import crypto from 'crypto'
import {
  user,
  session,
} from '../../common/src/db/schema'

// Logging function
function log(message: string) {
  const timestamp = new Date().toISOString()
  console.error(`[${timestamp}] ${message}`)
}

async function main() {
  log('🌱 Starting database seeding for evaluations')
  
  const DATABASE_URL = process.env.DATABASE_URL!
  log(`📊 Connecting to database: ${DATABASE_URL.replace(/\/\/.*@/, '//***@')}`)
  
  const client = new Client({ connectionString: DATABASE_URL })
  const startTime = Date.now()
  
  try {
    await client.connect()
    log('✅ Database connection established')
    
    const db = drizzle(client)

    // deterministic IDs for idempotency
    const userId = 'test-user'
    const email = 'evals@test.local'
    const token = crypto.randomUUID()
    
    log('👤 Creating test user...')
    log(`  User ID: ${userId}`)
    log(`  Email: ${email}`)

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
    
    log('✅ Test user created/updated')

    log('🔑 Creating session token...')
    log(`  Token: ${token.substring(0, 8)}...`)
    
    // upsert session / api token row
    await db
      .insert(session)
      .values({
        sessionToken: token,
        userId,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      })
      .onConflictDoNothing()

    log('✅ Session token created/updated')
    const duration = Date.now() - startTime
    log(`🏁 Database seeding completed in ${duration}ms`)

    // Output the API key for the runner script to capture
    console.log(`CODEBUFF_API_KEY=${token}`)
    
  } catch (error) {
    log(`❌ Database seeding failed: ${error}`)
    throw error
  } finally {
    await client.end()
    log('🔌 Database connection closed')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})