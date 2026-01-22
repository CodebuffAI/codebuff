import {
  ADVISORY_LOCK_IDS,
  tryAcquireAdvisoryLock,
} from '@codebuff/internal/db'

import { startDiscordBot } from '../../src/discord/client'

import type { LockHandle } from '@codebuff/internal/db'
import type { Client } from 'discord.js'

const LOCK_RETRY_INTERVAL_MS = 30_000 // 30 seconds
const MAX_CONSECUTIVE_ERRORS = 5

let lockHandle: LockHandle | null = null
let discordClient: Client | null = null
let isShuttingDown = false

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function shutdown(exitCode: number = 0) {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log('Shutting down Discord bot...')

  if (discordClient) {
    try {
      discordClient.destroy()
    } catch (error) {
      console.error('Error destroying Discord client:', error)
    }
    discordClient = null
  }

  if (lockHandle) {
    await lockHandle.release()
    lockHandle = null
  }

  process.exit(exitCode)
}

async function main() {
  process.on('SIGTERM', () => shutdown(0))
  process.on('SIGINT', () => shutdown(0))

  let consecutiveErrors = 0
  let attemptCount = 0

  while (!isShuttingDown) {
    attemptCount++
    console.log(
      `Attempting to acquire Discord bot lock (attempt ${attemptCount})...`,
    )

    let acquired = false
    let handle: LockHandle | null = null

    try {
      const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)
      acquired = result.acquired
      handle = result.handle
      consecutiveErrors = 0 // Reset on successful DB connection
    } catch (error) {
      consecutiveErrors++
      console.error(
        `Error acquiring lock (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`,
        error,
      )

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error('Too many consecutive errors, exiting...')
        await shutdown(1)
        return
      }

      await sleep(LOCK_RETRY_INTERVAL_MS)
      continue
    }

    if (!acquired || !handle) {
      console.log(
        `Another instance is already running the Discord bot. Retrying in ${LOCK_RETRY_INTERVAL_MS / 1000} seconds...`,
      )
      await sleep(LOCK_RETRY_INTERVAL_MS)
      continue
    }

    lockHandle = handle
    console.log('Lock acquired. Starting Discord bot...')

    // Set up lock loss handler BEFORE starting the bot
    handle.onLost(() => {
      console.error('Advisory lock lost! Another instance may have taken over.')
      shutdown(1)
    })

    try {
      // Wait for bot to be ready - this is critical!
      // If login fails, we release the lock so another instance can try
      discordClient = await startDiscordBot()
      console.log('Discord bot is ready and running.')

      // Set up error handler for runtime errors
      discordClient.on('error', (error) => {
        console.error('Discord client error:', error)
      })

      // Handle disconnection
      discordClient.on('disconnect', () => {
        console.error('Discord client disconnected')
      })

      // Bot is running, keep the process alive
      return
    } catch (error) {
      console.error('Failed to start Discord bot:', error)

      // Release the lock so another instance can try
      await handle.release()
      lockHandle = null
      discordClient = null

      // Continue polling - maybe another instance will have better luck,
      // or maybe the issue is transient (Discord outage)
      console.log(`Will retry in ${LOCK_RETRY_INTERVAL_MS / 1000} seconds...`)
      await sleep(LOCK_RETRY_INTERVAL_MS)
    }
  }
}

main().catch(async (error) => {
  console.error('Fatal error in Discord bot script:', error)
  await shutdown(1)
})
