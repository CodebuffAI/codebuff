import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from 'react'

import { useAgentValidation } from '../hooks/use-agent-validation'
import { useElapsedTime } from '../hooks/use-elapsed-time'
import { holdsLiveFreebuffSlot } from '../hooks/use-freebuff-session'
import {
  useMessageQueue,
  type QueuedMessage,
  type StreamStatus,
} from '../hooks/use-message-queue'
import { useSendMessage } from '../hooks/use-send-message'
import {
  useSubscriptionQuery,
  type SubscriptionResponse,
} from '../hooks/use-subscription-query'
import { useChatStore } from '../state/chat-store'
import { useFreebuffSessionStore } from '../state/freebuff-session-store'
import { IS_FREEBUFF } from '../utils/constants'
import { logger } from '../utils/logger'

import type { MultilineInputHandle } from '../components/multiline-input'
import type { ElapsedTimeTracker } from '../hooks/use-elapsed-time'
import type { SendMessageFn } from '../types/contracts/send-message'
import type { PendingAttachment } from '../types/store'
import type { MutableRefObject, ReactNode } from 'react'

export interface ChatRuntime {
  mainAgentTimer: ElapsedTimeTracker
  timerStartTime: number | null
  streamStatus: StreamStatus
  isWaitingForResponse: boolean
  isStreaming: boolean
  setStreamStatus: (status: StreamStatus) => void
  queuedMessages: QueuedMessage[]
  queuePaused: boolean
  streamMessageIdRef: MutableRefObject<string | null>
  addToQueue: (message: string, attachments?: PendingAttachment[]) => void
  addToQueueFront: (message: QueuedMessage) => void
  stopStreaming: () => void
  setCanProcessQueue: (value: boolean | ((prev: boolean) => boolean)) => void
  pauseQueue: () => void
  resumeQueue: () => void
  clearQueue: () => QueuedMessage[]
  isQueuePausedRef: MutableRefObject<boolean>
  isProcessingQueueRef: MutableRefObject<boolean>
  activeAgentStreamsRef: MutableRefObject<number>
  isChainInProgressRef: MutableRefObject<boolean>
  activeSubagentsRef: MutableRefObject<Set<string>>
  abortControllerRef: MutableRefObject<AbortController | null>
  registerScrollToLatest: (callback: () => void) => () => void
  sendMessage: SendMessageFn
  clearMessages: () => void
  subscriptionData: SubscriptionResponse | null | undefined
}

const ChatRuntimeContext = createContext<ChatRuntime | null>(null)

/**
 * Owns everything tied to the active chat run. It remains mounted while
 * history and Freebuff session-gate views replace the Chat surface.
 */
export const ChatRuntimeProvider = ({
  agentId,
  inputRef,
  continueChat,
  continueChatId,
  children,
}: {
  agentId?: string
  inputRef: MutableRefObject<MultilineInputHandle | null>
  continueChat: boolean
  continueChatId?: string
  children: ReactNode
}) => {
  const agentMode = useChatStore((state) => state.agentMode)
  const askUserState = useChatStore((state) => state.askUserState)
  const isChainInProgress = useChatStore((state) => state.isChainInProgress)
  const activeSubagents = useChatStore((state) => state.activeSubagents)

  const activeAgentStreamsRef = useRef(0)
  const isChainInProgressRef = useRef(isChainInProgress)
  const activeSubagentsRef = useRef(activeSubagents)
  const abortControllerRef = useRef<AbortController | null>(null)
  const sendMessageRef = useRef<SendMessageFn | undefined>(undefined)
  const scrollToLatestRef = useRef<() => void>(() => {})

  useEffect(() => {
    isChainInProgressRef.current = isChainInProgress
  }, [isChainInProgress])

  useEffect(() => {
    activeSubagentsRef.current = activeSubagents
  }, [activeSubagents])

  const mainAgentTimer = useElapsedTime()

  useEffect(() => {
    if (askUserState !== null) {
      mainAgentTimer.pause()
    } else if (mainAgentTimer.isPaused) {
      mainAgentTimer.resume()
    }
  }, [askUserState, mainAgentTimer])

  const freebuffSession = useFreebuffSessionStore((state) => state.session)
  const sendBlocked = IS_FREEBUFF && !holdsLiveFreebuffSlot(freebuffSession)

  useEffect(() => {
    if (sendBlocked) {
      logger.info(
        {},
        '[chat-runtime] Freebuff session over; holding queued messages until rejoin',
      )
    }
  }, [sendBlocked])

  const queue = useMessageQueue(
    (message) =>
      sendMessageRef.current?.({
        content: message.content,
        agentMode,
        attachments: message.attachments,
      }) ?? Promise.resolve(),
    isChainInProgressRef,
    activeAgentStreamsRef,
    { sendBlocked },
  )

  const scrollToLatest = useCallback(() => {
    scrollToLatestRef.current()
  }, [])

  const registerScrollToLatest = useCallback((callback: () => void) => {
    scrollToLatestRef.current = callback
    return () => {
      if (scrollToLatestRef.current === callback) {
        scrollToLatestRef.current = () => {}
      }
    }
  }, [])

  const { validate: validateAgents } = useAgentValidation()
  const { data: subscriptionData } = useSubscriptionQuery({
    refetchInterval: 60 * 1000,
  })
  const { sendMessage, clearMessages } = useSendMessage({
    inputRef,
    activeSubagentsRef,
    isChainInProgressRef,
    setStreamStatus: queue.setStreamStatus,
    setCanProcessQueue: queue.setCanProcessQueue,
    abortControllerRef,
    agentId,
    onBeforeMessageSend: validateAgents,
    mainAgentTimer,
    scrollToLatest,
    onTimerEvent: () => {},
    isQueuePausedRef: queue.isQueuePausedRef,
    isProcessingQueueRef: queue.isProcessingQueueRef,
    resumeQueue: queue.resumeQueue,
    requeueMessageAtFront: queue.addToQueueFront,
    continueChat,
    continueChatId,
    subscriptionData,
  })

  sendMessageRef.current = sendMessage

  const value: ChatRuntime = {
    mainAgentTimer,
    timerStartTime: mainAgentTimer.startTime,
    streamStatus: queue.streamStatus,
    isWaitingForResponse: queue.streamStatus === 'waiting',
    isStreaming: queue.streamStatus !== 'idle',
    setStreamStatus: queue.setStreamStatus,
    queuedMessages: queue.queuedMessages,
    queuePaused: queue.queuePaused,
    streamMessageIdRef: queue.streamMessageIdRef,
    addToQueue: queue.addToQueue,
    addToQueueFront: queue.addToQueueFront,
    stopStreaming: queue.stopStreaming,
    setCanProcessQueue: queue.setCanProcessQueue,
    pauseQueue: queue.pauseQueue,
    resumeQueue: queue.resumeQueue,
    clearQueue: queue.clearQueue,
    isQueuePausedRef: queue.isQueuePausedRef,
    isProcessingQueueRef: queue.isProcessingQueueRef,
    activeAgentStreamsRef,
    isChainInProgressRef,
    activeSubagentsRef,
    abortControllerRef,
    registerScrollToLatest,
    sendMessage,
    clearMessages,
    subscriptionData,
  }

  return (
    <ChatRuntimeContext.Provider value={value}>
      {children}
    </ChatRuntimeContext.Provider>
  )
}

export const useChatRuntime = (): ChatRuntime => {
  const runtime = useContext(ChatRuntimeContext)
  if (!runtime) {
    throw new Error('useChatRuntime must be used inside ChatRuntimeProvider')
  }
  return runtime
}
