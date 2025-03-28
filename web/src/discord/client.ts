import { Client, Events, GatewayIntentBits, Interaction, ChatInputCommandInteraction } from 'discord.js'
import { env } from '../env.mjs'
import db from 'common/db'
import { user } from 'common/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { logger } from '@/util/logger'
import { isRateLimited } from './rate-limiter'

const VERIFIED_ROLE_ID = '1354877460583415929'

export function startDiscordBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ]
  })

  client.once(Events.ClientReady, c => {
    logger.info(`Discord bot ready! Logged in as ${c.user.tag}`)
  })

  // Handle slash commands
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return

    const command = interaction as ChatInputCommandInteraction

    // Check rate limit before processing command
    if (isRateLimited(command.user.id)) {
      await command.reply({
        content: 'You are sending commands too quickly. Please wait a minute and try again.',
        ephemeral: true
      })
      return
    }

    if (command.commandName === 'link') {
      const email = command.options.getString('email')
      
      if (!email) {
        await command.reply({
          content: 'Please provide your email address with the command.',
          ephemeral: true
        })
        return
      }

      try {
        // Try to update any user with this email and a null discord_id
        const result = await db
          .update(user)
          .set({ discord_id: command.user.id })
          .where(and(
            eq(user.email, email),
            isNull(user.discord_id)
          ))
          .returning({ id: user.id })

        // If no rows were updated, either email doesn't exist or already has discord_id
        if (result.length === 0) {
          await command.reply({
            content: `I couldn't link that email to your Discord account. Make sure you're using the correct email and that it isn't already linked to another Discord account. Contact ${env.NEXT_PUBLIC_SUPPORT_EMAIL} if you need help.`,
            ephemeral: true
          })
          return
        }

        // Update succeeded, add the role
        if (command.guild) {
          try {
            const member = await command.guild.members.fetch(command.user.id)
            await member.roles.add(VERIFIED_ROLE_ID)
            logger.info(
              { userId: result[0].id, discordId: command.user.id },
              'Added verified role to user'
            )
          } catch (error) {
            logger.error({ error }, 'Failed to add verified role to user')
          }
        }

        await command.reply({
          content: "Thanks! I've linked your Discord account to your Codebuff account. You're all set! 🎉",
          ephemeral: true
        })
      } catch (error) {
        logger.error({ error }, 'Error updating user Discord ID')
        await command.reply({
          content: 'Sorry, I ran into an error while trying to link your account. Please try again later or contact support if the problem persists.',
          ephemeral: true
        })
      }
    }
  })

  // Login to Discord
  client.login(env.DISCORD_BOT_TOKEN)
    .catch(error => {
      logger.error({ error }, 'Failed to start Discord bot')
    })

  return client
}