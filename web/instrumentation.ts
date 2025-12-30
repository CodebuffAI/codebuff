import { initAnalytics } from '@codebuff/common/analytics'
import { env } from '@codebuff/common/env'

import { logger } from '@/util/logger'

// This special file runs once when the Next.js server starts
// It initializes analytics for all server-side code including API routes
export function register() {
  try {
    initAnalytics({
      logger,
      clientEnv: env,
    })
  } catch (error) {
    logger.warn(
      { error },
      'Failed to initialize analytics - continuing without analytics',
    )
  }
}
