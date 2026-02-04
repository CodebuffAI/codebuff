import { spawnSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import path from 'path'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { getE2EDatabaseUrl } from './e2e-constants'
import * as schema from './schema'

const databaseUrl = getE2EDatabaseUrl()

// Safeguard: prevent accidentally running e2e migrations against non-local databases
if (process.env.E2E_DATABASE_URL && process.env.ALLOW_REMOTE_E2E_DATABASE !== 'true') {
  const parsedUrl = new URL(databaseUrl)
  const hostname = parsedUrl.hostname

  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    console.error(
      `Refusing to run e2e migrations against non-local database host "${hostname}". ` +
        'Set ALLOW_REMOTE_E2E_DATABASE=true to override.'
    )
    process.exit(1)
  }
}

process.env.E2E_DATABASE_URL = databaseUrl
process.env.DATABASE_URL = databaseUrl

const here = path.dirname(fileURLToPath(import.meta.url))
const composeFile = path.join(here, 'docker-compose.e2e.yml')

const run = (command: string, args: string[]) => {
  const result = spawnSync(command, args, { cwd: here, stdio: 'inherit' })
  if (result.error) {
    const errno = result.error as NodeJS.ErrnoException
    if (errno.code === 'ENOENT') {
      console.error(
        `Error: '${command}' command not found. Please ensure ${command} is installed and in your PATH.`
      )
    } else {
      console.error(`Error executing '${command}':`, result.error.message)
    }
    process.exit(1)
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const waitForPostgres = async (
  url: string,
  maxAttempts = 30,
  delayMs = 1000
): Promise<void> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let testClient: ReturnType<typeof postgres> | null = null
    try {
      testClient = postgres(url, { max: 1, connect_timeout: 5 })
      await testClient`SELECT 1`
      return
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(
          `Failed to connect to Postgres after ${maxAttempts} attempts: ${error}`
        )
      }
      console.log(
        `Waiting for Postgres to be ready... (attempt ${attempt}/${maxAttempts})`
      )
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    } finally {
      if (testClient) {
        await testClient.end()
      }
    }
  }
}

run('docker', ['compose', '-f', composeFile, 'up', '-d', '--wait'])

await waitForPostgres(databaseUrl)

const client = postgres(databaseUrl, { max: 1 })
const db = drizzle(client, { schema })

try {
  await migrate(db, { migrationsFolder: path.join(here, 'migrations') })

  const userEmail = 'e2e@codebuff.com'
  const fallbackUserId = 'e2e-user'

  await db
    .insert(schema.user)
    .values({
      id: fallbackUserId,
      email: userEmail,
      name: 'E2E User',
      handle: 'e2e-user',
    })
    .onConflictDoNothing()

  const [userRow] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, userEmail))
    .limit(1)

  const userId = userRow?.id ?? fallbackUserId
  const publisherId = 'codebuff'

  await db
    .insert(schema.publisher)
    .values({
      id: publisherId,
      name: 'Codebuff',
      verified: true,
      user_id: userId,
      created_by: userId,
    })
    .onConflictDoNothing()

  await db
    .insert(schema.agentConfig)
    .values({
      id: 'base',
      version: '1.2.3',
      publisher_id: publisherId,
      data: {
        name: 'Base',
        description: 'desc',
        tags: ['test'],
      },
    })
    .onConflictDoNothing()

  console.log('E2E database setup completed successfully')
} finally {
  await client.end()
}
