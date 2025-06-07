import { initAnalytics } from '@codebuff/common/analytics'
// Errors if this file is included in client bundles
import 'server-only'

import { logger } from '@/util/logger'

let initialized = false

export function initializeServer() {
  if (initialized) return

  try {
    logger.info('Initializing web server services...')
    initAnalytics()
    // Initialize other services as needed
    initialized = true
    logger.info('Web server initialization complete')
  } catch (error) {
    logger.error({ error }, 'Failed to initialize web server services')
  }
}

initializeServer()
