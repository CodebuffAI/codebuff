import { PostHog } from 'posthog-node'

import type { ClientEnv } from '@codebuff/common/types/contracts/env'
import type { AnalyticsEvent } from './constants/analytics-events'
import type { Logger } from '@codebuff/common/types/contracts/logger'

let client: PostHog | undefined

// Lazy load env to avoid validation at import time in test environments
let _cachedEnv: ClientEnv | undefined
let _cachedIsProd: boolean | undefined

const getEnv = (): ClientEnv => {
  if (_cachedEnv === undefined) {
    _cachedEnv = require('@codebuff/common/env').env as ClientEnv
  }
  return _cachedEnv
}

const getIsProd = (): boolean => {
  if (_cachedIsProd === undefined) {
    _cachedIsProd = require('@codebuff/common/env').IS_PROD as boolean
  }
  return _cachedIsProd
}

export function initAnalytics({ logger }: { logger: Logger }) {
  const env = getEnv()
  if (!env.NEXT_PUBLIC_POSTHOG_API_KEY || !env.NEXT_PUBLIC_POSTHOG_HOST_URL) {
    logger.warn(
      'Analytics environment variables not set - analytics will be disabled',
    )
    return
  }

  try {
    client = new PostHog(env.NEXT_PUBLIC_POSTHOG_API_KEY, {
      host: env.NEXT_PUBLIC_POSTHOG_HOST_URL,
      flushAt: 1,
      flushInterval: 0,
    })
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize analytics client')
  }
}

export async function flushAnalytics() {
  if (!client) {
    return
  }
  try {
    await client.flush()
  } catch (error) {}
}

export function trackEvent({
  event,
  userId,
  properties,
  logger,
}: {
  event: AnalyticsEvent
  userId: string
  properties?: Record<string, any>
  logger: Logger
}) {
  if (!getIsProd()) {
    // Note (James): This log was too noisy. Reenable it as you need to test something.
    // logger.info({ payload: { event, properties } }, event)
    return
  }

  if (!client) {
    initAnalytics({ logger })
    if (!client) {
      logger.warn(
        { event, userId },
        'Analytics client not initialized, skipping event tracking',
      )
      return
    }
  }

  try {
    client.capture({
      distinctId: userId,
      event,
      properties,
    })
  } catch (error) {
    logger.error({ error }, 'Failed to track event')
  }
}
