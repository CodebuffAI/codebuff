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

/** Extended updater with batching control methods */
export type BatchedMessageUpdater = MessageUpdater & {
  /** Immediately flush all pending updates to state */
  flush: () => void
  /** Stop the flush interval and clean up. Called automatically by markComplete/setError */
  dispose: () => void
}

/** Default interval for batched updates in milliseconds */
export const DEFAULT_FLUSH_INTERVAL_MS = 100

export const createMessageUpdater = (
  aiMessageId: string,
  setMessages: SetMessagesFn,
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

/** Batched updater that queues updates and flushes at a regular interval. */
export const createBatchedMessageUpdater = (
  aiMessageId: string,
  setMessages: SetMessagesFn,
  flushIntervalMs: number = DEFAULT_FLUSH_INTERVAL_MS,
): BatchedMessageUpdater => {
  // Queue of message updater functions to be applied on next flush
  const pendingUpdaters: Array<(msg: ChatMessage) => ChatMessage> = []
  let intervalId: ReturnType<typeof setInterval> | null = null
  let isDisposed = false

  const flush = () => {
    if (pendingUpdaters.length === 0) return

    // Capture and clear the queue atomically
    const updaters = pendingUpdaters.splice(0, pendingUpdaters.length)

    // Compose all pending updaters into a single transform
    const composedUpdater = (msg: ChatMessage): ChatMessage => {
      return updaters.reduce((m, fn) => fn(m), msg)
    }

    // Apply composed update to the target message
    setMessages((prev) =>
      prev.map((msg) => (msg.id === aiMessageId ? composedUpdater(msg) : msg)),
    )
  }

  const dispose = () => {
    if (isDisposed) return
    isDisposed = true
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  // Start the periodic flush interval
  intervalId = setInterval(flush, flushIntervalMs)

  const updateAiMessage = (updater: (msg: ChatMessage) => ChatMessage) => {
    if (isDisposed) {
      // If disposed, apply immediately as fallback
      setMessages((prev) =>
        prev.map((msg) => (msg.id === aiMessageId ? updater(msg) : msg)),
      )
      return
    }
    pendingUpdaters.push(updater)
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
    // Flush any pending updates first
    flush()
    // Stop the interval
    dispose()

    // Apply completion immediately
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== aiMessageId) return msg
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
      }),
    )
  }

  const setError = (message: string) => {
    // Clear pending updates (they'll be overwritten anyway) and stop the interval
    pendingUpdaters.length = 0
    dispose()

    // Apply error immediately, clearing blocks
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== aiMessageId) return msg
        return {
          ...msg,
          content: message,
          blocks: undefined,
          isComplete: true,
        }
      }),
    )
  }

  return {
    updateAiMessage,
    updateAiMessageBlocks,
    markComplete,
    setError,
    addBlock,
    flush,
    dispose,
  }
}
