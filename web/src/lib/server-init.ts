import { initAnalytics } from '@codebuff/common/analytics'
// Errors if this file is included in client bundles
import 'server-only'

import { logger } from '@/util/logger'

let initialized = false

export function initializeServer() {
  if (initialized) return

  try {
    initAnalytics()
    // Initialize other services as needed
    initialized = true
  } catch (error) {
    logger.warn(
      { error },
      'Failed to initialize analytics - continuing without analytics'
    )
    // Don't fail server initialization if analytics fails
    initialized = true
  }
}

initializeServer()
