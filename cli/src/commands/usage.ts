import { fetchAndUpdateUsage } from '../utils/fetch-usage'
import { getAuthToken } from '../utils/auth'
import { getSystemMessage } from '../utils/message-history'

import type { PostUserMessageFn } from '../types/contracts/send-message'

export async function handleUsageCommand(): Promise<{
  postUserMessage: PostUserMessageFn
}> {
  const authToken = getAuthToken()

  if (!authToken) {
    const postUserMessage: PostUserMessageFn = (prev) => [
      ...prev,
      getSystemMessage('Please log in first to view your usage.'),
    ]
    return { postUserMessage }
  }

  const success = await fetchAndUpdateUsage({ showBanner: true })

  if (!success) {
    const postUserMessage: PostUserMessageFn = (prev) => [
      ...prev,
      getSystemMessage('Error checking usage. Please try again later.'),
    ]
    return { postUserMessage }
  }

  const postUserMessage: PostUserMessageFn = (prev) => prev
  return { postUserMessage }
}
