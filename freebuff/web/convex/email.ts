'use node'

import { Resend } from 'resend'
import {
  BountySubmissionResultEmail,
  TicketReplyEmail,
} from '../src/vly/components/emails/send-to-computer'
import { action, internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { getAuthUser } from './users'
import { v } from 'convex/values'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

const DEFAULT_APP_URL = 'https://freebuff.app'
const DISCORD_INVITE_URL = 'https://discord.gg/yXG3w7wxfs'
const FREEBUFF_FROM_EMAIL = 'James from Freebuff <james@mail.freebuff.app>'
const FREEBUFF_REPLY_TO_EMAIL = 'support@codebuff.com'

function getAppBaseUrl(): string {
  const rawUrl =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || DEFAULT_APP_URL
  return rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl
}

function getEarnPageUrl(): string {
  return `${getAppBaseUrl()}/earn`
}

function firstNameFromDisplayName(name?: string | null): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) {
    return 'there'
  }
  return trimmed.split(/\s+/)[0] ?? 'there'
}

export const sendTicketReplyEmail = action({
  args: {
    recipientEmail: v.string(),
    recipientName: v.string(),
    ticketTitle: v.string(),
    messageContent: v.string(),
    ticketUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY

    if (!apiKey) {
      console.error('[sendTicketReplyEmail] RESEND_API_KEY is not configured')
      return { success: false, error: 'RESEND_API_KEY not configured' }
    }

    const resend = new Resend(apiKey)

    const emailSubject = `New reply on your ticket: "${args.ticketTitle}"`
    const emailHtml = renderToStaticMarkup(
      React.createElement(TicketReplyEmail, {
        recipientName: args.recipientName,
        ticketTitle: args.ticketTitle,
        messageContent: args.messageContent,
        ticketUrl: args.ticketUrl,
      }),
    )

    const { data, error } = await resend.emails.send({
      from: FREEBUFF_FROM_EMAIL,
      replyTo: FREEBUFF_REPLY_TO_EMAIL,
      to: [args.recipientEmail],
      subject: emailSubject,
      html: emailHtml,
    })

    if (error) {
      console.error(
        `[sendTicketReplyEmail] Failed to send email: ${error.message}`,
      )
      return { success: false, error: error.message }
    }

    console.log(`[sendTicketReplyEmail] Sent to ${args.recipientEmail}`)
    return { success: true, error: null }
  },
})

export const sendBountySubmissionResultEmail = internalAction({
  args: {
    recipientEmail: v.string(),
    recipientName: v.string(),
    bountyTitle: v.string(),
    approved: v.boolean(),
    rewardAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY

    if (!apiKey) {
      console.error(
        '[sendBountySubmissionResultEmail] RESEND_API_KEY is not configured',
      )
      return { success: false, error: 'RESEND_API_KEY not configured' }
    }

    const resend = new Resend(apiKey)

    const subject = args.approved
      ? `Bounty approved: "${args.bountyTitle}"`
      : `Bounty not approved: "${args.bountyTitle}"`

    const emailHtml = renderToStaticMarkup(
      React.createElement(BountySubmissionResultEmail, {
        recipientName: args.recipientName,
        bountyTitle: args.bountyTitle,
        approved: args.approved,
        rewardAmount: args.rewardAmount,
      }),
    )

    const { error } = await resend.emails.send({
      from: FREEBUFF_FROM_EMAIL,
      replyTo: FREEBUFF_REPLY_TO_EMAIL,
      to: [args.recipientEmail],
      subject,
      html: emailHtml,
    })

    if (error) {
      console.error(
        `[sendBountySubmissionResultEmail] Failed to send: ${error.message}`,
      )
      return { success: false, error: error.message }
    }

    console.log(
      `[sendBountySubmissionResultEmail] Sent to ${args.recipientEmail}`,
    )
    return { success: true, error: null }
  },
})

