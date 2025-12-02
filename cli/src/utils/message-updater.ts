import type { ChatMessage, ContentBlock } from '../types/chat'

// Small wrapper to avoid repeating the ai-message map/update pattern.
export type SetMessagesFn = (
  updater: (messages: ChatMessage[]) => ChatMessage[],
) => void

export type MessageUpdater = {
  updateAiMessage: (updater: (msg: ChatMessage) => ChatMessage) => void
  updateAiMessageBlocks: (
    blockUpdater: (blocks: ContentBlock[]) => ContentBlock[],
  ) => void
  markComplete: (metadata?: Partial<ChatMessage>) => void
  setError: (message: string) => void
  addBlock: (block: ContentBlock) => void
}

export const createMessageUpdater = (
  aiMessageId: string,
  setMessages: SetMessagesFn,
  flushFn: () => void,
): MessageUpdater => {
  const updateAiMessage = (updater: (msg: ChatMessage) => ChatMessage) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === aiMessageId ? updater(msg) : msg)),
    )
  }

  const updateAiMessageBlocks = (
    blockUpdater: (blocks: ContentBlock[]) => ContentBlock[],
  ) => {
    updateAiMessage((msg) => ({
      ...msg,
      blocks: blockUpdater(msg.blocks ?? []),
    }))
  }

  const addBlock = (block: ContentBlock) => {
    updateAiMessage((msg) => ({
      ...msg,
      blocks: [...(msg.blocks ?? []), block],
    }))
  }

  const markComplete = (metadata?: Partial<ChatMessage>) => {
    flushFn()
    updateAiMessage((msg) => {
      const { metadata: messageMetadata, ...rest } = metadata ?? {}
      const nextMessage: ChatMessage = {
        ...msg,
        isComplete: true,
        ...rest,
      }

      if (messageMetadata) {
        nextMessage.metadata = {
          ...(msg.metadata ?? {}),
          ...messageMetadata,
        }
      }

      return nextMessage
    })
  }

  const setError = (message: string) => {
    flushFn()
    updateAiMessage((msg) => {
      const nextMessage: ChatMessage = {
        ...msg,
        content: message,
        blocks: undefined,
        isComplete: true,
      }
      return nextMessage
    })
  }

  return {
    updateAiMessage,
    updateAiMessageBlocks,
    markComplete,
    setError,
    addBlock,
  }
}
