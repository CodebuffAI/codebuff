#!/usr/bin/env node
/**
 * Completely isolated daemon that polls terminal colors via OSC
 * and broadcasts via Unix domain socket. This runs as a detached process
 * with no connection to the parent, avoiding any terminal I/O conflicts.
 */

import { createServer, type Server, type Socket } from 'net'
import { unlinkSync, existsSync, chmodSync } from 'fs'
import { detectTerminalTheme } from './terminal-color-detection'

// Timing constants
const POLL_INTERVAL_MS = 5_000
const IDLE_EXIT_MS = 15_000
const HEALTH_CHECK_INTERVAL_MS = 10_000

// Socket configuration
const SOCKET_PATH = process.env.SOCKET_PATH || '/tmp/codebuff-terminal-theme.sock'
const PARENT_PID = process.env.PARENT_PID ? parseInt(process.env.PARENT_PID, 10) : null

// Protocol constants
const SHUTDOWN_COMMAND = 'SHUTDOWN\n'
const PING_COMMAND = 'PING\n'
const PONG_RESPONSE = 'PONG\n'

let server: Server
let clients: Set<Socket> = new Set()
let lastTheme: string | null = null
let pollInterval: NodeJS.Timeout | null = null
let idleTimer: NodeJS.Timeout | null = null
let healthCheckInterval: NodeJS.Timeout | null = null

function scheduleIdleExit() {
  if (idleTimer) return
  idleTimer = setTimeout(() => {
    try {
      cleanup()
    } finally {
      process.exit(0)
    }
  }, IDLE_EXIT_MS)
}

function cancelIdleExit() {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}

/**
 * Check if parent process is still alive
 * @returns true if parent is alive or PID not provided, false otherwise
 */
function isParentAlive(): boolean {
  if (!PARENT_PID) return true // No parent tracking, assume alive

  try {
    // Sending signal 0 checks if process exists without actually sending a signal
    process.kill(PARENT_PID, 0)
    return true
  } catch (err) {
    // ESRCH means process doesn't exist
    return false
  }
}

/**
 * Periodic health check to ensure parent process is still alive
 */
function performHealthCheck() {
  if (!isParentAlive()) {
    // Parent died, clean up and exit
    try {
      cleanup()
    } finally {
      process.exit(0)
    }
  }
}

function cleanup() {
  try {
    if (server) server.close()
  } catch {}
  try {
    if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
  } catch {}
  if (pollInterval) {
    try { clearInterval(pollInterval) } catch {}
    pollInterval = null
  }
  if (healthCheckInterval) {
    try { clearInterval(healthCheckInterval) } catch {}
    healthCheckInterval = null
  }
}

async function pollAndBroadcast() {
  try {
    const theme = await detectTerminalTheme()
    if (theme && theme !== lastTheme) {
      lastTheme = theme
      // Broadcast to all connected clients
      const message = `${theme}\n`
      for (const client of clients) {
        try {
          client.write(message)
        } catch {
          clients.delete(client)
        }
      }
    }
  } catch {
    // Silently ignore errors
  }
}

async function main() {
  // Clean up stale socket
  if (existsSync(SOCKET_PATH)) {
    try {
      unlinkSync(SOCKET_PATH)
    } catch {}
  }

  // Create Unix domain socket server
  server = createServer((socket) => {
    clients.add(socket)
    cancelIdleExit()

    // Send current theme immediately
    if (lastTheme) {
      socket.write(`${lastTheme}\n`)
    }

    // Handle incoming commands
    socket.on('data', (data: Buffer) => {
      const message = data.toString()

      if (message === SHUTDOWN_COMMAND) {
        // Graceful shutdown requested by parent
        socket.write('OK\n')
        try {
          cleanup()
        } finally {
          process.exit(0)
        }
      } else if (message === PING_COMMAND) {
        // Health check from parent
        socket.write(PONG_RESPONSE)
      }
    })

    socket.on('close', () => {
      clients.delete(socket)
      if (clients.size === 0) scheduleIdleExit()
    })

    socket.on('error', () => {
      clients.delete(socket)
      if (clients.size === 0) scheduleIdleExit()
    })
  })

  server.listen(SOCKET_PATH, () => {
    // Set restrictive permissions (owner read/write only)
    try {
      chmodSync(SOCKET_PATH, 0o600)
    } catch {
      // Best effort; some platforms may not support chmod on sockets
    }
  })

  // Initial poll
  await pollAndBroadcast()

  // Poll every 5 seconds
  pollInterval = setInterval(() => {
    pollAndBroadcast().catch(() => {})
  }, POLL_INTERVAL_MS)
  // Don't keep the event loop alive for the interval alone
  ;(pollInterval as any)?.unref?.()

  // Health check: verify parent process is still alive
  if (PARENT_PID) {
    healthCheckInterval = setInterval(() => {
      performHealthCheck()
    }, HEALTH_CHECK_INTERVAL_MS)
    ;(healthCheckInterval as any)?.unref?.()
  }

  // If no one connects, exit after idle period
  scheduleIdleExit()
}

// Graceful shutdown on common signals and exit events
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'] as const) {
  process.on(sig, () => {
    try { cleanup() } finally { process.exit(0) }
  })
}
process.on('beforeExit', () => cleanup())
process.on('exit', () => cleanup())
process.on('uncaughtException', () => { try { cleanup() } finally { process.exit(1) } })
process.on('unhandledRejection', () => { try { cleanup() } finally { process.exit(1) } })

main().catch(() => { try { cleanup() } finally { process.exit(1) } })
