import { useCallback, useEffect, useRef, useState } from 'react'

import { logger } from '../utils/logger'

import type { PendingImage } from '../state/chat-store'

export type StreamStatus = 'idle' | 'waiting' | 'streaming'

export type QueuedMessage = {
  content: string
  images: PendingImage[]
}

export const useMessageQueue = (
  sendMessage: (message: QueuedMessage) => void,
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

    logger.info(
      { queueLength },
      '[message-queue] Processing next message from queue',
    )

    const timeoutId = setTimeout(() => {
      const nextMessage = queuedList[0]
      const remainingMessages = queuedList.slice(1)
      queuedMessagesRef.current = remainingMessages
      setQueuedMessages(remainingMessages)
      sendMessage(nextMessage)
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [
    canProcessQueue,
    queuePaused,
    streamStatus,
    sendMessage,
    isChainInProgressRef,
    activeAgentStreamsRef,
  ])

  const addToQueue = useCallback((message: string, images: PendingImage[] = []) => {
    const queuedMessage = { content: message, images }
    const newQueue = [...queuedMessagesRef.current, queuedMessage]
    queuedMessagesRef.current = newQueue
    setQueuedMessages(newQueue)
    logger.info(
      { newQueueLength: newQueue.length, messageLength: message.length },
      '[message-queue] Message added to queue',
    )
  }, [])

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
    setCanProcessQueue(!queuePaused)
  }, [queuePaused])

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
  }
}
