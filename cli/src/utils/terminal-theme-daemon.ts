#!/usr/bin/env node
/**
 * Completely isolated daemon that polls terminal colors via OSC
 * and broadcasts via Unix domain socket. This runs as a detached process
 * with no connection to the parent, avoiding any terminal I/O conflicts.
 */

import { createServer, type Server } from 'net'
import { unlinkSync, existsSync } from 'fs'
import { detectTerminalTheme } from './terminal-color-detection'

const POLL_INTERVAL_MS = 5_000
const SOCKET_PATH = process.env.SOCKET_PATH || '/tmp/codebuff-terminal-theme.sock'

let server: Server
let clients: Set<any> = new Set()
let lastTheme: string | null = null

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

    // Send current theme immediately
    if (lastTheme) {
      socket.write(`${lastTheme}\n`)
    }

    socket.on('close', () => {
      clients.delete(socket)
    })

    socket.on('error', () => {
      clients.delete(socket)
    })
  })

  server.listen(SOCKET_PATH)

  // Initial poll
  await pollAndBroadcast()

  // Poll every 5 seconds
  setInterval(() => {
    pollAndBroadcast().catch(() => {})
  }, POLL_INTERVAL_MS)
}

main().catch(() => process.exit(1))
