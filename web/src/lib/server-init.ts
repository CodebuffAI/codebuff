import { initAnalytics } from '@codebuff/common/analytics'
// Errors if this file is included in client bundles
import 'server-only'

import type { Logger } from '@codebuff/common/types/contracts/logger'

import { logger } from '@/util/logger'

let initialized = false

export function initializeServer({ logger }: { logger: Logger }) {
  if (initialized) return

  try {
    initAnalytics({
      logger,
    })
    // Initialize other services as needed
    initialized = true
  } catch (error) {
    logger.warn(
      { error },
      'Failed to initialize analytics - continuing without analytics',
    )
    // Don't fail server initialization if analytics fails
    initialized = true
  }
}

initializeServer({ logger })
