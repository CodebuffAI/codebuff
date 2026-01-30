import { getAuthToken } from './auth'
import { getApiClient } from './codebuff-api'
import { logger } from './logger'
import { useChatStore } from '../state/chat-store'

import type { CodebuffApiClient } from './codebuff-api'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export interface FetchAndUpdateUsageParams {
  showBanner?: boolean
  getAuthToken?: () => string | undefined
  getChatStore?: () => {
    sessionCreditsUsed: number
    setInputMode: (mode: 'usage' | 'default') => void
  }
  logger?: Logger
  apiClient?: CodebuffApiClient
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
    apiClient: providedApiClient,
  } = params

  const authToken = getAuthTokenFn()
  const chatStore = getChatStore()

  if (!authToken) {
    loggerInstance.debug('Cannot fetch usage: not authenticated')
    return false
  }

  const apiClient =
    providedApiClient ?? getApiClient()

  try {
    const response = await apiClient.usage()

    if (!response.ok) {
      loggerInstance.error(
        { status: response.status, errorText: response.error },
        'Usage request failed',
      )
      return false
    }

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
