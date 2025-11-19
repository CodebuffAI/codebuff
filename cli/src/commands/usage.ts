import { WEBSITE_URL } from '@codebuff/sdk'

import { useChatStore } from '../state/chat-store'
import { getAuthToken } from '../utils/auth'
import { logger } from '../utils/logger'
import { getSystemMessage } from '../utils/message-history'

import type { PostUserMessageFn } from '../types/contracts/send-message'

interface UsageResponse {
  type: 'usage-response'
  usage: number
  remainingBalance: number | null
  balanceBreakdown?: Record<string, number>
  next_quota_reset: string | null
}

export async function handleUsageCommand(): Promise<{
  postUserMessage: PostUserMessageFn
}> {
  const authToken = getAuthToken()
  const sessionCreditsUsed = useChatStore.getState().sessionCreditsUsed

  if (!authToken) {
    const postUserMessage: PostUserMessageFn = (prev) => [
      ...prev,
      getSystemMessage('Please log in first to view your usage.'),
    ]
    return { postUserMessage }
  }

  try {
    const response = await fetch(`${WEBSITE_URL}/api/v1/usage`, {
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
      logger.error(
        { status: response.status, errorText },
        'Usage request failed',
      )

      const postUserMessage: PostUserMessageFn = (prev) => [
        ...prev,
        getSystemMessage(`Failed to fetch usage data: ${errorText}`),
      ]
      return { postUserMessage }
    }

    const data = (await response.json()) as UsageResponse

    useChatStore.getState().setUsageData({
      sessionUsage: sessionCreditsUsed,
      remainingBalance: data.remainingBalance,
      nextQuotaReset: data.next_quota_reset,
    })
    useChatStore.getState().setIsUsageVisible(true)

    const postUserMessage: PostUserMessageFn = (prev) => prev
    return { postUserMessage }
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'Error checking usage',
    )

    const postUserMessage: PostUserMessageFn = (prev) => [
      ...prev,
      getSystemMessage('Error checking usage. Please try again later.'),
    ]
    return { postUserMessage }
  }
}
