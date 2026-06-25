#!/usr/bin/env bun

/**
 * Check the status of optional local development services.
 *
 * Usage:
 *   bun status-services    # Check if services are running
 *
 * Bun automatically loads .env.local and .env.development.local,
 * so environment variables are available without manual sourcing.
 */

import { spawnSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'

const PROJECT_ROOT = resolve(import.meta.dir, '..')
const LOG_DIR = join(PROJECT_ROOT, 'debug', 'console')
const PID_FILE = join(LOG_DIR, 'services.json')
const STUDIO_PORT = '4983' // Drizzle Studio default port

interface ServicePids {
  studio?: number
  sdk?: number
}

function ok(name: string, message: string): void {
  console.log(`  \x1b[32m✓\x1b[0m ${name.padEnd(10)} ${message}`)
}

function fail(name: string, message: string): void {
  console.log(`  \x1b[31m✗\x1b[0m ${name.padEnd(10)} ${message}`)
}

function warn(name: string, message: string): void {
  console.log(`  \x1b[33m?\x1b[0m ${name.padEnd(10)} ${message}`)
}

function loadPids(): ServicePids | null {
  if (!existsSync(PID_FILE)) {
    return null
  }
  try {
    return JSON.parse(readFileSync(PID_FILE, 'utf-8'))
  } catch {
    return null
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function getProcessesOnPort(port: string): number[] {
  try {
    const result = spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf-8' })
    if (!result.stdout) return []

    return result.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n))
  } catch {
    return []
  }
}

function isDockerDbRunning(): boolean {
  try {
    const result = spawnSync('docker', ['ps', '--filter', 'name=manicode-db', '--format', '{{.Status}}'], {
      encoding: 'utf-8',
    })
    return result.stdout.includes('Up')
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  console.log('')
  console.log('Optional Service Status:')
  console.log('')

  const pids = loadPids()
  let anyRunning = false

  // Check database
  if (isDockerDbRunning()) {
    ok('db', 'running (Docker)')
    anyRunning = true
  } else {
    fail('db', 'not running')
  }

  // Check studio by port
  const studioProcesses = getProcessesOnPort(STUDIO_PORT)
  if (studioProcesses.length > 0) {
    ok('studio', `running on port ${STUDIO_PORT}`)
    anyRunning = true
  } else {
    fail('studio', `not running on port ${STUDIO_PORT}`)
  }

  // Check SDK build (if tracked)
  if (pids?.sdk) {
    if (isProcessRunning(pids.sdk)) {
      ok('sdk', `running (PID ${pids.sdk})`)
      anyRunning = true
    } else {
      // SDK build completes and exits, so this is expected
      ok('sdk', 'build completed')
    }
  } else {
    warn('sdk', 'not tracked')
  }

  console.log('')

  if (anyRunning) {
    console.log('  To stop optional services: bun down')
  } else {
    console.log('  To start optional services: bun up')
  }

  console.log('')
}

main().catch((error) => {
  console.error('Error checking status:', error)
  process.exit(1)
})
