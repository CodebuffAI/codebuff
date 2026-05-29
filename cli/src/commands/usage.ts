import { useChatStore } from '../state/chat-store'
import { getSystemMessage } from '../utils/message-history'

import type { PostUserMessageFn } from '../types/contracts/send-message'

export async function handleUsageCommand(): Promise<{
  postUserMessage: PostUserMessageFn
}> {
  // Show the usage banner
  useChatStore.getState().setInputMode('usage')

  const postUserMessage: PostUserMessageFn = (prev) => prev
  return { postUserMessage }
}
