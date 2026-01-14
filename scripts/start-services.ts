#!/usr/bin/env bun

/**
 * Start development services in the background
 *
 * Usage:
 *   bun start-services    # Start services in background
 *   bun start-cli         # Then start CLI in foreground
 *   bun stop-services     # Stop background services
 *
 * Services started:
 *   - db: PostgreSQL database (via Docker)
 *   - studio: Drizzle Studio for database inspection
 *   - sdk: SDK build (one-time)
 *   - web: Next.js web server
 *
 * Bun automatically loads .env.local and .env.development.local,
 * so environment variables are available without manual sourcing.
 */

import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, openSync } from 'fs'
import { join, resolve } from 'path'

const PROJECT_ROOT = resolve(import.meta.dir, '..')
const LOG_DIR = join(PROJECT_ROOT, 'debug', 'console')
const PID_FILE = join(LOG_DIR, 'services.json')
const BUN_PATH = join(PROJECT_ROOT, '.bin', 'bun')

// Get config from environment (Bun loads .env files automatically)
const APP_URL = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'http://localhost:3000'
const PORT = process.env.NEXT_PUBLIC_WEB_PORT || '3000'

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

interface ServicePids {
  studio?: number
  sdk?: number
  web?: number
  port: string
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

  // Kill existing processes
  if (existing.web) killPid(existing.web)
  if (existing.studio) killPid(existing.studio)
  if (existing.sdk) killPid(existing.sdk)

  // Also kill by port to be safe
  try {
    const result = spawnSync('lsof', ['-ti', `:${existing.port}`], { encoding: 'utf-8' })
    if (result.stdout) {
      const pids = result.stdout.trim().split('\n').filter(Boolean)
      for (const pidStr of pids) {
        const pid = parseInt(pidStr, 10)
        if (!isNaN(pid)) {
          killPid(pid)
        }
      }
    }
  } catch {
    // lsof not available or failed, ignore
  }

  // Clean up PID file
  try {
    unlinkSync(PID_FILE)
  } catch {
    // Ignore
  }

  await sleep(500)
}

function startDb(): boolean {
  console.log('')
  process.stdout.write(`  ${SPINNER[0]} db        starting...\r`)

  const logFile = openSync(join(LOG_DIR, 'db.log'), 'w')
  const result = spawnSync(BUN_PATH, ['--cwd', 'packages/internal', 'db:start'], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', logFile, logFile],
    env: process.env,
  })

  if (result.status !== 0) {
    fail('db', 'failed to start')
    console.log(`  Check logs: tail -f ${join(LOG_DIR, 'db.log')}`)
    return false
  }

  ok('db', 'ready!')
  return true
}

function spawnBackgroundProcess(
  name: string,
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
  const pids: ServicePids = { port: PORT }

  // Start SDK build (one-time, will exit when done)
  const sdk = spawnBackgroundProcess('sdk', BUN_PATH, ['run', '--cwd', 'sdk', 'build'], 'sdk.log')
  if (sdk.pid) pids.sdk = sdk.pid
  ok('sdk', '(building)')

  // Start Drizzle Studio
  const studio = spawnBackgroundProcess(
    'studio',
    BUN_PATH,
    ['--cwd', 'packages/internal', 'db:studio'],
    'studio.log',
  )
  if (studio.pid) pids.studio = studio.pid
  ok('studio', '(background)')

  // Kill any existing next-server on this port
  try {
    const result = spawnSync('lsof', ['-ti', `:${PORT}`], { encoding: 'utf-8' })
    if (result.stdout) {
      const existingPids = result.stdout.trim().split('\n').filter(Boolean)
      for (const pidStr of existingPids) {
        const pid = parseInt(pidStr, 10)
        if (!isNaN(pid)) {
          killPid(pid)
        }
      }
    }
  } catch {
    // Ignore
  }

  // Start web server
  const web = spawnBackgroundProcess('web', BUN_PATH, ['--cwd', 'web', 'dev'], 'web.log')
  if (web.pid) pids.web = web.pid

  return pids
}

async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${APP_URL}/api/healthz`)
    return response.ok
  } catch {
    return false
  }
}

async function waitForHealth(timeoutSeconds: number = 60): Promise<boolean> {
  const startTime = Date.now()
  const timeoutMs = timeoutSeconds * 1000
  let frame = 0

  process.stdout.write('\x1B[?25l') // Hide cursor

  while (Date.now() - startTime < timeoutMs) {
    const isHealthy = await checkHealth()
    if (isHealthy) {
      process.stdout.write('\r\x1B[K') // Clear line
      process.stdout.write('\x1B[?25h') // Show cursor
      ok('web', 'ready!')
      return true
    }

    process.stdout.write(`\r  ${SPINNER[frame]} web       starting...`)
    frame = (frame + 1) % SPINNER.length
    await sleep(500)
  }

  process.stdout.write('\r\x1B[K')
  process.stdout.write('\x1B[?25h')
  fail('web', 'timeout')
  return false
}

async function main(): Promise<void> {
  ensureLogDir()

  console.log('Starting services in background...')

  // Kill any existing services first
  await killExistingServices()

  // Start database (blocking)
  if (!startDb()) {
    process.exit(1)
  }

  // Start background services
  const pids = startBackgroundServices()

  // Wait for web to be healthy
  const healthy = await waitForHealth(60)

  if (!healthy) {
    console.log('')
    console.log(`  Check logs: tail -f ${join(LOG_DIR, 'web.log')}`)
    process.exit(1)
  }

  // Save PIDs for stop-services
  savePids(pids)

  console.log('')
  console.log(`  View logs:  tail -f ${join(LOG_DIR, 'web.log')}`)
  console.log(`  Stop with:  bun down`)
  console.log('')
  console.log('Now run: bun start-cli')
}

main().catch((error) => {
  console.error('Error starting services:', error)
  process.exit(1)
})
