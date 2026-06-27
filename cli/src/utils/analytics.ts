import {
  createPostHogClient,
  generateAnonymousId,
  type AnalyticsClientWithIdentify,
  type PostHogClientOptions,
} from '@codebuff/common/analytics-core'
import {
  env as defaultEnv,
  IS_PROD as defaultIsProd,
  DEBUG_ANALYTICS,
} from '@codebuff/common/env'
import { shouldTrackAnalyticsEvent } from '@codebuff/common/util/analytics-sampling'

import type { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

// Re-export types from core for backwards compatibility
export type { AnalyticsClientWithIdentify as AnalyticsClient } from '@codebuff/common/analytics-core'

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
  loadLogger()
    .then(({ logger }) => {
      logger.debug(data, message)
    })
    .catch((error) => {
      try {
        console.debug(message, data)
      } catch {
        // Ignore console errors in restricted environments
      }
      // Log the error to help diagnose logger issues in debug mode
      console.debug('Failed to load logger for analytics:', error)
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

let identified: boolean = false
let analyticsErrorLogger: AnalyticsErrorLogger | undefined

/** Whether a real user ID has been identified (vs anonymous). Read-only accessor. */
export function isUserIdentified(): boolean {
  return identified
}

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
  // No-op: analytics scaffold removed (local-only mode). Kept as a stub so
  // existing call sites in init-app and tests continue to compile.
}

export async function flushAnalytics() {
  // No-op: analytics scaffold removed (local-only mode).
}

export function trackEvent(
  _event: AnalyticsEvent,
  _properties?: Record<string, any>,
) {
  // No-op: analytics scaffold removed (local-only mode).
}

export function identifyUser(
  _userId: string,
  _properties?: Record<string, any>,
) {
  // No-op: analytics scaffold removed (local-only mode).
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
