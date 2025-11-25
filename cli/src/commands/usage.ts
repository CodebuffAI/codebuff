import { useChatStore } from '../state/chat-store'
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

  // Show the usage banner - the useUsageQuery hook will automatically fetch
  // the data when the banner becomes visible
  useChatStore.getState().setInputMode('usage')

  const postUserMessage: PostUserMessageFn = (prev) => prev
  return { postUserMessage }
}
