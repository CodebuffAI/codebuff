import {
  ADVISORY_LOCK_IDS,
  tryAcquireAdvisoryLock,
} from '@codebuff/internal/db'
import os from 'os'

import { startDiscordBot } from '../../src/discord/client'

import type { LockHandle } from '@codebuff/internal/db'
import type { Client } from 'discord.js'

const LOCK_RETRY_INTERVAL_MS = 30_000 // 30 seconds
const MAX_CONSECUTIVE_ERRORS = 5

let lockHandle: LockHandle | null = null
let discordClient: Client | null = null
let isShuttingDown = false

// Diagnostic logging helper with timestamp and process info
function log(level: 'info' | 'error' | 'warn', message: string, data?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString()
  const pid = process.pid
  const hostname = os.hostname()
  const prefix = `[${timestamp}] [PID:${pid}] [host:${hostname}] [discord-bot]`
  const dataStr = data ? ` ${JSON.stringify(data)}` : ''
  if (level === 'error') {
    console.error(`${prefix} ${message}${dataStr}`)
  } else if (level === 'warn') {
    console.warn(`${prefix} ${message}${dataStr}`)
  } else {
    console.log(`${prefix} ${message}${dataStr}`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function shutdown(exitCode: number = 0): Promise<void> {
  if (isShuttingDown) {
    log('warn', 'Shutdown already in progress, ignoring duplicate call')
    return
  }
  isShuttingDown = true

  log('info', 'Shutting down Discord bot...', { exitCode })

  if (discordClient) {
    try {
      log('info', 'Destroying Discord client...')
      discordClient.destroy()
      log('info', 'Discord client destroyed')
    } catch (error) {
      log('error', 'Error destroying Discord client', { error: String(error) })
    }
    discordClient = null
  }

  if (lockHandle) {
    log('info', 'Releasing advisory lock...')
    await lockHandle.release()
    log('info', 'Advisory lock released')
    lockHandle = null
  }

  log('info', 'Shutdown complete, exiting', { exitCode })
  process.exit(exitCode)
}

async function main() {
  const startTime = Date.now()
  log('info', 'Discord bot script starting', {
    pid: process.pid,
    hostname: os.hostname(),
    nodeVersion: process.version,
    platform: process.platform,
  })

  // Handle SIGTERM/SIGINT - shutdown() handles deduplication internally
  process.on('SIGTERM', () => {
    log('info', 'Received SIGTERM signal')
    void shutdown(0)
  })
  process.on('SIGINT', () => {
    log('info', 'Received SIGINT signal')
    void shutdown(0)
  })

  let consecutiveErrors = 0
  let attemptCount = 0

  while (!isShuttingDown) {
    attemptCount++
    const elapsedSec = Math.round((Date.now() - startTime) / 1000)
    log('info', `Attempting to acquire Discord bot lock`, { attemptCount, elapsedSeconds: elapsedSec })

    let acquired = false
    let handle: LockHandle | null = null

    try {
      const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)
      acquired = result.acquired
      handle = result.handle
      consecutiveErrors = 0 // Reset on successful DB connection
      log('info', 'Lock acquisition attempt completed', { acquired, consecutiveErrors })
    } catch (error) {
      consecutiveErrors++
      log('error', `Error acquiring lock`, {
        consecutiveErrors,
        maxErrors: MAX_CONSECUTIVE_ERRORS,
        error: String(error),
      })

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        log('error', 'Too many consecutive errors, exiting...')
        await shutdown(1)
        return
      }

      log('info', `Will retry in ${LOCK_RETRY_INTERVAL_MS / 1000} seconds...`)
      await sleep(LOCK_RETRY_INTERVAL_MS)
      continue
    }

    if (!acquired || !handle) {
      log('info', `Another instance is already running the Discord bot`, {
        retryInSeconds: LOCK_RETRY_INTERVAL_MS / 1000,
      })
      await sleep(LOCK_RETRY_INTERVAL_MS)
      continue
    }

    lockHandle = handle
    log('info', 'Lock acquired! Starting Discord bot...')

    // Set up lock loss handler BEFORE starting the bot
    handle.onLost(() => {
      log('error', 'Advisory lock lost! Another instance may have taken over.')
      shutdown(1)
    })

    try {
      // Wait for bot to be ready - this is critical!
      // If login fails, we release the lock so another instance can try
      log('info', 'Calling startDiscordBot()...')
      discordClient = await startDiscordBot()
      log('info', 'Discord bot is ready and running!', {
        uptime: Math.round((Date.now() - startTime) / 1000),
      })

      // Set up error handler for runtime errors
      discordClient.on('error', (error) => {
        log('error', 'Discord client error', { error: String(error) })
      })

      // Handle disconnection
      discordClient.on('disconnect', () => {
        log('error', 'Discord client disconnected')
      })

      // Bot is running, keep the process alive
      // Note: heartbeat logging is handled by advisory-lock health checks
      return
    } catch (error) {
      log('error', 'Failed to start Discord bot', { error: String(error) })

      // Release the lock so another instance can try
      log('info', 'Releasing lock after failed bot start...')
      await handle.release()
      lockHandle = null
      discordClient = null

      // Continue polling - maybe another instance will have better luck,
      // or maybe the issue is transient (Discord outage)
      log('info', `Will retry in ${LOCK_RETRY_INTERVAL_MS / 1000} seconds...`)
      await sleep(LOCK_RETRY_INTERVAL_MS)
    }
  }
}

main().catch(async (error) => {
  log('error', 'Fatal error in Discord bot script', { error: String(error), stack: (error as Error).stack })
  await shutdown(1)
})
