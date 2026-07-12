#!/usr/bin/env bun

/**
 * Start optional local development services in the background.
 *
 * Usage:
 *   bun start-services    # Start optional services in background
 *   bun start-cli         # Then start CLI in foreground
 *   bun stop-services     # Stop background services
 *
 * Services started:
 *   - db: PostgreSQL database (via packages/internal)
 *   - studio: Drizzle Studio for database inspection
 *   - sdk: SDK build (one-time)
 *
 * The Openbuff CLI itself does not require these services for normal BYOK local development.
 */

import { spawn, spawnSync, type ChildProcess } from 'child_process'
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  openSync,
} from 'fs'
import { join, resolve } from 'path'

const PROJECT_ROOT = resolve(import.meta.dir, '..')
const LOG_DIR = join(PROJECT_ROOT, 'debug', 'console')
const PID_FILE = join(LOG_DIR, 'services.json')
const BUN_PATH = join(PROJECT_ROOT, '.bin', 'bun')

interface ServicePids {
  studio?: number
  sdk?: number
}

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function ok(name: string, message: string): void {
  console.log(`  \x1b[32m✓\x1b[0m ${name.padEnd(10)} ${message}`)
}

function fail(name: string, message: string): void {
  console.log(`  \x1b[31m✗\x1b[0m ${name.padEnd(10)} ${message}`)
}

function loadExistingPids(): ServicePids | null {
  if (!existsSync(PID_FILE)) {
    return null
  }
  try {
    return JSON.parse(readFileSync(PID_FILE, 'utf-8'))
  } catch {
    return null
  }
}

function savePids(pids: ServicePids): void {
  writeFileSync(PID_FILE, JSON.stringify(pids, null, 2))
}

function killPid(pid: number): boolean {
  try {
    process.kill(pid, 0) // Check if exists
    process.kill(pid, 'SIGTERM')
    return true
  } catch {
    return false
  }
}

async function killExistingServices(): Promise<void> {
  const existing = loadExistingPids()
  if (!existing) return

  if (existing.studio) killPid(existing.studio)
  if (existing.sdk) killPid(existing.sdk)

  try {
    unlinkSync(PID_FILE)
  } catch {
    // Ignore
  }

  await sleep(500)
}

function startDb(): boolean {
  console.log('')
  process.stdout.write('  db        starting...\r')

  const logFile = openSync(join(LOG_DIR, 'db.log'), 'w')
  const result = spawnSync(
    BUN_PATH,
    ['--cwd', 'packages/internal', 'db:start'],
    {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', logFile, logFile],
      env: process.env,
    },
  )

  if (result.status !== 0) {
    fail('db', 'failed to start')
    console.log(`  Check logs: tail -f ${join(LOG_DIR, 'db.log')}`)
    return false
  }

  ok('db', 'ready!')
  return true
}

function spawnBackgroundProcess(
  command: string,
  args: string[],
  logFileName: string,
): ChildProcess {
  const logFile = openSync(join(LOG_DIR, logFileName), 'w')

  const child = spawn(command, args, {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: ['ignore', logFile, logFile],
    env: process.env,
  })

  child.unref()
  return child
}

function startBackgroundServices(): ServicePids {
  const pids: ServicePids = {}

  const sdk = spawnBackgroundProcess(
    BUN_PATH,
    ['run', '--cwd', 'sdk', 'build'],
    'sdk.log',
  )
  if (sdk.pid) pids.sdk = sdk.pid
  ok('sdk', '(building)')

  const studio = spawnBackgroundProcess(
    BUN_PATH,
    ['--cwd', 'packages/internal', 'db:studio'],
    'studio.log',
  )
  if (studio.pid) pids.studio = studio.pid
  ok('studio', '(background)')

  return pids
}

async function main(): Promise<void> {
  ensureLogDir()

  console.log('Starting optional local services in background...')

  await killExistingServices()

  if (!startDb()) {
    process.exit(1)
  }

  const pids = startBackgroundServices()
  savePids(pids)

  console.log('')
  console.log(`  View logs:  tail -f ${join(LOG_DIR, 'studio.log')}`)
  console.log(`  Stop with:  bun down`)
  console.log('')
  console.log('Now run: bun start-cli')
}

main().catch((error) => {
  console.error('Error starting services:', error)
  process.exit(1)
})
