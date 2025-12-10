import { webEnv } from '@codebuff/internal/env'
import { REST, Routes, SlashCommandBuilder } from 'discord.js'

import { logger } from '@/util/logger'

const commands = [
  new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Discord account to your Codebuff account')
    .addStringOption((option) =>
      option
        .setName('email')
        .setDescription('The email address you used to register with Codebuff')
        .setRequired(true),
    ),
]

const rest = new REST().setToken(webEnv.DISCORD_BOT_TOKEN)

async function main() {
  try {
    logger.info('Started refreshing application (/) commands.')

    await rest.put(Routes.applicationCommands(webEnv.DISCORD_APPLICATION_ID), {
      body: commands,
    })

    logger.info('Successfully reloaded application (/) commands.')
  } catch (error) {
    logger.error({ error }, 'Error registering Discord commands')
    process.exit(1)
  }
}

main()
