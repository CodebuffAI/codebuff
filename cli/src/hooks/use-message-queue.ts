import { useCallback, useEffect, useRef } from 'react'
import { useQueueStore } from '../state/queue-store'

export type StreamStatus = 'idle' | 'waiting' | 'streaming'

export const useMessageQueue = (
  sendMessage: (content: string) => void,
  isChainInProgressRef: React.MutableRefObject<boolean>,
  activeAgentStreamsRef: React.MutableRefObject<number>,
) => {
  const {
    queuedMessages,
    streamStatus,
    canProcessQueue,
    queuePaused,
    addToQueue: addToQueueStore,
    clearQueue: clearQueueStore,
    pauseQueue: pauseQueueStore,
    resumeQueue: resumeQueueStore,
    setStreamStatus,
    setCanProcessQueue,
    startStreaming: startStreamingStore,
    stopStreaming: stopStreamingStore,
  } = useQueueStore()

  const queuedMessagesRef = useRef<string[]>([])
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamMessageIdRef = useRef<string | null>(null)
  const isQueuePausedRef = useRef<boolean>(false)

  // Sync refs with store state
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
    if (!canProcessQueue || queuePaused) return
    if (streamStatus !== 'idle') return
    if (streamMessageIdRef.current) return
    if (isChainInProgressRef.current) return
    if (activeAgentStreamsRef.current > 0) return

    const queuedList = queuedMessagesRef.current
    if (queuedList.length === 0) return

    const timeoutId = setTimeout(() => {
      const nextMessage = queuedList[0]
      const remainingMessages = queuedList.slice(1)
      queuedMessagesRef.current = remainingMessages
      useQueueStore.setState({ queuedMessages: remainingMessages })
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

  const addToQueue = useCallback(
    (message: string) => {
      const newQueue = [...queuedMessagesRef.current, message]
      queuedMessagesRef.current = newQueue
      addToQueueStore(message)
    },
    [addToQueueStore],
  )

  const pauseQueue = useCallback(() => {
    pauseQueueStore()
  }, [pauseQueueStore])

  const resumeQueue = useCallback(() => {
    resumeQueueStore()
  }, [resumeQueueStore])

  const clearQueue = useCallback(() => {
    const current = queuedMessagesRef.current
    queuedMessagesRef.current = []
    return clearQueueStore()
  }, [clearQueueStore])

  const startStreaming = useCallback(() => {
    startStreamingStore()
  }, [startStreamingStore])

  const stopStreaming = useCallback(() => {
    stopStreamingStore()
  }, [stopStreamingStore])

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
