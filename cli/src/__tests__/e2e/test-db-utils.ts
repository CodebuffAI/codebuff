import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

const INTERNAL_PKG_DIR = path.join(__dirname, '../../../../packages/internal')
const DOCKER_COMPOSE_E2E = path.join(INTERNAL_PKG_DIR, 'src/db/docker-compose.e2e.yml')
const SEED_FILE = path.join(INTERNAL_PKG_DIR, 'src/db/seed.e2e.sql')
const DRIZZLE_CONFIG = path.join(INTERNAL_PKG_DIR, 'src/db/drizzle.config.ts')

export interface E2EDatabase {
  containerId: string
  containerName: string
  port: number
  databaseUrl: string
}

/**
 * Generate a unique container name for a describe block
 */
export function generateContainerName(describeId: string): string {
  const timestamp = Date.now()
  const sanitizedId = describeId.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 20)
  return `manicode-e2e-${sanitizedId}-${timestamp}`
}

/**
 * Find an available port starting from the given base port
 */
export function findAvailablePort(basePort: number = 5433): number {
  // Try ports starting from basePort
  for (let port = basePort; port < basePort + 100; port++) {
    try {
      execSync(`lsof -i:${port}`, { stdio: 'pipe' })
      // Port is in use, try next
    } catch {
      // Port is available
      return port
    }
  }
  throw new Error(`Could not find available port starting from ${basePort}`)
}

/**
 * Create and start a fresh e2e database container
 */
export async function createE2EDatabase(describeId: string): Promise<E2EDatabase> {
  const containerName = generateContainerName(describeId)
  const port = findAvailablePort(5433)
  const databaseUrl = `postgresql://manicode_e2e_user:e2e_secret_password@localhost:${port}/manicode_db_e2e`

  console.log(`[E2E DB] Creating database container: ${containerName} on port ${port}`)

  // Start the container
  try {
    execSync(
      `E2E_CONTAINER_NAME=${containerName} E2E_DB_PORT=${port} docker compose -f ${DOCKER_COMPOSE_E2E} up -d --wait`,
      {
        stdio: 'pipe',
        env: { ...process.env, E2E_CONTAINER_NAME: containerName, E2E_DB_PORT: String(port) },
      }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to start e2e database container: ${errorMessage}`)
  }

  // Wait for the database to be ready
  await waitForDatabase(port)

  // Get container ID
  const containerId = execSync(
    `docker compose -f ${DOCKER_COMPOSE_E2E} -p ${containerName} ps -q db`,
    { encoding: 'utf8', env: { ...process.env, E2E_CONTAINER_NAME: containerName } }
  ).trim()

  // Run migrations
  await runMigrations(databaseUrl)

  // Run seed
  await seedDatabase(databaseUrl)

  console.log(`[E2E DB] Database ready: ${containerName}`)

  return {
    containerId,
    containerName,
    port,
    databaseUrl,
  }
}

/**
 * Wait for database to be ready to accept connections
 * Uses pg_isready if available on the host, otherwise falls back to a simple psql connection check.
 * Note: We don't use `docker run --network host` because it doesn't work on Docker Desktop for macOS/Windows.
 */
async function waitForDatabase(port: number, timeoutMs: number = 30000): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    try {
      // Try pg_isready first (if installed on host)
      execSync(
        `pg_isready -h localhost -p ${port} -U manicode_e2e_user -d manicode_db_e2e`,
        { stdio: 'pipe' }
      )
      return
    } catch {
      // Fall back to psql connection check
      try {
        execSync(
          `PGPASSWORD=e2e_secret_password psql -h localhost -p ${port} -U manicode_e2e_user -d manicode_db_e2e -c 'SELECT 1'`,
          { stdio: 'pipe' }
        )
        return
      } catch {
        // Database not ready yet
        await sleep(500)
      }
    }
  }

  throw new Error(`Database did not become ready within ${timeoutMs}ms`)
}

/**
 * Run Drizzle migrations against the e2e database
 */
async function runMigrations(databaseUrl: string): Promise<void> {
  console.log('[E2E DB] Running migrations...')
  
  try {
    execSync(
      `bun drizzle-kit push --config=${DRIZZLE_CONFIG}`,
      {
        cwd: INTERNAL_PKG_DIR,
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: databaseUrl },
      }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to run migrations: ${errorMessage}`)
  }
}

