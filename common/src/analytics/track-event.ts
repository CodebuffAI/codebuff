import { createPostHogClient, type AnalyticsClient } from './core'
import { AnalyticsEvent } from '../constants/analytics-events'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import { env, DEBUG_ANALYTICS } from '@codebuff/common/env'

let client: AnalyticsClient | undefined

/**
 * Reset client state for testing purposes.
 * @internal - Only exported for unit tests
 */
export function resetAnalyticsClient(): void {
  client = undefined
}

export async function flushAnalytics(logger?: Logger) {
  if (!client) {
    return
  }
  try {
    await client.flush()
  } catch (error) {
    logger?.warn({ error }, 'Failed to flush analytics')

    try {
      client.capture({
        distinctId: 'system',
        event: AnalyticsEvent.FLUSH_FAILED,
        properties: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
    } catch {
      // Silently ignore if we can't even track the failure
    }
  }
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
  if (env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod') {
    if (DEBUG_ANALYTICS) {
      logger.debug({ event, userId, properties }, `[analytics] ${event}`)
    }
    return
  }

  if (!client) {
    try {
      client = createPostHogClient(env.NEXT_PUBLIC_POSTHOG_API_KEY, {
        host: env.NEXT_PUBLIC_POSTHOG_HOST_URL,
        flushAt: 1,
        flushInterval: 0,
      })
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize analytics client')
      return
    }
    logger.info(
      { envName: env.NEXT_PUBLIC_CB_ENVIRONMENT },
      'Analytics client initialized',
    )
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
