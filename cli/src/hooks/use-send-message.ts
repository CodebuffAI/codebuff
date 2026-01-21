import { useCallback, useEffect, useRef } from 'react'

import { setCurrentChatId } from '../project-files'
import { createStreamController } from './stream-state'
import { useChatStore } from '../state/chat-store'
import { getCodebuffClient } from '../utils/codebuff-client'
import { AGENT_MODE_TO_ID } from '../utils/constants'
import { createEventHandlerState } from '../utils/create-event-handler-state'
import { createRunConfig } from '../utils/create-run-config'
import { loadAgentDefinitions } from '../utils/local-agent-registry'
import { logger } from '../utils/logger'
import {
  loadMostRecentChatState,
  saveChatState,
} from '../utils/run-state-storage'
import {
  autoCollapsePreviousMessages,
  createAiMessageShell,
  createErrorMessage as createErrorChatMessage,
  generateAiMessageId,
} from '../utils/send-message-helpers'
import { createSendMessageTimerController } from '../utils/send-message-timer'
import {
  handleRunCompletion,
  handleRunError,
  prepareUserMessage as prepareUserMessageHelper,
  resetEarlyReturnState,
  setupStreamingContext,
} from './helpers/send-message'
import { NETWORK_ERROR_ID } from '../utils/validation-error-helpers'
import { yieldToEventLoop } from '../utils/yield-to-event-loop'

import type { ElapsedTimeTracker } from './use-elapsed-time'
import type { StreamStatus } from './use-message-queue'
import type { PendingAttachment } from '../state/chat-store'
import type { ChatMessage } from '../types/chat'
import type { SendMessageFn } from '../types/contracts/send-message'
import type { AgentMode } from '../utils/constants'
import type { SendMessageTimerEvent } from '../utils/send-message-timer'
import type { AgentDefinition, MessageContent, RunState } from '@codebuff/sdk'

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

// Choose the agent definition by explicit selection or mode-based fallback.
const resolveAgent = (
  agentMode: AgentMode,
  agentId: string | undefined,
  agentDefinitions: AgentDefinition[],
): AgentDefinition | string => {
  const selectedAgentDefinition =
    agentId && agentDefinitions.length > 0
      ? agentDefinitions.find((definition) => definition.id === agentId)
      : undefined

  return selectedAgentDefinition ?? agentId ?? AGENT_MODE_TO_ID[agentMode]
}

// Respect bash context, but avoid sending empty prompts when only images are attached.
const buildPromptWithContext = (
  promptWithBashContext: string,
  messageContent: MessageContent[] | undefined,
) => {
  const trimmedPrompt = promptWithBashContext.trim()
  if (trimmedPrompt.length > 0) {
    return promptWithBashContext
  }

  if (messageContent && messageContent.length > 0) {
    return 'See attached image(s)'
  }

  return ''
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
  clearMessages: () => void
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
  const previousRunStateRef = useRef<RunState | null>(null)
  // Memoize stream controller to maintain referential stability across renders
  const streamRefsRef = useRef<ReturnType<
    typeof createStreamController
  > | null>(null)
  if (!streamRefsRef.current) {
    streamRefsRef.current = createStreamController()
  }
  const streamRefs = streamRefsRef.current

  useEffect(() => {
    if (continueChat && !previousRunStateRef.current) {
      const loadedState = loadMostRecentChatState(continueChatId ?? undefined)
      if (loadedState) {
        previousRunStateRef.current = loadedState.runState
        setRunState(loadedState.runState)
        setMessages(loadedState.messages)
        if (loadedState.chatId) {
          setCurrentChatId(loadedState.chatId)
        }
      }
    }
  }, [continueChat, continueChatId, setMessages, setRunState])

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

  function clearMessages() {
    previousRunStateRef.current = null
  }

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

      // Get SDK client
      const client = await getCodebuffClient()

      if (!client) {
        logger.error(
          {},
          '[send-message] No Codebuff client available. Please ensure you are authenticated.',
        )
        // Show error to user instead of silently failing
        setMessages((prev) => [
          ...prev,
          createErrorChatMessage(
            '⚠️ Unable to connect to Codebuff. Please check your authentication and try again.',
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
        const agentDefinitions = loadAgentDefinitions()
        const resolvedAgent = resolveAgent(agentMode, agentId, agentDefinitions)

        const promptWithBashContext = bashContextForPrompt
          ? bashContextForPrompt + finalContent
          : finalContent
        const effectivePrompt = buildPromptWithContext(
          promptWithBashContext,
          messageContent,
        )

        const eventHandlerState = createEventHandlerState({
          streamRefs,
          setStreamingAgents,
          setStreamStatus,
          aiMessageId,
          updater,
          hasReceivedContentRef,
          addActiveSubagent,
          removeActiveSubagent,
          agentMode,
          setHasReceivedPlanResponse,
          logger,
          setIsRetrying,
          onTotalCost: (cost: number) => {
            actualCredits = cost
            addSessionCredits(cost)
          },
        })

        const runConfig = createRunConfig({
          logger,
          agent: resolvedAgent,
          prompt: effectivePrompt,
          content: messageContent,
          previousRunState: previousRunStateRef.current,
          agentDefinitions,
          eventHandlerState,
          signal: abortController.signal,
        })

        logger.info({ runConfig }, '[send-message] Sending message with sdk run config')
        const runState = await client.run(runConfig)

        // Finalize: persist state and mark complete
        previousRunStateRef.current = runState
        setRunState(runState)
        setIsRetrying(false)

        setMessages((currentMessages) => {
          saveChatState(runState, currentMessages)
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
      inputRef,
      isChainInProgressRef,
      isProcessingQueueRef,
      isQueuePausedRef,
      mainAgentTimer,
      onBeforeMessageSend,
      onTimerEvent,
      prepareUserMessage,
      removeActiveSubagent,
      resumeQueue,
      scrollToLatest,
      setCanProcessQueue,
      setFocusedAgentId,
      setHasReceivedPlanResponse,
      setInputFocused,
      setIsRetrying,
      setMessages,
      setRunState,
      setStreamStatus,
      setStreamingAgents,
      streamRefs,
      updateChainInProgress,
    ],
  )

  return {
    sendMessage,
    clearMessages,
  }
}
