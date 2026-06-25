#!/usr/bin/env bun

/**
 * Start the Openbuff CLI development environment.
 *
 * Usage:
 *   bun dev              # Start CLI
 *   bun dev -- --debug   # Pass args to CLI
 *
 * The CLI runs directly in local/BYOK mode and does not require the deleted
 * hosted web app, billing service, or BigQuery package. Optional database
 * services can still be managed separately with bun up/down when needed.
 */

import { spawn, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

const PROJECT_ROOT = resolve(import.meta.dir, '..')
const LOG_DIR = join(PROJECT_ROOT, 'debug', 'console')
const BUN_PATH = join(PROJECT_ROOT, '.bin', 'bun')

// Track spawned processes for cleanup
let cliProcess: ChildProcess | null = null
let isShuttingDown = false

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
  }
}

function ok(name: string, message: string): void {
  console.log(`  \x1b[32m✓\x1b[0m ${name.padEnd(10)} ${message}`)
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

  console.log('')
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

  console.log('Starting Openbuff CLI development mode...')

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
