import { BACKEND_URL } from '@codebuff/sdk'

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
    const response = await fetch(`${BACKEND_URL}/api/usage`, {
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

    // Format the usage message similar to npm-app
    let usageMessage = `Session usage: ${sessionCreditsUsed.toLocaleString()} credits used`

    if (data.remainingBalance !== null) {
      const remainingColor =
        data.remainingBalance <= 0
          ? 'red'
          : data.remainingBalance <= 100
            ? 'yellow'
            : 'green'

      usageMessage += `\n\nCredits Remaining: ${data.remainingBalance.toLocaleString()}`

      // Add next quota reset info if available
      if (data.next_quota_reset) {
        const resetDate = new Date(data.next_quota_reset)
        const today = new Date()
        const isToday = resetDate.toDateString() === today.toDateString()

        const dateDisplay = isToday
          ? resetDate.toLocaleString()
          : resetDate.toLocaleDateString()

        usageMessage += `\n\nFree credits will renew on ${dateDisplay}.`
      }
    } else {
      usageMessage += '\n\nTotal balance information not available.'
    }

    const postUserMessage: PostUserMessageFn = (prev) => [
      ...prev,
      getSystemMessage(usageMessage),
    ]
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
