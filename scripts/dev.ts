#!/usr/bin/env bun

/**
 * Start the full development environment
 *
 * Usage:
 *   bun dev              # Start services + CLI
 *   bun dev -- --debug   # Pass args to CLI
 *
 * This starts all services (db, studio, sdk, web), waits for them to be ready,
 * then runs the CLI in the foreground. When you exit the CLI (Ctrl+C),
 * all services are stopped.
 *
 * For running services without CLI:
 *   bun start-services   # Start services in background
 *   bun stop-services    # Stop services
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

// Track spawned processes for cleanup
let servicePids: ServicePids = { port: PORT }
let cliProcess: ChildProcess | null = null
let isShuttingDown = false

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

function killPid(pid: number): boolean {
  try {
    process.kill(pid, 0)
    process.kill(pid, 'SIGTERM')
    return true
  } catch {
    return false
  }
}

function killProcessesOnPort(port: string): void {
  try {
    const result = spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf-8' })
    if (result.stdout) {
      const pids = result.stdout.trim().split('\n').filter(Boolean)
      for (const pidStr of pids) {
        const pid = parseInt(pidStr, 10)
        if (!isNaN(pid)) killPid(pid)
      }
    }
  } catch {
    // Ignore
  }
}

async function cleanup(): Promise<void> {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log('')
  console.log('Shutting down...')
  console.log('')

  // Kill CLI first
  if (cliProcess && cliProcess.pid) {
    killPid(cliProcess.pid)
    ok('cli', 'stopped')
  }

  // Kill services
  if (servicePids.web) {
    killPid(servicePids.web)
    ok('web', 'stopped')
  }
  if (servicePids.studio) {
    killPid(servicePids.studio)
    ok('studio', 'stopped')
  }
  if (servicePids.sdk) {
    killPid(servicePids.sdk)
    ok('sdk', 'stopped')
  }

  // Kill by port as fallback
  killProcessesOnPort(servicePids.port)

  // Kill drizzle studio
  spawnSync('pkill', ['-f', `drizzle-kit.*${PROJECT_ROOT}`])

  // Clean up PID file
  try {
    unlinkSync(PID_FILE)
  } catch {
    // Ignore
  }

  console.log('')
}

async function killExistingServices(): Promise<void> {
  if (!existsSync(PID_FILE)) return

  try {
    const existing: ServicePids = JSON.parse(readFileSync(PID_FILE, 'utf-8'))
    if (existing.web) killPid(existing.web)
    if (existing.studio) killPid(existing.studio)
    if (existing.sdk) killPid(existing.sdk)
    killProcessesOnPort(existing.port)
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

function startBackgroundServices(): void {
  // Start SDK build
  const sdk = spawnBackgroundProcess(BUN_PATH, ['run', '--cwd', 'sdk', 'build'], 'sdk.log')
  if (sdk.pid) servicePids.sdk = sdk.pid
  ok('sdk', '(building)')

  // Start Drizzle Studio
  const studio = spawnBackgroundProcess(
    BUN_PATH,
    ['--cwd', 'packages/internal', 'db:studio'],
    'studio.log',
  )
  if (studio.pid) servicePids.studio = studio.pid
  ok('studio', '(background)')

  // Kill any existing web server on this port
  killProcessesOnPort(PORT)

  // Start web server
  const web = spawnBackgroundProcess(BUN_PATH, ['--cwd', 'web', 'dev'], 'web.log')
  if (web.pid) servicePids.web = web.pid
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
      process.stdout.write('\r\x1B[K')
      process.stdout.write('\x1B[?25h')
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

function startCli(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    console.log('')
    console.log('Starting CLI...')

    cliProcess = spawn(BUN_PATH, ['--cwd', 'cli', 'dev', ...args], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: process.env,
    })

    cliProcess.on('close', (code) => {
      resolve(code || 0)
    })

    cliProcess.on('error', (error) => {
      console.error('Failed to start CLI:', error)
      resolve(1)
    })
  })
}

async function main(): Promise<void> {
  // Get CLI args (everything after --)
  const args = process.argv.slice(2)

  ensureLogDir()

  // Set up signal handlers for cleanup
  process.on('SIGINT', async () => {
    await cleanup()
    process.exit(0)
  })
  process.on('SIGTERM', async () => {
    await cleanup()
    process.exit(0)
  })

  console.log('Starting development environment...')

  // Kill any existing services first
  await killExistingServices()

  // Start database (blocking)
  if (!startDb()) {
    process.exit(1)
  }

  // Start background services
  startBackgroundServices()

  // Save PIDs for stop-services (in case CLI crashes)
  writeFileSync(PID_FILE, JSON.stringify(servicePids, null, 2))

  // Wait for web to be healthy
  const healthy = await waitForHealth(60)

  if (!healthy) {
    console.log('')
    console.log(`  Check logs: tail -f ${join(LOG_DIR, 'web.log')}`)
    await cleanup()
    process.exit(1)
  }

  // Start CLI in foreground
  const exitCode = await startCli(args)

  // CLI exited, clean up everything
  await cleanup()
  process.exit(exitCode)
}

main().catch(async (error) => {
  console.error('Error:', error)
  await cleanup()
  process.exit(1)
})