export const sendWelcomeEmailInternal = internalAction({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.error(
        '[sendWelcomeEmailInternal] RESEND_API_KEY is not configured',
      )
      return { success: false, error: 'RESEND_API_KEY not configured' }
    }

    const user = await ctx.runQuery(internal.users.get, {
      userId: args.userId,
    })
    if (!user || !user.email) {
      return { success: false, error: 'User not found or missing email' }
    }

    const resend = new Resend(apiKey)
    const earnPageUrl = getEarnPageUrl()
    const firstName = firstNameFromDisplayName(user.name)

    const subject = 'Welcome to Freebuff'
    const text = [
      `Hi ${firstName},`,
      '',
      `Welcome to Freebuff. My name is James, and I’ll be your point of contact here.`,
      '',
      `You can email me any time at ${FREEBUFF_REPLY_TO_EMAIL}.`,
      '',
      `You can also get live support from our team in our Discord: ${DISCORD_INVITE_URL}`,
      '',
      `Freebuff is the free coding agent from Codebuff. You can use it to build, fix, and ship projects without worrying about credits. You can also earn more here: ${earnPageUrl}`,
      '',
      'If you get stuck, want help, or have feedback, just reply to this email.',
      '',
      'Excited to see what you build with us,',
      'James',
    ].join('\n')

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
        <p>Hi ${firstName},</p>
        <p>Welcome to Freebuff. My name is James, and I’ll be your point of contact here.</p>
        <p>You can email me any time at <a href="mailto:${FREEBUFF_REPLY_TO_EMAIL}">${FREEBUFF_REPLY_TO_EMAIL}</a>.</p>
        <p>You can also get live support from our team in our <a href="${DISCORD_INVITE_URL}">Discord</a>.</p>
        <p>Freebuff is the free coding agent from Codebuff. You can use it to build, fix, and ship projects without worrying about credits. You can also earn more <a href="${earnPageUrl}">here</a>.</p>
        <p>If you get stuck, want help, or have feedback, just reply to this email.</p>
        <p>Excited to see what you build with us,</p>
        <p>James</p>
      </div>
    `

    const { error } = await resend.emails.send({
      from: FREEBUFF_FROM_EMAIL,
      replyTo: FREEBUFF_REPLY_TO_EMAIL,
      to: [user.email],
      subject,
      text,
      html,
    })

    if (error) {
      console.error(
        `[sendWelcomeEmailInternal] Failed to send to ${user.email}: ${error.message}`,
      )
      return { success: false, error: error.message }
    }

    console.log(`[sendWelcomeEmailInternal] Sent to ${user.email}`)
    return { success: true, error: null }
  },
})

export const sendCancellationEmail = action({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx)
    if (!user || !user.email) {
      return { success: false, error: 'User not found or missing email' }
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.error('[sendCancellationEmail] RESEND_API_KEY is not configured')
      return { success: false, error: 'RESEND_API_KEY not configured' }
    }

    const resend = new Resend(apiKey)
    const firstName = firstNameFromDisplayName(user.name)
    const reactivateUrl = `${getAppBaseUrl()}/web/dashboard`

    const text = [
      `Hi ${firstName},`,
      '',
      "Sorry to see you go. I'd love to know what we could have done better. Just reply to this email.",
      '',
      `As a heads up, we're keeping your early-bird 50% discount available for a limited time. You can reactivate at half price here: ${reactivateUrl}`,
      '',
      'Thanks for giving Freebuff a try,',
      'James from Freebuff',
    ].join('\n')

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
        <p>Hi ${firstName},</p>
        <p>Sorry to see you go. I'd love to know what we could have done better. Just reply to this email.</p>
        <p>As a heads up, we're keeping your early-bird 50% discount available for a limited time. You can reactivate at half price <a href="${reactivateUrl}">here</a>.</p>
        <p>Thanks for giving Freebuff a try,</p>
        <p>James from Freebuff</p>
      </div>
    `

    const { error } = await resend.emails.send({
      from: FREEBUFF_FROM_EMAIL,
      replyTo: FREEBUFF_REPLY_TO_EMAIL,
      to: [user.email],
      subject: "We're sorry to see you go",
      text,
      html,
    })

    if (error) {
      console.error(
        `[sendCancellationEmail] Failed to send to ${user.email}: ${error.message}`,
      )
      return { success: false, error: error.message }
    }

    console.log(`[sendCancellationEmail] Sent to ${user.email}`)
    return { success: true, error: null }
  },
})
