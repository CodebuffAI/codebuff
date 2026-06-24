import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import { createCodebuffApiClient } from '../utils/codebuff-api'

import type {
  CodebuffApiClient,
  LoginCodeResponse,
} from '../utils/codebuff-api'
import type { Logger } from '@codebuff/common/types/contracts/logger'

// Re-export for backwards compatibility
export type LoginUrlResponse = LoginCodeResponse

/**
 * Which surface initiated the login, recorded on every login-funnel event so
 * the funnel can be segmented (e.g. modal sign-ins vs. the `login` command).
 */
export type LoginVia = 'modal' | 'plain_command'

export interface GenerateLoginUrlDeps {
  logger: Logger
  apiClient?: CodebuffApiClient
  /**
   * Emit a login-funnel analytics event. Injected so login-flow stays a pure,
   * test-friendly module; callers wire in the real `trackEvent`. Omitted in
   * tests, where it no-ops.
   */
  trackEvent?: (event: AnalyticsEvent, properties?: Record<string, any>) => void
}

export interface GenerateLoginUrlOptions {
  baseUrl: string
  fingerprintId: string
  via?: LoginVia
}

export async function generateLoginUrl(
  deps: GenerateLoginUrlDeps,
  options: GenerateLoginUrlOptions,
): Promise<LoginUrlResponse> {
  const { logger, apiClient: providedApiClient, trackEvent } = deps
  const { baseUrl, fingerprintId, via } = options

  // A login attempt has begun. This is the top of the login sub-funnel; the
  // gap between this and a successful `cli.login` is where users are lost.
  trackEvent?.(AnalyticsEvent.LOGIN_STARTED, { via })

  const apiClient =
    providedApiClient ??
    createCodebuffApiClient({
      baseUrl,
    })

  const response = await apiClient.loginCode({ fingerprintId })

  if (!response.ok) {
    logger.error(
      {
        status: response.status,
        error: response.error,
      },
      '❌ Failed to request login URL',
    )
    trackEvent?.(AnalyticsEvent.LOGIN_FAILED, {
      via,
      reason: 'url_request',
      status: response.status,
    })
    throw new Error('Failed to get login URL')
  }

  if (!response.data) {
    logger.error(
      { status: response.status },
      '❌ Empty response from login URL',
    )
    trackEvent?.(AnalyticsEvent.LOGIN_FAILED, {
      via,
      reason: 'url_empty',
      status: response.status,
    })
    throw new Error('Failed to get login URL')
  }

  return response.data
}

interface PollLoginStatusDeps {
  sleep: (ms: number) => Promise<void>
  logger: Logger
  now?: () => number
  apiClient?: CodebuffApiClient
  trackEvent?: (event: AnalyticsEvent, properties?: Record<string, any>) => void
}

interface PollLoginStatusOptions {
  baseUrl: string
  fingerprintId: string
  fingerprintHash: string
  expiresAt: string
  intervalMs?: number
  timeoutMs?: number
  shouldContinue?: () => boolean
  via?: LoginVia
}

export type PollLoginStatusResult =
  | { status: 'success'; user: Record<string, unknown>; attempts: number }
  | { status: 'timeout' }
  | { status: 'aborted' }

export async function pollLoginStatus(
  deps: PollLoginStatusDeps,
  options: PollLoginStatusOptions,
): Promise<PollLoginStatusResult> {
  const { sleep, logger, apiClient: providedApiClient, trackEvent } = deps
  const {
    baseUrl,
    fingerprintId,
    fingerprintHash,
    expiresAt,
    intervalMs = 5000,
    timeoutMs = 5 * 60 * 1000,
    shouldContinue,
    via,
  } = options

  const now = deps.now ?? Date.now
  const startTime = now()
  let attempts = 0

  const apiClient =
    providedApiClient ??
    createCodebuffApiClient({
      baseUrl,
    })

  while (true) {
    if (shouldContinue && !shouldContinue()) {
      logger.warn('🛑 Polling aborted by caller')
      trackEvent?.(AnalyticsEvent.LOGIN_ABORTED, {
        via,
        attempts,
        durationMs: now() - startTime,
      })
      return { status: 'aborted' }
    }

    if (now() - startTime >= timeoutMs) {
      logger.warn('⌛️ Login polling timed out')
      trackEvent?.(AnalyticsEvent.LOGIN_TIMEOUT, {
        via,
        attempts,
        durationMs: now() - startTime,
      })
      return { status: 'timeout' }
    }

    attempts += 1

    try {
      const response = await apiClient.loginStatus({
        fingerprintId,
        fingerprintHash,
        expiresAt,
      })

      if (!response.ok) {
        if (response.status !== 401) {
          logger.warn(
            {
              attempts,
              status: response.status,
              error: response.error,
            },
            '⚠️ Unexpected status while polling',
          )
        }
        await sleep(intervalMs)
        continue
      }

      if (response.data?.user && typeof response.data.user === 'object') {
        return {
          status: 'success',
          user: response.data.user as Record<string, unknown>,
          attempts,
        }
      }

      await sleep(intervalMs)
    } catch (error) {
      logger.error(
        {
          attempts,
          error: error instanceof Error ? error.message : String(error),
        },
        '💥 Network error during login status polling',
      )
      await sleep(intervalMs)
      continue
    }
  }
}
