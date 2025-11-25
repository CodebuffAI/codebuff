import { WEBSITE_URL } from '@codebuff/sdk'

import { useChatStore } from '../state/chat-store'
import { getAuthToken } from './auth'
import { logger } from './logger'

import type { Logger } from '@codebuff/common/types/contracts/logger'

interface UsageResponse {
  type: 'usage-response'
  usage: number
  remainingBalance: number | null
  balanceBreakdown?: Record<string, number>
  next_quota_reset: string | null
}

export interface FetchAndUpdateUsageParams {
  showBanner?: boolean
  getAuthToken?: () => string | undefined
  getChatStore?: () => {
    sessionCreditsUsed: number
    setInputMode: (mode: 'usage' | 'default') => void
  }
  logger?: Logger
  fetch?: typeof globalThis.fetch
}

/**
 * Fetches current usage data from the API and updates the chat store.
 * If `showBanner` is true, makes the usage banner visible after updating.
 * Returns true if successful, false otherwise.
 */
export async function fetchAndUpdateUsage(
  params: FetchAndUpdateUsageParams = {},
): Promise<boolean> {
  const {
    showBanner = false,
    getAuthToken: getAuthTokenFn = getAuthToken,
    getChatStore = () => useChatStore.getState(),
    logger: loggerInstance = logger,
    fetch: fetchFn = globalThis.fetch,
  } = params

  const authToken = getAuthTokenFn()
  const chatStore = getChatStore()
  const sessionCreditsUsed = chatStore.sessionCreditsUsed

  if (!authToken) {
    loggerInstance.debug('Cannot fetch usage: not authenticated')
    return false
  }

  try {
    const response = await fetchFn(`${WEBSITE_URL}/api/v1/usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fingerprintId: 'cli-usage',
        authToken,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      loggerInstance.error(
        { status: response.status, errorText },
        'Usage request failed',
      )
      return false
    }

    const data = (await response.json()) as UsageResponse

    // Note: This function is deprecated. Use useUsageQuery hook instead.
    // We no longer update the store here since usage data is managed by TanStack Query.
    
    if (showBanner) {
      chatStore.setInputMode('usage')
    }

    return true
  } catch (error) {
    loggerInstance.error(
      {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'Error fetching usage',
    )
    return false
  }
}
