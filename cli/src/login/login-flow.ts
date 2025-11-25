import { createCodebuffApiClient } from '../utils/codebuff-api'

import type {
  CodebuffApiClient,
  LoginCodeResponse,
} from '../utils/codebuff-api'
import type { Logger } from '@codebuff/common/types/contracts/logger'

// Re-export for backwards compatibility
export type LoginUrlResponse = LoginCodeResponse

export interface GenerateLoginUrlDeps {
  logger: Logger
  apiClient?: CodebuffApiClient
}

export interface GenerateLoginUrlOptions {
  baseUrl: string
  fingerprintId: string
}

export async function generateLoginUrl(
  deps: GenerateLoginUrlDeps,
  options: GenerateLoginUrlOptions,
): Promise<LoginUrlResponse> {
  const { logger, apiClient: providedApiClient } = deps
  const { baseUrl, fingerprintId } = options

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
    throw new Error('Failed to get login URL')
  }

  if (!response.data) {
    logger.error(
      { status: response.status },
      '❌ Empty response from login URL',
    )
    throw new Error('Failed to get login URL')
  }

  return response.data
}

interface PollLoginStatusDeps {
  sleep: (ms: number) => Promise<void>
  logger: Logger
  now?: () => number
  apiClient?: CodebuffApiClient
}

interface PollLoginStatusOptions {
  baseUrl: string
  fingerprintId: string
  fingerprintHash: string
  expiresAt: string
  intervalMs?: number
  timeoutMs?: number
  shouldContinue?: () => boolean
}

export type PollLoginStatusResult =
  | { status: 'success'; user: Record<string, unknown>; attempts: number }
  | { status: 'timeout' }
  | { status: 'aborted' }

export async function pollLoginStatus(
  deps: PollLoginStatusDeps,
  options: PollLoginStatusOptions,
): Promise<PollLoginStatusResult> {
  const { sleep, logger, apiClient: providedApiClient } = deps
  const {
    baseUrl,
    fingerprintId,
    fingerprintHash,
    expiresAt,
    intervalMs = 5000,
    timeoutMs = 5 * 60 * 1000,
    shouldContinue,
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
      return { status: 'aborted' }
    }

    if (now() - startTime >= timeoutMs) {
      logger.warn('⌛️ Login polling timed out')
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
