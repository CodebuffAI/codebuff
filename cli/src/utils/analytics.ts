import {
  createPostHogClient,
  generateAnonymousId,
  type AnalyticsClientWithIdentify,
  type PostHogClientOptions,
} from '@codebuff/common/analytics'
import {
  env as defaultEnv,
  IS_PROD as defaultIsProd,
  DEBUG_ANALYTICS,
} from '@codebuff/common/env'

import type { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'


// Re-export types from core for backwards compatibility
export type { AnalyticsClientWithIdentify as AnalyticsClient } from '@codebuff/common/analytics'

export enum AnalyticsErrorStage {
  Init = 'init',
  Track = 'track',
  Identify = 'identify',
  Flush = 'flush',
  CaptureException = 'captureException',
}

type AnalyticsErrorContext = {
  stage: AnalyticsErrorStage
} & Record<string, unknown>

type AnalyticsErrorLogger = (
  error: unknown,
  context: AnalyticsErrorContext,
) => void

type ResolvedAnalyticsDeps = {
  env: AnalyticsDeps['env']
  isProd: boolean
  createClient: AnalyticsDeps['createClient']
  generateAnonymousId: NonNullable<AnalyticsDeps['generateAnonymousId']>
}

/** Dependencies that can be injected for testing */
export interface AnalyticsDeps {
  env: {
    NEXT_PUBLIC_POSTHOG_API_KEY?: string
    NEXT_PUBLIC_POSTHOG_HOST_URL?: string
  }
  isProd: boolean
  createClient: (
    apiKey: string,
    options: PostHogClientOptions,
  ) => AnalyticsClientWithIdentify
  generateAnonymousId?: () => string
}

// Anonymous ID used before user identification (for PostHog alias)
let anonymousId: string | undefined
// Real user ID after identification
let currentUserId: string | undefined
let client: AnalyticsClientWithIdentify | undefined

// Store injected dependencies (for testing)
let injectedDeps: AnalyticsDeps | undefined

function resolveDeps(): ResolvedAnalyticsDeps {
  return {
    env: injectedDeps?.env ?? defaultEnv,
    isProd: injectedDeps?.isProd ?? defaultIsProd,
    createClient: injectedDeps?.createClient ?? createPostHogClient,
    generateAnonymousId:
      injectedDeps?.generateAnonymousId ?? generateAnonymousId,
  }
}

let loggerModulePromise:
  | Promise<{ logger: { debug: (data: any, msg?: string, ...args: any[]) => void } }>
  | null = null

const loadLogger = () => {
  if (!loggerModulePromise) {
    loggerModulePromise = import('./logger')
  }
  return loggerModulePromise
}

function logAnalyticsDebug(message: string, data: Record<string, unknown>) {
  if (!DEBUG_ANALYTICS) {
    return
  }
  void loadLogger()
    .then(({ logger }) => {
      logger.debug(data, message)
    })
    .catch(() => {
      try {
        console.debug(message, data)
      } catch {
        // Ignore console errors in restricted environments
      }
    })
}

/** Get current distinct ID (real user ID if identified, otherwise anonymous ID) */
function getDistinctId(): string | undefined {
  return currentUserId ?? anonymousId
}

/** Reset analytics state - for testing only */
export function resetAnalyticsState(deps?: AnalyticsDeps) {
  anonymousId = undefined
  currentUserId = undefined
  client = undefined
  injectedDeps = deps
  identified = false
}

export let identified: boolean = false
let analyticsErrorLogger: AnalyticsErrorLogger | undefined

export function setAnalyticsErrorLogger(loggerFn: AnalyticsErrorLogger) {
  analyticsErrorLogger = loggerFn
}

function logAnalyticsError(error: unknown, context: AnalyticsErrorContext) {
  try {
    analyticsErrorLogger?.(error, context)
  } catch {
    // Never throw from error reporting
  }
}

export function initAnalytics() {
  const { env, isProd, createClient, generateAnonymousId } = resolveDeps()

  if (!env.NEXT_PUBLIC_POSTHOG_API_KEY || !env.NEXT_PUBLIC_POSTHOG_HOST_URL) {
    const error = new Error(
      'NEXT_PUBLIC_POSTHOG_API_KEY or NEXT_PUBLIC_POSTHOG_HOST_URL is not set',
    )
    logAnalyticsError(error, {
      stage: AnalyticsErrorStage.Init,
      missingEnv: true,
    })
    throw error
  }

  // Generate anonymous ID for pre-login tracking
  // PostHog will merge this with the real user ID via alias() when user logs in
  anonymousId = generateAnonymousId()
  identified = false

  try {
    client = createClient(env.NEXT_PUBLIC_POSTHOG_API_KEY, {
      host: env.NEXT_PUBLIC_POSTHOG_HOST_URL,
      enableExceptionAutocapture: isProd,
    })
  } catch (error) {
    logAnalyticsError(error, { stage: AnalyticsErrorStage.Init })
    throw error
  }
}

export async function flushAnalytics() {
  if (!client) {
    return
  }
  try {
    await client.flush()
  } catch (error) {
    // Silently handle PostHog network errors - don't log to console or logger
    // This prevents PostHog errors from cluttering the user's console
    logAnalyticsError(error, { stage: AnalyticsErrorStage.Flush })
  }
}

export function trackEvent(
  event: AnalyticsEvent,
  properties?: Record<string, any>,
) {
  const { isProd } = resolveDeps()
  const distinctId = getDistinctId()

  if (!client) {
    if (isProd) {
      const error = new Error('Analytics client not initialized')
      logAnalyticsError(error, {
        stage: AnalyticsErrorStage.Track,
        event,
        properties,
      })
      throw error
    }
    return
  }

  if (!distinctId) {
    // This shouldn't happen if initAnalytics was called, but handle gracefully
    return
  }

  if (!isProd) {
    if (DEBUG_ANALYTICS) {
      logAnalyticsDebug(`[analytics] ${event}`, {
        event,
        properties,
        distinctId,
      })
    }
    return
  }

  try {
    client.capture({
      distinctId,
      event,
      properties,
    })
  } catch (error) {
    logAnalyticsError(error, {
      stage: AnalyticsErrorStage.Track,
      event,
      properties,
    })
  }
}

export function identifyUser(userId: string, properties?: Record<string, any>) {
  if (!client) {
    const error = new Error('Analytics client not initialized')
    logAnalyticsError(error, {
      stage: AnalyticsErrorStage.Identify,
      properties,
    })
    throw error
  }

  const { isProd } = resolveDeps()
  const previousAnonymousId = anonymousId

  // Store the real user ID for future events
  currentUserId = userId
  identified = true

  if (!isProd) {
    if (DEBUG_ANALYTICS) {
      logAnalyticsDebug('[analytics] user identified', {
        userId,
        previousAnonymousId,
        properties,
      })
    }
    return
  }

  try {
    // If we had an anonymous ID, alias it FIRST to the real user ID
    // This must be called BEFORE identify to properly merge the event histories
    // See: https://posthog.com/docs/libraries/node
    if (previousAnonymousId) {
      client.alias({
        distinctId: userId,
        alias: previousAnonymousId,
      })
    }

    // Then identify the user with their properties
    client.identify({
      distinctId: userId,
      properties,
    })
  } catch (error) {
    logAnalyticsError(error, {
      stage: AnalyticsErrorStage.Identify,
      properties,
    })
  }
}

export function logError(
  error: any,
  userId?: string,
  properties?: Record<string, any>,
) {
  if (!client) {
    return
  }

  try {
    client.captureException(
      error,
      userId ?? currentUserId ?? 'unknown',
      properties,
    )
  } catch (postHogError) {
    // Silently handle PostHog errors - don't log them to console
    // This prevents PostHog connection issues from cluttering the user's console
    logAnalyticsError(postHogError, {
      stage: AnalyticsErrorStage.CaptureException,
      properties,
    })
  }
}
