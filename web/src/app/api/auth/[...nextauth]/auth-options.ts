import { createAuthOptions } from '@codebuff/auth'
import { grantSignupCredits } from '@codebuff/billing'
import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { loops } from '@codebuff/internal'
import { env } from '@codebuff/internal/env'

import type { NextAuthOptions } from 'next-auth'

import { logger } from '@/util/logger'

export const authOptions: NextAuthOptions = createAuthOptions({
  credentials: {
    githubId: env.CODEBUFF_GITHUB_ID,
    githubSecret: env.CODEBUFF_GITHUB_SECRET,
    googleId: env.CODEBUFF_GOOGLE_ID,
    googleSecret: env.CODEBUFF_GOOGLE_SECRET,
  },
  hooks: {
    logger,
    onCreateUser: async (userData) => {
      try {
        await grantSignupCredits({ userId: userData.id, logger })
      } catch (error) {
        logger.error(
          { userId: userData.id, error },
          'Failed to grant signup credits.',
        )
      }

      await loops.sendSignupEventToLoops({
        ...userData,
        userId: userData.id,
        logger,
        signupSource: 'codebuff',
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
      const onboardUrl = new URL(`${baseUrl}/onboard`)
      potentialRedirectUrl.searchParams.forEach((value, key) => {
        onboardUrl.searchParams.set(key, value)
      })
      logger.debug(
        { url, authCode, redirectTarget: onboardUrl.toString() },
        'Redirecting CLI flow to /onboard',
      )
      return onboardUrl.toString()
    }

    if (url.startsWith('/') || potentialRedirectUrl.origin === baseUrl) {
      logger.debug(
        { url, redirectTarget: potentialRedirectUrl.toString() },
        'Redirecting web flow to callbackUrl',
      )
      return potentialRedirectUrl.toString()
    }

    logger.debug(
      { url, baseUrl, redirectTarget: baseUrl },
      'Callback URL is external or invalid, redirecting to baseUrl',
    )
    return baseUrl
  },
})
