import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

async function main() {
  const connectionString = process.env.DATABASE_URL!
  const client = postgres(connectionString)
  const db = drizzle(client, { schema })

  console.log('Running migrations...')

  await migrate(db, { migrationsFolder: './drizzle' })

  console.log('Migrations complete!')

  await client.end()
}

main().catch((err) => {
  console.error('Migration failed!', err)
  process.exit(1)
})
