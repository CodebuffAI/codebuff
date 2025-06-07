import {
  Client,
  Events,
  GatewayIntentBits,
  Interaction,
  ChatInputCommandInteraction,
} from 'discord.js'
import { env } from '../env.mjs'
import db from '@codebuff/internal/db'
import { user } from '@codebuff/internal/db/schema'
import { eq, or } from 'drizzle-orm'
import { logger } from '@/util/logger'
import { isRateLimited } from './rate-limiter'

const VERIFIED_ROLE_ID = '1354877460583415929'
const WELCOME_CHANNEL_ID = '1272621334580429053'

export function startDiscordBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  })

  client.once(Events.ClientReady, (c) => {
    logger.info(`Discord bot ready! Logged in as ${c.user.tag}`)
  })

  // Listen for messages in the welcome channel
  client.on(Events.MessageCreate, async (message) => {
    if (message.channelId !== WELCOME_CHANNEL_ID) return

    // Check if this is a system message about a new member (7 is GuildMemberJoin)
    if (message.system && message.type === 7) {
      try {
        await message.reply({
          content: `Hey there! Enter \`/link\` to connect your Discord account with Codebuff (don't worry, only you can see it).`,
        })
      } catch (error) {
        logger.error({ error }, 'Failed to send welcome message')
      }
    }
  })

  // Handle slash commands
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return

    const command = interaction as ChatInputCommandInteraction

    // Check rate limit before processing command
    if (isRateLimited(command.user.id)) {
      await command.reply({
        content:
          'You are sending commands too quickly. Please wait a minute and try again.',
        ephemeral: true,
      })
      return
    }

    if (command.commandName === 'link') {
      const email = command.options.getString('email')

      if (!email) {
        await command.reply({
          content: 'Please provide your email address with the command.',
          ephemeral: true,
        })
        return
      }

      try {
        // Get any users with this discord_id or email in one query
        const users = await db
          .select({
            id: user.id,
            email: user.email,
            discordId: user.discord_id,
          })
          .from(user)
          .where(
            or(eq(user.discord_id, command.user.id), eq(user.email, email))
          )

        // Find the user with this email
        const userRecord = users.find((u) => u.email === email)

        if (
          // Discord ID is already linked to any account
          users.some((u) => u.discordId === command.user.id) ||
          // Email doesn't exist
          !userRecord ||
          // Email exists but has a different discord_id
          userRecord.discordId !== null
        ) {
          await command.reply({
            content: `I couldn't link that email to your Discord account. Make sure you're using the correct email and that it isn't already linked to another Discord account. Contact ${env.NEXT_PUBLIC_SUPPORT_EMAIL} if you need help.`,
            ephemeral: true,
          })
          return
        }

        // Update the discord_id since we know it's null
        await db
          .update(user)
          .set({ discord_id: command.user.id })
          .where(eq(user.id, userRecord.id))

        // Add the role
        if (command.guild) {
          try {
            const member = await command.guild.members.fetch(command.user.id)
            await member.roles.add(VERIFIED_ROLE_ID)
            logger.info(
              {
                userId: userRecord.id,
                discordId: command.user.id,
                discordUsername: command.user.username,
              },
              'Added verified role to user'
            )
          } catch (error) {
            logger.error({ error }, 'Failed to add verified role to user')
          }
        }

        await command.reply({
          content:
            "Thanks! I've linked your Discord account to your Codebuff account. You're all set! 🎉",
          ephemeral: true,
        })
      } catch (error) {
        logger.error({ error }, 'Error updating user Discord ID')
        await command.reply({
          content:
            'Sorry, I ran into an error while trying to link your account. Please try again later or contact support if the problem persists.',
          ephemeral: true,
        })
      }
    }
  })

  // Login to Discord
  client.login(env.DISCORD_BOT_TOKEN).catch((error) => {
    logger.error({ error }, 'Failed to start Discord bot')
  })

  return client
}
