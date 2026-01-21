import { useCallback, useEffect, useRef, useState } from 'react'

import { logger } from '../utils/logger'

import type { PendingAttachment } from '../state/chat-store'

export type StreamStatus = 'idle' | 'waiting' | 'streaming'

export type QueuedMessage = {
  content: string
  attachments: PendingAttachment[]
}

// Watchdog timeout duration: 60 seconds
const QUEUE_WATCHDOG_TIMEOUT_MS = 60 * 1000

export const useMessageQueue = (
  sendMessage: (message: QueuedMessage) => Promise<void>,
  isChainInProgressRef: React.MutableRefObject<boolean>,
  activeAgentStreamsRef: React.MutableRefObject<number>,
) => {
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([])
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle')
  const [canProcessQueue, setCanProcessQueue] = useState<boolean>(true)
  // Separate state for user-initiated pause to ensure re-renders when pause status changes
  const [queuePausedState, setQueuePausedState] = useState<boolean>(false)

  // Keep a ref so clearQueue can return the current queue synchronously.
  const queuedMessagesRef = useRef<QueuedMessage[]>([])
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamMessageIdRef = useRef<string | null>(null)
  const isProcessingQueueRef = useRef<boolean>(false)
  // User-initiated pause state (separate from system-busy state)
  const isQueuePausedRef = useRef<boolean>(false)
  // Watchdog timer to recover from stuck queue processing lock
  const watchdogTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // queuePaused reflects whether the user has explicitly paused the queue
  // (not whether the system is temporarily busy processing)
  // Use state instead of ref to ensure components re-render when pause status changes
  const queuePaused = queuePausedState

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
      // Clean up watchdog timer on unmount
      if (watchdogTimeoutRef.current) {
        clearTimeout(watchdogTimeoutRef.current)
        watchdogTimeoutRef.current = null
      }
    }
  }, [clearStreaming])

  const processNextMessage = useCallback(() => {
    const queuedList = queuedMessagesRef.current
    const queueLength = queuedList.length

    if (queueLength === 0) {
      return
    }

    // Check if user has explicitly paused the queue
    if (isQueuePausedRef.current) {
      logger.debug(
        { queueLength },
        '[message-queue] Queue blocked: user paused',
      )
      return
    }

    // Log why queue is blocked (only when there are messages waiting)
    if (!canProcessQueue) {
      logger.debug(
        { queueLength, canProcessQueue },
        '[message-queue] Queue blocked: canProcessQueue disabled',
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

    // Start watchdog timer to recover from stuck processing lock
    if (watchdogTimeoutRef.current) {
      clearTimeout(watchdogTimeoutRef.current)
    }
    watchdogTimeoutRef.current = setTimeout(() => {
      if (isProcessingQueueRef.current) {
        logger.warn(
          { stuckDurationMs: QUEUE_WATCHDOG_TIMEOUT_MS },
          '[message-queue] Watchdog: isProcessingQueueRef stuck for too long, forcing reset',
        )
        isProcessingQueueRef.current = false
        // Also reset canProcessQueue to allow queue to resume (unless user-paused)
        setCanProcessQueue(!isQueuePausedRef.current)
      }
      watchdogTimeoutRef.current = null
    }, QUEUE_WATCHDOG_TIMEOUT_MS)

    // Read the message to process from the ref BEFORE calling setState.
    // We must NOT assign to outer variables inside functional setState callbacks
    // because React can call those callbacks multiple times in concurrent mode,
    // which would cause messages to be skipped.
    const messageToProcess = queuedMessagesRef.current[0]

    if (!messageToProcess) {
      isProcessingQueueRef.current = false
      // Clear watchdog timer on early return
      if (watchdogTimeoutRef.current) {
        clearTimeout(watchdogTimeoutRef.current)
        watchdogTimeoutRef.current = null
      }
      return
    }

    // Now remove the message from the queue
    setQueuedMessages((prev) => {
      if (prev.length === 0) {
        return prev
      }
      const remainingMessages = prev.slice(1)
      queuedMessagesRef.current = remainingMessages
      return remainingMessages
    })

    sendMessage(messageToProcess)
      .catch((err: unknown) => {
        logger.warn(
          { error: err },
          '[message-queue] sendMessage promise rejected',
        )
      })
      .finally(() => {
        isProcessingQueueRef.current = false
        // Clear watchdog timer when processing completes normally
        if (watchdogTimeoutRef.current) {
          clearTimeout(watchdogTimeoutRef.current)
          watchdogTimeoutRef.current = null
        }
        logger.debug('[message-queue] Processing lock released')
      })
  }, [
    canProcessQueue,
    streamStatus,
    sendMessage,
    isChainInProgressRef,
    activeAgentStreamsRef,
  ])

  useEffect(() => {
    processNextMessage()
  }, [canProcessQueue, streamStatus, queuedMessages.length, processNextMessage, isChainInProgressRef])

  const addToQueue = useCallback(
    (message: string, attachments: PendingAttachment[] = []) => {
      const queuedMessage = { content: message, attachments }
      // Use functional setState to ensure atomic updates during rapid calls.
      setQueuedMessages((prev) => {
        const newQueue = [...prev, queuedMessage]
        queuedMessagesRef.current = newQueue
        return newQueue
      })
    },
    [],
  )

  const pauseQueue = useCallback(() => {
    isQueuePausedRef.current = true
    setQueuePausedState(true)
    setCanProcessQueue(false)
  }, [])

  const resumeQueue = useCallback(() => {
    isQueuePausedRef.current = false
    setQueuePausedState(false)
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
