import { useCallback, useRef } from 'react'

import { createStreamController } from './stream-state'
import { useMessageExecution } from './use-message-execution'
import { useRunStatePersistence } from './use-run-state-persistence'
import { useChatStore } from '../state/chat-store'
import { logger } from '../utils/logger'
import {
  autoCollapsePreviousMessages,
  createAiMessageShell,
  createErrorMessage as createErrorChatMessage,
  generateAiMessageId,
} from '../utils/send-message-helpers'
import { createSendMessageTimerController } from '../utils/send-message-timer'
import {
  handleExecutionFailure,
  handleRunCompletion,
  handleRunError,
  prepareUserMessage as prepareUserMessageHelper,
  resetEarlyReturnState,
  setupStreamingContext,
} from './helpers/send-message'
import { OUT_OF_CREDITS_MESSAGE } from '../utils/error-handling'
import { invalidateActivityQuery } from './use-activity-query'
import { usageQueryKeys } from './use-usage-query'
import { NETWORK_ERROR_ID } from '../utils/validation-error-helpers'
import { yieldToEventLoop } from '../utils/yield-to-event-loop'

import type { ElapsedTimeTracker } from './use-elapsed-time'
import type { StreamStatus } from './use-message-queue'
import type { PendingAttachment } from '../state/chat-store'
import type { ChatMessage } from '../types/chat'
import type { SendMessageFn } from '../types/contracts/send-message'
import type { MessageContent } from '@codebuff/sdk'
import type { AgentMode } from '../utils/constants'
import type { SendMessageTimerEvent } from '../utils/send-message-timer'

interface UseSendMessageOptions {
  inputRef: React.MutableRefObject<any>
  activeSubagentsRef: React.MutableRefObject<Set<string>>
  isChainInProgressRef: React.MutableRefObject<boolean>
  setStreamStatus: (status: StreamStatus) => void
  setCanProcessQueue: (can: boolean) => void
  abortControllerRef: React.MutableRefObject<AbortController | null>
  agentId?: string
  onBeforeMessageSend: () => Promise<{
    success: boolean
    errors: Array<{ id: string; message: string }>
  }>
  mainAgentTimer: ElapsedTimeTracker
  scrollToLatest: () => void
  onTimerEvent?: (event: SendMessageTimerEvent) => void
  isQueuePausedRef?: React.MutableRefObject<boolean>
  isProcessingQueueRef?: React.MutableRefObject<boolean>
  resumeQueue?: () => void
  continueChat: boolean
  continueChatId?: string
}

