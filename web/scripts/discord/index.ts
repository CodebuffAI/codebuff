import {
  ADVISORY_LOCK_IDS,
  tryAcquireAdvisoryLock,
  releaseAdvisoryLock,
} from '@codebuff/internal/db'

import { startDiscordBot } from '../../src/discord/client'

import type postgres from 'postgres'
import type { Client } from 'discord.js'

const LOCK_RETRY_INTERVAL_MS = 30_000 // 30 seconds

let lockConnection: postgres.Sql | null = null
let discordClient: Client | null = null
let isShuttingDown = false

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  // Set up shutdown handlers early
  const shutdown = async () => {
    if (isShuttingDown) return
    isShuttingDown = true

    console.log('Shutting down Discord bot...')
    if (discordClient) {
      discordClient.destroy()
    }
    await releaseAdvisoryLock(lockConnection)
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  // Poll for the lock until acquired
  let attemptCount = 0
  while (!isShuttingDown) {
    attemptCount++
    console.log(`Attempting to acquire Discord bot lock (attempt ${attemptCount})...`)

    const { acquired, connection } = await tryAcquireAdvisoryLock(
      ADVISORY_LOCK_IDS.DISCORD_BOT,
    )

    if (acquired) {
      lockConnection = connection
      console.log('Lock acquired. Starting Discord bot...')

      discordClient = startDiscordBot()
      return // Bot is running, exit the polling loop
    }

    console.log(
      `Another instance is already running the Discord bot. Retrying in ${LOCK_RETRY_INTERVAL_MS / 1000} seconds...`,
    )
    await sleep(LOCK_RETRY_INTERVAL_MS)
  }
}

main().catch(async (error) => {
  console.error('Error in Discord bot script:', error)
  // Clean up on error
  if (discordClient) {
    discordClient.destroy()
  }
  await releaseAdvisoryLock(lockConnection)
  process.exit(1)
})
