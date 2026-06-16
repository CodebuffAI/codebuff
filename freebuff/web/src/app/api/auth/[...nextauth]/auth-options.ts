import { createAuthOptions } from '@codebuff/auth'
import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { env } from '@codebuff/internal/env'

import type { NextAuthOptions } from 'next-auth'
import { Resend } from 'resend'

import {
  getCliAuthCodeHashPrefix,
  getCliAuthOnboardSearchParams,
  isCliAuthCodeCandidate,
} from '@/app/onboard/_helpers'
import { getFreebuffNextAuthUrl } from '../../../../lib/freebuff-server-env'
import { logger } from '@/util/logger'

const useJwtOnlyAuth =
  env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev' &&
  process.env.FREEBUFF_DEV_AUTH_WITHOUT_DB === 'true'

const FREEBUFF_FROM_EMAIL = 'James from Freebuff <james@mail.freebuff.app>'
const FREEBUFF_REPLY_TO_EMAIL = 'support@codebuff.com'
const DISCORD_INVITE_URL = 'https://discord.gg/yXG3w7wxfs'

function firstNameFromDisplayName(name?: string | null): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) {
    return 'there'
  }
  return trimmed.split(/\s+/)[0] ?? 'there'
}

async function sendFreebuffWelcomeEmail(params: {
  userId: string
  email: string | null
  name: string | null
}) {
  if (!params.email) {
    logger.warn(
      { userId: params.userId },
      'User email missing, cannot send welcome email.',
    )
    return
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    logger.warn(
      { userId: params.userId },
      'RESEND_API_KEY is not configured; skipping welcome email.',
    )
    return
  }

  const firstName = firstNameFromDisplayName(params.name)
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
    `Freebuff is the free coding agent from Codebuff. You can use it to build, fix, and ship projects without worrying about credits.`,
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
      <p>Freebuff is the free coding agent from Codebuff. You can use it to build, fix, and ship projects without worrying about credits.</p>
      <p>If you get stuck, want help, or have feedback, just reply to this email.</p>
      <p>Excited to see what you build with us,</p>
      <p>James</p>
    </div>
  `

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from: FREEBUFF_FROM_EMAIL,
    replyTo: FREEBUFF_REPLY_TO_EMAIL,
    to: [params.email],
    subject,
    text,
    html,
  })

  if (error) {
    logger.error(
      { error, userId: params.userId, email: params.email },
      'Failed to send Freebuff welcome email.',
    )
  }
}

export const authOptions: NextAuthOptions = createAuthOptions({
  jwtOnly: useJwtOnlyAuth,
  credentials: {
    githubId: env.FREEBUFF_GITHUB_ID ?? env.CODEBUFF_GITHUB_ID,
    githubSecret: env.FREEBUFF_GITHUB_SECRET ?? env.CODEBUFF_GITHUB_SECRET,
    googleId: env.FREEBUFF_GOOGLE_ID ?? env.CODEBUFF_GOOGLE_ID,
    googleSecret: env.FREEBUFF_GOOGLE_SECRET ?? env.CODEBUFF_GOOGLE_SECRET,
  },
  hooks: {
    logger,
    onCreateUser: async (userData) => {
      // Freebuff is free - new accounts do not receive any credit grant.
      await sendFreebuffWelcomeEmail({
        userId: userData.id,
        email: userData.email,
        name: userData.name,
      })

      trackEvent({
        event: AnalyticsEvent.SIGNUP,
        userId: userData.id,
        logger,
      })
    },
  },
  redirect: async ({ url, baseUrl }) => {
    const potentialRedirectUrl = new URL(url, baseUrl)
    const authCode = potentialRedirectUrl.searchParams.get('auth_code')

    if (authCode) {
      if (!isCliAuthCodeCandidate(authCode)) {
        const searchParamKeys = Array.from(
          potentialRedirectUrl.searchParams.keys(),
        ).sort()
        logger.warn(
          {
            authCodeLength: authCode.length,
            authCodeTrimmedLength: authCode.trim().length,
            authCodeHashPrefix: getCliAuthCodeHashPrefix(authCode),
            authCodeParamCount:
              potentialRedirectUrl.searchParams.getAll('auth_code').length,
            searchParamKeys,
            searchParamCount: searchParamKeys.length,
            hasCallbackUrlParam: searchParamKeys.includes('callbackUrl'),
            hasCodeParam: searchParamKeys.includes('code'),
            hasRedirectParam: searchParamKeys.includes('redirect'),
            dotCount: authCode.match(/\./g)?.length ?? 0,
            hyphenCount: authCode.match(/-/g)?.length ?? 0,
            redirectUrlOrigin: potentialRedirectUrl.origin,
            baseUrl,
          },
          'Freebuff auth redirect received non-CLI-shaped auth_code',
        )
        return baseUrl
      }

      const onboardUrl = new URL('/onboard', getFreebuffNextAuthUrl())
      onboardUrl.search = getCliAuthOnboardSearchParams(
        potentialRedirectUrl.searchParams,
        authCode,
      ).toString()
      return onboardUrl.toString()
    }

    if (url.startsWith('/') || potentialRedirectUrl.origin === baseUrl) {
      return potentialRedirectUrl.toString()
    }

    return baseUrl
  },
})
