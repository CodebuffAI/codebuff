import { NextResponse } from 'next/server'
import { verifyKey } from 'discord-interactions'
import { env } from '@/env.mjs'
import db from 'common/db'
import { user } from 'common/db/schema'
import { eq } from 'drizzle-orm'
import { logger } from '@/util/logger'
import { isRateLimited } from './rate-limiter'

// Note: This file only handles Discord Interactions (slash commands, buttons, modals).
// If we need to handle events like message creation or member joins, we'll need to
// switch to using Discord's Gateway API via a proper bot client instead of just
// the Interactions endpoint.

// Discord interaction types
const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  MODAL_SUBMIT: 5,
} as const

const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
} as const

// // Discord channel IDs
// const DISCORD_CHANNELS = {
//   WELCOME: '1272621334580429053'
// } as const

// Verify Discord requests
async function verifyDiscordRequest(request: Request) {
  const signature = request.headers.get('x-signature-ed25519')
  const timestamp = request.headers.get('x-signature-timestamp')

  if (!signature || !timestamp) return false

  return verifyKey(
    await request.clone().arrayBuffer(),
    signature,
    timestamp,
    env.DISCORD_PUBLIC_KEY
  )
}

export async function POST(req: Request) {
  // Verify the request is from Discord
  if (!(await verifyDiscordRequest(req))) {
    return new NextResponse('Invalid signature', { status: 401 })
  }

  const interaction = await req.json()

  // Handle ping (required for setting up the endpoint)
  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG })
  }

  // Rate limit check (skip for ping)
  const userId = interaction.member?.user?.id
  if (userId && isRateLimited(userId)) {
    logger.warn({ userId }, 'User exceeded Discord interaction rate limit')
    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content:
          'You are sending commands too quickly. Please wait a minute and try again.',
        ephemeral: true,
      },
    })
  }

  // Handle slash command
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = interaction.data

    if (name === 'link') {
      const email = options?.[0]?.value

      if (!email) {
        return NextResponse.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content:
              'Please provide your email address with the command, like: `/link your@email.com`',
            ephemeral: true,
          },
        })
      }

      try {
        // Look up user by email
        const users = await db
          .select()
          .from(user)
          .where(eq(user.email, email))
          .limit(1)

        const dbUser = users[0]

        if (dbUser) {
          // Update the user's discord ID
          await db
            .update(user)
            .set({ discord_id: interaction.member.user.id })
            .where(eq(user.id, dbUser.id))

          logger.info(
            { userId: dbUser.id, discordId: interaction.member.user.id },
            'Linked Discord account to user'
          )

          return NextResponse.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content:
                "Thanks! I've linked your Discord account to your Codebuff account. You're all set! 🎉",
              ephemeral: true,
            },
          })
        } else {
          return NextResponse.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `I couldn't find that email in our system. Please make sure you're using the same email you used to register with Codebuff, or reach out to ${env.NEXT_PUBLIC_SUPPORT_EMAIL} for help.`,
              ephemeral: true,
            },
          })
        }
      } catch (error) {
        logger.error({ error }, 'Error updating user Discord ID')
        return NextResponse.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content:
              'Sorry, I ran into an error while trying to link your account. Please try again later or contact support if the problem persists.',
            ephemeral: true,
          },
        })
      }
    }
  }

  // Default response for unhandled interactions
  return NextResponse.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content:
        'Unknown command. Please use `/link your@email.com` to link your Discord account.',
      ephemeral: true,
    },
  })
}
