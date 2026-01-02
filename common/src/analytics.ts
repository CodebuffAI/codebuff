import {
  createPostHogClient,
  getConfigFromEnv,
  isProdEnv,
  type AnalyticsClient,
  type AnalyticsConfig,
  type PostHogClientOptions,
} from './analytics-core'

import type { AnalyticsEvent } from './constants/analytics-events'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import { env } from '@codebuff/common/env'

// Re-export types from core for backwards compatibility
export type { AnalyticsClient, AnalyticsConfig } from './analytics-core'

/** Dependencies that can be injected for testing */
export interface ServerAnalyticsDeps {
  createClient: (
    apiKey: string,
    options: PostHogClientOptions,
  ) => AnalyticsClient
}

let client: AnalyticsClient | undefined
let analyticsConfig: AnalyticsConfig | null = null
let injectedDeps: ServerAnalyticsDeps | undefined

/** Get client factory (injected or default PostHog) */
function getCreateClient() {
  return injectedDeps?.createClient ?? createPostHogClient
}

/** Reset analytics state - for testing only */
export function resetServerAnalyticsState(deps?: ServerAnalyticsDeps) {
  client = undefined
  analyticsConfig = null
  injectedDeps = deps
}

/** Get current config - exposed for testing */
export function getAnalyticsConfig() {
  return analyticsConfig
}

export const configureAnalytics = (config: AnalyticsConfig | null) => {
  analyticsConfig = config
  client = undefined
}

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
  if (!isProdEnv(analyticsConfig?.envName)) {
    // Note (James): This log was too noisy. Reenable it as you need to test something.
    // logger.info({ payload: { event, properties } }, event)
    return
  }

  if (!client) {
    configureAnalytics(getConfigFromEnv(env))
    const createClient = getCreateClient()

    try {
      client = createClient(analyticsConfig!.posthogApiKey, {
        host: analyticsConfig!.posthogHostUrl,
        flushAt: 1,
        flushInterval: 0,
      })
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize analytics client')
      return
    }
    logger.info(
      { envName: analyticsConfig?.envName },
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
