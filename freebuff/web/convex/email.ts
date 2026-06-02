'use node'

import { Resend } from 'resend'
import {
  BountySubmissionResultEmail,
  SendToComputerEmail,
  TicketReplyEmail,
} from '../src/vly/components/emails/send-to-computer'
import { action, internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { getAuthUser } from './users'
import { v } from 'convex/values'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

const DEFAULT_APP_URL = 'https://vly.ai'
const DISCORD_INVITE_URL = 'https://discord.gg/2gSmB9DxJW'
const WELCOME_FROM_EMAIL = 'Victor Cheng <victor@vly.ai>'
const WELCOME_REPLY_TO_EMAIL = 'victor@vly.ai'

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

export const sendMobileEmail = action({
  args: {},
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx)

    if (!user) {
      throw new Error('User not found')
    }

    const resend = new Resend(process.env.RESEND_API_KEY)

    const { data, error } = await resend.emails.send({
      from: 'vly.ai <no-reply@vly.ai>',
      to: [user.email],
      subject: 'Access your vly.ai account',
      react: await SendToComputerEmail({ firstName: user.name }),
    })

    return true
  },
})

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
      from: 'vly.ai <no-reply@vly.ai>',
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
      from: 'vly.ai <no-reply@vly.ai>',
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

    const subject = '⚫ welcome to vly.ai'
    const text = [
      `Hi ${firstName},`,
      '',
      `Welcome to vly.ai! My name is Victor, founder of vly.`,
      '',
      `I wanted to personally let you know that you can email me any time at ${WELCOME_REPLY_TO_EMAIL}.`,
      '',
      `You can also get live support from our team in our Discord: ${DISCORD_INVITE_URL}`,
      '',
      `When you choose vly, you're choosing a superior platform with a backend that's built for AI, 1000+ integrations, and unlimited credits via our rewards: ${earnPageUrl}`,
      '',
      'You can count on us to be partners with you for life.',
      '',
      'Excited to see what you build with us,',
      'Victor',
      'ceo',
    ].join('\n')

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
        <p>Hi ${firstName},</p>
        <p>Welcome to vly.ai! My name is Victor, founder of vly.</p>
        <p>I wanted to personally let you know that you can email me any time at <a href="mailto:${WELCOME_REPLY_TO_EMAIL}">${WELCOME_REPLY_TO_EMAIL}</a>.</p>
        <p>You can also get live support from our team in our <a href="${DISCORD_INVITE_URL}">Discord</a>.</p>
        <p>When you choose vly, you're choosing a superior platform with a backend that's built for AI, 1000+ integrations, and unlimited credits via our <a href="${earnPageUrl}">rewards</a>.</p>
        <p>You can count on us to be partners with you for life.</p>
        <p>Excited to see what you build with us,</p>
        <p>Victor</p>
        <p>ceo</p>
      </div>
    `

    const { error } = await resend.emails.send({
      from: WELCOME_FROM_EMAIL,
      replyTo: WELCOME_REPLY_TO_EMAIL,
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
      "Sorry to see you go. I'd love to know what we could have done better — just reply to this email. I personally read and respond to every message.",
      '',
      `As a heads up, we're keeping your early-bird 50% discount available for a limited time. You can reactivate at half price here: ${reactivateUrl}`,
      '',
      'Thanks for giving vly a try,',
      'Victor Cheng',
      'Founder, vly.ai',
    ].join('\n')

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
        <p>Hi ${firstName},</p>
        <p>Sorry to see you go. I'd love to know what we could have done better — just reply to this email. I personally read and respond to every message.</p>
        <p>As a heads up, we're keeping your early-bird 50% discount available for a limited time. You can reactivate at half price <a href="${reactivateUrl}">here</a>.</p>
        <p>Thanks for giving vly a try,</p>
        <p>Victor Cheng<br/>Founder, vly.ai</p>
      </div>
    `

    const { error } = await resend.emails.send({
      from: WELCOME_FROM_EMAIL,
      replyTo: WELCOME_REPLY_TO_EMAIL,
      to: [user.email],
      subject: "⚫ we're sorry to see you go",
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
