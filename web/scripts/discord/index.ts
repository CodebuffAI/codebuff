import { startDiscordBot } from '../../src/discord/client'

async function main() {
  try {
    console.log('Starting Discord bot...')
    startDiscordBot()
  } catch (error) {
    console.error('Error starting Discord bot:', error)
    process.exit(1)
  }
}

main()
