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

  useEffect(() => {
    queuedMessagesRef.current = queuedMessages
  }, [queuedMessages])

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

    const nextMessage = queuedList[0]
    const remainingMessages = queuedList.slice(1)
    queuedMessagesRef.current = remainingMessages
    setQueuedMessages(remainingMessages)
    // Add .catch() to prevent unhandled promise rejections.
    // Safety net: release lock here in case sendMessage failed before its own error handling.
    // Lock is also released in finalizeQueueState and sendMessage's finally block (idempotent).
    sendMessage(nextMessage).catch((err: unknown) => {
      logger.warn(
        { error: err },
        '[message-queue] sendMessage promise rejected - releasing lock',
      )
      isProcessingQueueRef.current = false
    })
  }, [
    canProcessQueue,
    queuePaused,
    streamStatus,
    sendMessage,
    isChainInProgressRef,
    activeAgentStreamsRef,
  ])

  const addToQueue = useCallback(
    (message: string, attachments: PendingAttachment[] = []) => {
      const queuedMessage = { content: message, attachments }
      const newQueue = [...queuedMessagesRef.current, queuedMessage]
      queuedMessagesRef.current = newQueue
      setQueuedMessages(newQueue)
      logger.info(
        { newQueueLength: newQueue.length, messageLength: message.length },
        '[message-queue] Message added to queue',
      )
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
