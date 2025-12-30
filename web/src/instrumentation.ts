import { initAnalytics } from '@codebuff/common/analytics'
import { env } from '@codebuff/common/env'

import { logger } from '@/util/logger'

// This special file runs once when the Next.js server starts
// It initializes analytics for all server-side code including API routes
export function register() {
  console.log('🔵 [instrumentation] register() called')
  console.log('🔵 [instrumentation] NEXT_PUBLIC_CB_ENVIRONMENT:', env.NEXT_PUBLIC_CB_ENVIRONMENT)
  console.log('🔵 [instrumentation] Has PostHog API key:', !!env.NEXT_PUBLIC_POSTHOG_API_KEY)
  console.log('🔵 [instrumentation] Has PostHog host URL:', !!env.NEXT_PUBLIC_POSTHOG_HOST_URL)
  
  try {
    initAnalytics({
      logger,
      clientEnv: env,
    })
    console.log('🟢 [instrumentation] initAnalytics() completed')
  } catch (error) {
    console.error('🔴 [instrumentation] Failed to initialize analytics:', error)
    logger.warn(
      { error },
      'Failed to initialize analytics - continuing without analytics',
    )
  }
}
