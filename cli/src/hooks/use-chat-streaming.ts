/**
 * Chat streaming hook - connection status, timer, queue management, and exit handling.
 */

import { RECONNECTION_MESSAGE_DURATION_MS } from '@codebuff/sdk'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState, useTransition } from 'react'


import { authQueryKeys } from './use-auth-query'
import { useConnectionStatus } from './use-connection-status'
import { useElapsedTime } from './use-elapsed-time'
import { useExitHandler } from './use-exit-handler'
import { useMessageQueue, type QueuedMessage, type StreamStatus } from './use-message-queue'
import { useQueueControls } from './use-queue-controls'
import { useQueueUi } from './use-queue-ui'
import { useTimeout } from './use-timeout'
import { useChatStore } from '../state/chat-store'

import type { ElapsedTimeTracker } from './use-elapsed-time'
import type { PendingAttachment } from '../types/store'
import type { SendMessageFn } from '../types/contracts/send-message'
import type { AgentMode } from '../utils/constants'
import type { MutableRefObject } from 'react'

export interface UseChatStreamingOptions {
  agentMode: AgentMode
  inputValue: string
  setInputValue: (value: { text: string; cursorPosition: number; lastEditDueToNav: boolean }) => void
  terminalWidth: number
  separatorWidth: number
  isChainInProgressRef: MutableRefObject<boolean>
  activeAgentStreamsRef: MutableRefObject<number>
  sendMessageRef: MutableRefObject<SendMessageFn | undefined>
}

export interface UseChatStreamingReturn {
  // Connection state
  isConnected: boolean
  showReconnectionMessage: boolean

  // Timer
  mainAgentTimer: ElapsedTimeTracker
  timerStartTime: number | null

  // Stream status
  streamStatus: StreamStatus
  isWaitingForResponse: boolean
  isStreaming: boolean
  setStreamStatus: (status: StreamStatus) => void

  // Queue management
  queuedMessages: QueuedMessage[]
  queuePaused: boolean
  streamMessageIdRef: MutableRefObject<string | null>
  addToQueue: (message: string, attachments?: PendingAttachment[]) => void
  stopStreaming: () => void
  setCanProcessQueue: (value: boolean | ((prev: boolean) => boolean)) => void
  pauseQueue: () => void
  resumeQueue: () => void
  clearQueue: () => QueuedMessage[]
  isQueuePausedRef: MutableRefObject<boolean>
  isProcessingQueueRef: MutableRefObject<boolean>

  // Queue UI
  queuedCount: number
  shouldShowQueuePreview: boolean
  queuePreviewTitle: string | undefined
  pausedQueueText: string | undefined
  inputPlaceholder: string

  // Exit handling
  handleCtrlC: () => true
  ensureQueueActiveBeforeSubmit: () => boolean
  nextCtrlCWillExit: boolean
}

export function useChatStreaming({
  agentMode,
  inputValue,
  setInputValue,
  terminalWidth,
  separatorWidth,
  isChainInProgressRef,
  activeAgentStreamsRef,
  sendMessageRef,
}: UseChatStreamingOptions): UseChatStreamingReturn {
  const queryClient = useQueryClient()
  const [, startUiTransition] = useTransition()

  // Reconnection state
  const [showReconnectionMessage, setShowReconnectionMessage] = useState(false)
  const reconnectionTimeout = useTimeout()

  // Reconnection handler
  const handleReconnection = useCallback(
    (isInitialConnection: boolean) => {
      queryClient.invalidateQueries({ queryKey: authQueryKeys.all })

      startUiTransition(() => {
        if (!isInitialConnection) {
          setShowReconnectionMessage(true)
          reconnectionTimeout.setTimeout(
            'reconnection-message',
            () => {
              startUiTransition(() => {
                setShowReconnectionMessage(false)
              })
            },
            RECONNECTION_MESSAGE_DURATION_MS,
          )
        }
      })
    },
    [queryClient, reconnectionTimeout, startUiTransition],
  )

  // Connection status
  const isConnected = useConnectionStatus(handleReconnection)

  // Timer
  const mainAgentTimer = useElapsedTime()
  const timerStartTime = mainAgentTimer.startTime

  // Pause/resume timer when ask_user tool becomes active/inactive
  const askUserState = useChatStore((state) => state.askUserState)
  useEffect(() => {
    if (askUserState !== null) {
      mainAgentTimer.pause()
    } else if (mainAgentTimer.isPaused) {
      mainAgentTimer.resume()
    }
  }, [askUserState, mainAgentTimer])

  // Message queue
  const {
    queuedMessages,
    streamStatus,
    queuePaused,
    streamMessageIdRef,
    addToQueue,
    stopStreaming,
    setStreamStatus,
    setCanProcessQueue,
    pauseQueue,
    resumeQueue,
    clearQueue,
    isQueuePausedRef,
    isProcessingQueueRef,
  } = useMessageQueue(
    (message: QueuedMessage) =>
      sendMessageRef.current?.({
        content: message.content,
        agentMode,
        attachments: message.attachments,
      }) ?? Promise.resolve(),
    isChainInProgressRef,
    activeAgentStreamsRef,
  )

  // Queue UI
  const {
    queuedCount,
    shouldShowQueuePreview,
    queuePreviewTitle,
    pausedQueueText,
    inputPlaceholder,
  } = useQueueUi({
    queuePaused,
    queuedMessages,
    separatorWidth,
    terminalWidth,
  })

  // Exit handling
  const { handleCtrlC: baseHandleCtrlC, nextCtrlCWillExit } = useExitHandler({
    inputValue,
    setInputValue,
  })

  // Queue controls
  const { handleCtrlC, ensureQueueActiveBeforeSubmit } = useQueueControls({
    queuePaused,
    queuedCount,
    clearQueue,
    resumeQueue,
    inputHasText: Boolean(inputValue),
    baseHandleCtrlC,
  })

  // Derived flags
  const isWaitingForResponse = streamStatus === 'waiting'
  const isStreaming = streamStatus !== 'idle'

  return {
    // Connection state
    isConnected,
    showReconnectionMessage,

    // Timer
    mainAgentTimer,
    timerStartTime,

    // Stream status
    streamStatus,
    isWaitingForResponse,
    isStreaming,
    setStreamStatus,

    // Queue management
    queuedMessages,
    queuePaused,
    streamMessageIdRef,
    addToQueue,
    stopStreaming,
    setCanProcessQueue,
    pauseQueue,
    resumeQueue,
    clearQueue,
    isQueuePausedRef,
    isProcessingQueueRef,

    // Queue UI
    queuedCount,
    shouldShowQueuePreview,
    queuePreviewTitle,
    pausedQueueText,
    inputPlaceholder,

    // Exit handling
    handleCtrlC,
    ensureQueueActiveBeforeSubmit,
    nextCtrlCWillExit,
  }
}
