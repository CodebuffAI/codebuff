import { env } from '../env.mjs'
import { logger } from '@/util/logger'

const commands = [
  {
    name: 'link',
    description: 'Link your Discord account to your Codebuff account',
    options: [
      {
        name: 'email',
        description: 'The email address you used to register with Codebuff',
        type: 3, // STRING type
        required: true,
      },
    ],
  },
]

async function main() {
  try {
    const response = await fetch(
      `https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/commands`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to register commands: ${error}`)
    }

    const data = await response.json()
    logger.info('Successfully registered Discord commands:', data)
  } catch (error) {
    logger.error({ error }, 'Error registering Discord commands')
    process.exit(1)
  }
}

main()