#!/usr/bin/env bun

/**
 * Stop development services started by start-services.ts
 *
 * Worktree-safe: Uses the port number from this worktree's config to only
 * kill processes running on that specific port.
 *
 * Bun automatically loads .env.local and .env.development.local,
 * so environment variables are available without manual sourcing.
 */

import { spawnSync } from 'child_process'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { join, resolve } from 'path'

const PROJECT_ROOT = resolve(import.meta.dir, '..')
const LOG_DIR = join(PROJECT_ROOT, 'debug', 'console')
const PID_FILE = join(LOG_DIR, 'services.json')

// Get port from environment (Bun loads .env files automatically)
const PORT = process.env.NEXT_PUBLIC_WEB_PORT || '3000'

interface ServicePids {
  studio?: number
  sdk?: number
  web?: number
  port: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

function killPid(pid: number): boolean {
  try {
    process.kill(pid, 0) // Check if exists
    process.kill(pid, 'SIGTERM')
    return true
  } catch {
    return false
  }
}

function killProcessesOnPort(port: string): boolean {
  try {
    const result = spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf-8' })
    if (!result.stdout) return false

    const pids = result.stdout.trim().split('\n').filter(Boolean)
    let killed = false

    for (const pidStr of pids) {
      const pid = parseInt(pidStr, 10)
      if (!isNaN(pid) && killPid(pid)) {
        killed = true
      }
    }

    return killed
  } catch {
    return false
  }
}

function killDrizzleStudio(): boolean {
  const result = spawnSync('pkill', ['-f', `drizzle-kit.*${PROJECT_ROOT}`])
  return result.status === 0
}

async function main(): Promise<void> {
  let stopped = false
  const pids = loadPids()
  const port = pids?.port || PORT

  // Kill tracked processes
  if (pids) {
    if (pids.web && killPid(pids.web)) stopped = true
    if (pids.studio && killPid(pids.studio)) stopped = true
    if (pids.sdk && killPid(pids.sdk)) stopped = true

    // Clean up PID file
    try {
      unlinkSync(PID_FILE)
    } catch {
      // Ignore
    }
  }

  // Also kill by port (worktree-safe fallback)
  if (killProcessesOnPort(port)) {
    stopped = true
  }

  // Kill drizzle studio for this project
  if (killDrizzleStudio()) {
    stopped = true
  }

  if (stopped) {
    await sleep(500)
    console.log(`✓ Services stopped (port ${port})`)
  } else {
    console.log('No services were running')
  }
}

main().catch((error) => {
  console.error('Error stopping services:', error)
  process.exit(1)
})