export const useSendMessage = ({
  inputRef,
  activeSubagentsRef,
  isChainInProgressRef,
  setStreamStatus,
  setCanProcessQueue,
  abortControllerRef,
  agentId,
  onBeforeMessageSend,
  mainAgentTimer,
  scrollToLatest,
  onTimerEvent = () => {},
  isQueuePausedRef,
  isProcessingQueueRef,
  resumeQueue,
  continueChat,
  continueChatId,
}: UseSendMessageOptions): {
  sendMessage: SendMessageFn
  resetRunState: () => void
} => {
  // Pull setters directly from store - these are stable references that don't need
  // to trigger re-renders, so using getState() outside of callbacks is intentional.
  const {
    setMessages,
    setFocusedAgentId,
    setInputFocused,
    setStreamingAgents,
    setActiveSubagents,
    setIsChainInProgress,
    setHasReceivedPlanResponse,
    setLastMessageMode,
    addSessionCredits,
    setRunState,
    setIsRetrying,
  } = useChatStore.getState()

  // Use extracted hooks for run state persistence and message execution
  const {
    previousRunStateRef,
    resetRunState,
    persistState,
    updateRunState,
  } = useRunStatePersistence({
    continueChat,
    continueChatId,
    setMessages,
    setRunState,
  })

  const { executeMessage } = useMessageExecution({ agentId })

  // Memoize stream controller to maintain referential stability across renders
  const streamRefsRef = useRef<ReturnType<
    typeof createStreamController
  > | null>(null)
  if (!streamRefsRef.current) {
    streamRefsRef.current = createStreamController()
  }
  const streamRefs = streamRefsRef.current

  const updateChainInProgress = useCallback(
    (value: boolean) => {
      isChainInProgressRef.current = value
      setIsChainInProgress(value)
    },
    [setIsChainInProgress, isChainInProgressRef],
  )

  const updateActiveSubagents = useCallback(
    (mutate: (next: Set<string>) => void) => {
      setActiveSubagents((prev) => {
        const next = new Set(prev)
        mutate(next)
        activeSubagentsRef.current = next
        return next
      })
    },
    [setActiveSubagents, activeSubagentsRef],
  )

  const addActiveSubagent = useCallback(
    (subagentId: string) => {
      updateActiveSubagents((next) => next.add(subagentId))
    },
    [updateActiveSubagents],
  )

  const removeActiveSubagent = useCallback(
    (subagentId: string) => {
      updateActiveSubagents((next) => next.delete(subagentId))
    },
    [updateActiveSubagents],
  )

  const prepareUserMessage = useCallback(
    (params: {
      content: string
      agentMode: AgentMode
      postUserMessage?: (prev: ChatMessage[]) => ChatMessage[]
      attachments?: PendingAttachment[]
    }) => {
      // Access lastMessageMode fresh each call to get current value
      const { lastMessageMode } = useChatStore.getState()
      return prepareUserMessageHelper({
        ...params,
        deps: {
          setMessages,
          lastMessageMode,
          setLastMessageMode,
          scrollToLatest,
          setHasReceivedPlanResponse,
        },
      })
    },
    [
      setMessages,
      setLastMessageMode,
      scrollToLatest,
      setHasReceivedPlanResponse,
    ],
  )

  const sendMessage = useCallback<SendMessageFn>(
    async ({ content, agentMode, postUserMessage, attachments }) => {
      // CRITICAL: Set chain in progress immediately (synchronously) before any async work.
      // This ensures the router can detect that we're busy and queue subsequent messages.
      // Set the ref directly first to guarantee immediate visibility to other code paths,
      // then call updateChainInProgress to also update React state for re-renders.
      isChainInProgressRef.current = true
      updateChainInProgress(true)
      setCanProcessQueue(false)

      if (agentMode !== 'PLAN') {
        setHasReceivedPlanResponse(false)
      }

      // Initialize timer for elapsed time tracking
      const timerController = createSendMessageTimerController({
        mainAgentTimer,
        onTimerEvent,
        agentId,
      })
      setIsRetrying(false)

      // Prepare user message (bash context, images, text attachments, mode divider)
      let userMessageId: string
      let messageContent: MessageContent[] | undefined
      let bashContextForPrompt: string | undefined
      let finalContent: string

      try {
        const prepared = await prepareUserMessage({
          content,
          agentMode,
          postUserMessage,
          attachments,
        })
        userMessageId = prepared.userMessageId
        messageContent = prepared.messageContent
        bashContextForPrompt = prepared.bashContextForPrompt
        finalContent = prepared.finalContent
      } catch (error) {
        logger.error(
          { error },
          '[send-message] prepareUserMessage failed with exception',
        )
        setMessages((prev) => [
          ...prev,
          createErrorChatMessage(
            '⚠️ Failed to prepare message. Please try again.',
          ),
        ])
        resetEarlyReturnState({
          setCanProcessQueue,
          updateChainInProgress,
          isProcessingQueueRef,
          isQueuePausedRef,
        })
        return
      }

      // Validate before sending (e.g., agent config checks)
      try {
        const validationResult = await onBeforeMessageSend()

        if (!validationResult.success) {
          logger.warn(
            { errors: validationResult.errors },
            '[send-message] Validation failed',
          )
          const errorsToAttach =
            validationResult.errors.length === 0
              ? [
                  {
                    id: NETWORK_ERROR_ID,
                    message:
                      'Agent validation failed. This may be due to a network issue or temporary server problem. Please try again.',
                  },
                ]
              : validationResult.errors

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== userMessageId) {
                return msg
              }
              return {
                ...msg,
                validationErrors: errorsToAttach,
              }
            }),
          )
          resetEarlyReturnState({
            setCanProcessQueue,
            updateChainInProgress,
            isProcessingQueueRef,
            isQueuePausedRef,
          })
          return
        }
      } catch (error) {
        logger.error(
          { error },
          '[send-message] Validation before message send failed with exception',
        )

        setMessages((prev) => [
          ...prev,
          createErrorChatMessage(
            '⚠️ Agent validation failed unexpectedly. Please try again.',
          ),
        ])
        await yieldToEventLoop()
        setTimeout(() => scrollToLatest(), 0)

        resetEarlyReturnState({
          setCanProcessQueue,
          updateChainInProgress,
          isProcessingQueueRef,
          isQueuePausedRef,
        })
        return
      }

      // Reset UI focus state
      setFocusedAgentId(null)
      setInputFocused(true)
      inputRef.current?.focus()
      // Create AI message shell and setup streaming context
      const aiMessageId = generateAiMessageId()
      const aiMessage = createAiMessageShell(aiMessageId)

      const { updater, hasReceivedContentRef, abortController } =
        setupStreamingContext({
          aiMessageId,
          timerController,
          setMessages,
          streamRefs,
          abortControllerRef,
          setStreamStatus,
          setCanProcessQueue,
          isQueuePausedRef,
          isProcessingQueueRef,
          updateChainInProgress,
          setIsRetrying,
          setStreamingAgents,
        })
      setStreamStatus('waiting')
      // Combine auto-collapse and AI message addition into single atomic update
      // to prevent flicker from intermediate render states
      setMessages((prev) => [
        ...autoCollapsePreviousMessages(prev, aiMessageId),
        aiMessage,
      ])
      // Note: updateChainInProgress(true) and setCanProcessQueue(false) are already
      // called at the start of sendMessage to ensure they happen synchronously
      // before any async work, so the router can correctly detect busy state.
      let actualCredits: number | undefined

      // Execute SDK run with streaming handlers
      try {
        const executionResult = await executeMessage({
          message: {
            prompt: finalContent,
            bashContext: bashContextForPrompt,
            messageContent,
            agentMode,
          },
          streaming: {
            aiMessageId,
            streamRefs,
            updater,
            hasReceivedContentRef,
          },
          execution: {
            previousRunState: previousRunStateRef.current,
            signal: abortController.signal,
          },
          streamingCallbacks: {
            setStreamingAgents,
            setStreamStatus,
            setHasReceivedPlanResponse,
            setIsRetrying,
          },
          subagentCallbacks: {
            addActiveSubagent,
            removeActiveSubagent,
          },
          onTotalCost: (cost: number) => {
            actualCredits = cost
            addSessionCredits(cost)
          },
        })

        // Handle client or execution errors that didn't throw
        if (!executionResult.success) {
          logger.error(
            { error: executionResult.error },
            '[send-message] Message execution failed',
          )

          // Check for out-of-credits error (402 status code)
          if (executionResult.statusCode === 402) {
            handleExecutionFailure({
              errorMessage: OUT_OF_CREDITS_MESSAGE,
              timerController,
              updater,
              setIsRetrying,
              setStreamStatus,
              setCanProcessQueue,
              updateChainInProgress,
              isProcessingQueueRef,
              isQueuePausedRef,
            })
            useChatStore.getState().setInputMode('outOfCredits')
            invalidateActivityQuery(usageQueryKeys.current())
            return
          }

          handleExecutionFailure({
            errorMessage:
              executionResult.message ||
              'Message execution failed. Please try again.',
            timerController,
            updater,
            setIsRetrying,
            setStreamStatus,
            setCanProcessQueue,
            updateChainInProgress,
            isProcessingQueueRef,
            isQueuePausedRef,
          })
          return
        }

        const runState = executionResult.runState

        // Finalize: persist state and mark complete
        updateRunState(runState)
        setIsRetrying(false)

        setMessages((currentMessages) => {
          persistState(runState, currentMessages)
          return currentMessages
        })
        handleRunCompletion({
          runState,
          actualCredits,
          agentMode,
          timerController,
          updater,
          aiMessageId,
          streamRefs,
          setStreamStatus,
          setCanProcessQueue,
          updateChainInProgress,
          setHasReceivedPlanResponse,
          resumeQueue,
          isProcessingQueueRef,
          isQueuePausedRef,
        })
      } catch (error) {
        handleRunError({
          error,
          timerController,
          updater,
          setIsRetrying,
          setStreamStatus,
          setCanProcessQueue,
          updateChainInProgress,
          isProcessingQueueRef,
          isQueuePausedRef,
        })
      } finally {
        if (isChainInProgressRef.current) {
          logger.warn(
            {},
            '[send-message] Chain still in progress after try/catch, forcing reset',
          )
          updateChainInProgress(false)
          setStreamStatus('idle')
          setCanProcessQueue(!isQueuePausedRef?.current)
        }
        // Safety net: ensure lock is always released even if handleRunCompletion/handleRunError
        // didn't run (e.g., due to unexpected early return). Redundant releases are safe (idempotent).
        if (isProcessingQueueRef) {
          isProcessingQueueRef.current = false
        }
        updater.dispose()
      }
    },
    [
      addActiveSubagent,
      addSessionCredits,
      agentId,
      executeMessage,
      inputRef,
      isChainInProgressRef,
      isProcessingQueueRef,
      isQueuePausedRef,
      mainAgentTimer,
      onBeforeMessageSend,
      onTimerEvent,
      persistState,
      prepareUserMessage,
      previousRunStateRef,
      removeActiveSubagent,
      resumeQueue,
      scrollToLatest,
      setCanProcessQueue,
      setFocusedAgentId,
      setHasReceivedPlanResponse,
      setInputFocused,
      setIsRetrying,
      setMessages,
      setStreamStatus,
      setStreamingAgents,
      streamRefs,
      updateChainInProgress,
      updateRunState,
    ],
  )

  return {
    sendMessage,
    resetRunState,
  }
}
