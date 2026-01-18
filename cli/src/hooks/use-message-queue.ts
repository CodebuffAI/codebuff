import { useCallback, useEffect, useRef, useState } from 'react'

import { logger } from '../utils/logger'

import type { PendingAttachment } from '../state/chat-store'

export type StreamStatus = 'idle' | 'waiting' | 'streaming'

export type QueuedMessage = {
  content: string
  attachments: PendingAttachment[]
}

export const useMessageQueue = (
  sendMessage: (message: QueuedMessage) => Promise<void>,
  isChainInProgressRef: React.MutableRefObject<boolean>,
  activeAgentStreamsRef: React.MutableRefObject<number>,
) => {
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([])
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle')
  const [canProcessQueue, setCanProcessQueue] = useState<boolean>(true)
  const [queuePaused, setQueuePaused] = useState<boolean>(false)

  const queuedMessagesRef = useRef<QueuedMessage[]>([])
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamMessageIdRef = useRef<string | null>(null)
  const isQueuePausedRef = useRef<boolean>(false)
  const isProcessingQueueRef = useRef<boolean>(false)

  // Note: queuedMessagesRef is now updated atomically inside functional setState calls
  // (in addToQueue and the queue processing effect), so no sync effect is needed here.

  useEffect(() => {
    isQueuePausedRef.current = queuePaused
  }, [queuePaused])

  const clearStreaming = useCallback(() => {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current)
      streamTimeoutRef.current = null
    }
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current)
      streamIntervalRef.current = null
    }
    streamMessageIdRef.current = null
    activeAgentStreamsRef.current = 0
    setStreamStatus('idle')
  }, [activeAgentStreamsRef])

  useEffect(() => {
    return () => {
      clearStreaming()
    }
  }, [clearStreaming])

  useEffect(() => {
    const queuedList = queuedMessagesRef.current
    const queueLength = queuedList.length

    if (queueLength === 0) return

    // Log why queue is blocked (only when there are messages waiting)
    if (!canProcessQueue || queuePaused) {
      logger.debug(
        { queueLength, canProcessQueue, queuePaused },
        '[message-queue] Queue blocked: canProcessQueue or paused',
      )
      return
    }
    if (streamStatus !== 'idle') {
      logger.debug(
        { queueLength, streamStatus },
        '[message-queue] Queue blocked: stream not idle',
      )
      return
    }
    if (streamMessageIdRef.current) {
      logger.debug(
        { queueLength, streamMessageId: streamMessageIdRef.current },
        '[message-queue] Queue blocked: streamMessageId set',
      )
      return
    }
    if (isChainInProgressRef.current) {
      logger.debug(
        { queueLength, isChainInProgress: isChainInProgressRef.current },
        '[message-queue] Queue blocked: chain in progress',
      )
      return
    }
    if (activeAgentStreamsRef.current > 0) {
      logger.debug(
        { queueLength, activeAgentStreams: activeAgentStreamsRef.current },
        '[message-queue] Queue blocked: active agent streams',
      )
      return
    }

    if (isProcessingQueueRef.current) {
      logger.debug(
        { queueLength },
        '[message-queue] Queue blocked: already processing',
      )
      return
    }

    logger.info(
      { queueLength },
      '[message-queue] Processing next message from queue',
    )

    isProcessingQueueRef.current = true

    // IMPORTANT: We must read the message to process INSIDE the functional setState
    // to ensure we send the same message we remove. Reading from the ref separately
    // can cause a race condition where we send message X but remove message Y.
    let messageToProcess: QueuedMessage | undefined

    setQueuedMessages((prev) => {
      if (prev.length === 0) {
        return prev
      }
      messageToProcess = prev[0]
      const remainingMessages = prev.slice(1)
      queuedMessagesRef.current = remainingMessages
      return remainingMessages
    })

    if (!messageToProcess) {
      isProcessingQueueRef.current = false
      return
    }

    // Use .finally() to ensure lock is always released after sendMessage completes
    sendMessage(messageToProcess)
      .catch((err: unknown) => {
        logger.warn(
          { error: err },
          '[message-queue] sendMessage promise rejected',
        )
      })
      .finally(() => {
        // Release the processing lock so the next message can be processed
        // The effect will re-run when streamStatus changes or other deps update
        isProcessingQueueRef.current = false
        logger.debug('[message-queue] Processing lock released')
      })
  }, [
    canProcessQueue,
    queuePaused,
    streamStatus,
    queuedMessages, // Re-run when queue changes to process next message
    sendMessage,
    isChainInProgressRef,
    activeAgentStreamsRef,
  ])

  const addToQueue = useCallback(
    (message: string, attachments: PendingAttachment[] = []) => {
      const queuedMessage = { content: message, attachments }
      // Use functional setState to ensure atomic updates during rapid calls.
      // We update queuedMessagesRef inside the callback to keep ref and state
      // in sync atomically - this prevents race conditions when multiple
      // messages are added before React can process state updates.
      setQueuedMessages((prev) => {
        const newQueue = [...prev, queuedMessage]
        queuedMessagesRef.current = newQueue
        logger.info(
          { newQueueLength: newQueue.length, messageLength: message.length },
          '[message-queue] Message added to queue',
        )
        return newQueue
      })
    },
    [],
  )

  const pauseQueue = useCallback(() => {
    setQueuePaused(true)
    setCanProcessQueue(false)
  }, [])

  const resumeQueue = useCallback(() => {
    setQueuePaused(false)
    setCanProcessQueue(true)
  }, [])

  const clearQueue = useCallback(() => {
    const current = queuedMessagesRef.current
    queuedMessagesRef.current = []
    setQueuedMessages([])
    return current
  }, [])

  const startStreaming = useCallback(() => {
    setStreamStatus('streaming')
    setCanProcessQueue(false)
  }, [])

  const stopStreaming = useCallback(() => {
    setStreamStatus('idle')
    // Use ref instead of queuePaused state to avoid stale closure issues
    setCanProcessQueue(!isQueuePausedRef.current)
  }, [])

  return {
    queuedMessages,
    streamStatus,
    canProcessQueue,
    queuePaused,
    streamMessageIdRef,
    addToQueue,
    startStreaming,
    stopStreaming,
    setStreamStatus,
    clearStreaming,
    setCanProcessQueue,
    pauseQueue,
    resumeQueue,
    clearQueue,
    isQueuePausedRef,
    isProcessingQueueRef,
  }
}
