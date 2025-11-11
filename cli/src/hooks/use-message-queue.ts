import { useCallback, useEffect, useRef, useState } from 'react'

export type StreamStatus = 'idle' | 'waiting' | 'streaming'

export const useMessageQueue = (
  sendMessage: (content: string) => void,
  isChainInProgressRef: React.MutableRefObject<boolean>,
  activeAgentStreamsRef: React.MutableRefObject<number>,
) => {
  const [queuedMessages, setQueuedMessages] = useState<string[]>([])
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle')
  const [canProcessQueue, setCanProcessQueue] = useState<boolean>(true)

  const queuedMessagesRef = useRef<string[]>([])
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamMessageIdRef = useRef<string | null>(null)

  useEffect(() => {
    queuedMessagesRef.current = queuedMessages
  }, [queuedMessages])

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
    if (!canProcessQueue) return
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
      setQueuedMessages(remainingMessages)
      sendMessage(nextMessage)
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [
    canProcessQueue,
    streamStatus,
    sendMessage,
    isChainInProgressRef,
    activeAgentStreamsRef,
  ])

  const addToQueue = useCallback((message: string) => {
    const newQueue = [...queuedMessagesRef.current, message]
    queuedMessagesRef.current = newQueue
    setQueuedMessages(newQueue)
  }, [])

  const startStreaming = useCallback(() => {
    setStreamStatus('streaming')
    setCanProcessQueue(false)
  }, [])

  const stopStreaming = useCallback(() => {
    setStreamStatus('idle')
    setCanProcessQueue(true)
  }, [])

  return {
    queuedMessages,
    streamStatus,
    canProcessQueue,
    streamMessageIdRef,
    addToQueue,
    startStreaming,
    stopStreaming,
    setStreamStatus,
    clearStreaming,
    setCanProcessQueue,
  }
}
