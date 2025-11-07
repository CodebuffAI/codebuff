#!/usr/bin/env node
/**
 * Completely isolated daemon that polls terminal colors via OSC
 * and broadcasts via Unix domain socket. This runs as a detached process
 * with no connection to the parent, avoiding any terminal I/O conflicts.
 */

import { createServer, type Server, type Socket } from 'net'
import { unlinkSync, existsSync, chmodSync } from 'fs'
import { detectTerminalTheme } from './terminal-color-detection'
import { getSocketPath } from './terminal-theme-paths'

// Timing constants
const POLL_INTERVAL_MS = 5_000
const IDLE_EXIT_MS = 15_000

// Socket configuration - use fixed path for shared daemon
const SOCKET_PATH = getSocketPath()

// Protocol constants
const SHUTDOWN_COMMAND = 'SHUTDOWN\n'
const PING_COMMAND = 'PING\n'
const PONG_RESPONSE = 'PONG\n'

let server: Server
let clients: Set<Socket> = new Set()
let lastTheme: string | null = null
let pollInterval: NodeJS.Timeout | null = null
let idleTimer: NodeJS.Timeout | null = null

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

function cleanup() {
  try {
    if (server) server.close()
  } catch {}
  try {
    if (process.platform !== 'win32') {
      if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
    }
  } catch {}
  if (pollInterval) {
    try {
      clearInterval(pollInterval)
    } catch {}
    pollInterval = null
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

export async function runDaemonMain() {
  // Clean up stale socket on Unix only; Windows named pipes are not filesystem entries
  if (process.platform !== 'win32') {
    if (existsSync(SOCKET_PATH)) {
      try {
        unlinkSync(SOCKET_PATH)
      } catch {}
    }
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
    // Set restrictive permissions (owner read/write only) on Unix domain sockets
    if (process.platform !== 'win32') {
      try {
        chmodSync(SOCKET_PATH, 0o600)
      } catch {
        // Best effort; some platforms may not support chmod on sockets
      }
    }
  })

  // Initial poll
  await pollAndBroadcast()

  // Poll every 5 seconds
  pollInterval = setInterval(() => {
    pollAndBroadcast().catch(() => {})
  }, POLL_INTERVAL_MS)
  // Don't keep the event loop alive for the interval alone
  const intervalTimer = pollInterval as any
  if (intervalTimer?.unref) {
    intervalTimer.unref()
  }

  // If no one connects, exit after idle period
  scheduleIdleExit()
}

// Graceful shutdown on common signals and exit events
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'] as const) {
  process.on(sig, () => {
    try {
      cleanup()
    } finally {
      process.exit(0)
    }
  })
}
process.on('beforeExit', () => cleanup())
process.on('exit', () => cleanup())
process.on('uncaughtException', () => {
  try {
    cleanup()
  } finally {
    process.exit(1)
  }
})
process.on('unhandledRejection', () => {
  try {
    cleanup()
  } finally {
    process.exit(1)
  }
})

// Only auto-run if executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runDaemonMain().catch(() => {
    try {
      cleanup()
    } finally {
      process.exit(1)
    }
  })
}
