import { createPostHogClient, type AnalyticsClient } from './analytics-core'
import type { AnalyticsEvent } from './constants/analytics-events'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import { env } from '@codebuff/common/env'

let client: AnalyticsClient | undefined

export async function flushAnalytics(logger?: Logger) {
  if (!client) {
    return
  }
  try {
    await client.flush()
  } catch (error) {
    // Log the error but don't throw - flushing is best-effort
    logger?.warn({ error }, 'Failed to flush analytics')
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
  // Don't track events in non-production environments
  if (env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod') {
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
