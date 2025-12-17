import { useChatStore } from '../state/chat-store'

import type { PostUserMessageFn } from '../types/contracts/send-message'

export async function handleHelpCommand(): Promise<{
  postUserMessage: PostUserMessageFn
}> {
  // Show the help banner with keyboard shortcuts
  useChatStore.getState().setInputMode('help')

  const postUserMessage: PostUserMessageFn = (prev) => prev
  return { postUserMessage }
}