/**
 * Seed the e2e database with test data
 */
async function seedDatabase(databaseUrl: string): Promise<void> {
  console.log('[E2E DB] Seeding database...')

  if (!fs.existsSync(SEED_FILE)) {
    console.log('[E2E DB] No seed file found, skipping seed')
    return
  }

  // Parse database URL for psql
  const url = new URL(databaseUrl)
  const host = url.hostname
  const port = url.port
  const user = url.username
  const password = url.password
  const database = url.pathname.slice(1)

  try {
    execSync(
      `PGPASSWORD=${password} psql -h ${host} -p ${port} -U ${user} -d ${database} -f ${SEED_FILE}`,
      { stdio: 'pipe' }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to seed database: ${errorMessage}`)
  }
}

/**
 * Destroy an e2e database container and its volumes completely
 */
export async function destroyE2EDatabase(db: E2EDatabase): Promise<void> {
  console.log(`[E2E DB] Destroying database container: ${db.containerName}`)

  try {
    // First try docker compose down with volume removal
    execSync(
      `docker compose -p ${db.containerName} -f ${DOCKER_COMPOSE_E2E} down -v --remove-orphans --rmi local`,
      {
        stdio: 'pipe',
        env: { ...process.env, E2E_CONTAINER_NAME: db.containerName },
      }
    )
  } catch {
    // If docker compose fails, try to force remove the container directly
    try {
      execSync(`docker rm -f ${db.containerId}`, { stdio: 'pipe' })
    } catch {
      // Ignore - container may already be removed
    }
  }

  // Also remove any volumes that might have been created with this project name
  try {
    const volumes = execSync(
      `docker volume ls -q --filter "name=${db.containerName}"`,
      { encoding: 'utf8' }
    ).trim()

    if (volumes) {
      execSync(`docker volume rm -f ${volumes.split('\n').join(' ')}`, { stdio: 'pipe' })
      console.log(`[E2E DB] Removed volumes for ${db.containerName}`)
    }
  } catch {
    // Ignore volume cleanup errors
  }

  console.log(`[E2E DB] Container ${db.containerName} destroyed`)
}

/**
 * Clean up any orphaned e2e containers and volumes (useful for manual cleanup)
 */
export function cleanupOrphanedContainers(): void {
  console.log('[E2E DB] Cleaning up orphaned e2e containers and volumes...')
  
  // Remove containers
  try {
    const containers = execSync(
      'docker ps -aq --filter "name=manicode-e2e-"',
      { encoding: 'utf8' }
    ).trim()

    if (containers) {
      execSync(`docker rm -f ${containers.split('\n').join(' ')}`, { stdio: 'pipe' })
      console.log('[E2E DB] Cleaned up orphaned containers')
    }
  } catch {
    // Ignore errors
  }

  // Remove volumes
  try {
    const volumes = execSync(
      'docker volume ls -q --filter "name=manicode-e2e-"',
      { encoding: 'utf8' }
    ).trim()

    if (volumes) {
      execSync(`docker volume rm -f ${volumes.split('\n').join(' ')}`, { stdio: 'pipe' })
      console.log('[E2E DB] Cleaned up orphaned volumes')
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Helper function for async sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Test user credentials - matches seed.e2e.sql
 */
export const E2E_TEST_USERS = {
  default: {
    id: 'e2e-test-user-001',
    name: 'E2E Test User',
    email: 'e2e-test@codebuff.test',
    authToken: 'e2e-test-session-token-001',
    credits: 1000,
  },
  secondary: {
    id: 'e2e-test-user-002',
    name: 'E2E Test User 2',
    email: 'e2e-test-2@codebuff.test',
    authToken: 'e2e-test-session-token-002',
    credits: 500,
  },
  lowCredits: {
    id: 'e2e-test-user-low-credits',
    name: 'E2E Low Credits User',
    email: 'e2e-low-credits@codebuff.test',
    authToken: 'e2e-test-session-low-credits',
    credits: 10,
  },
} as const

export type E2ETestUser = (typeof E2E_TEST_USERS)[keyof typeof E2E_TEST_USERS]
