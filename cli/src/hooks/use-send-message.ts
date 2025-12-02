import {
  MAX_RETRIES_PER_MESSAGE,
  RETRY_BACKOFF_BASE_DELAY_MS,
  RETRY_BACKOFF_MAX_DELAY_MS,
} from '@codebuff/sdk'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { match } from 'ts-pattern'

import { setCurrentChatId } from '../project-files'
import { createStreamController } from './stream-state'
import { useChatStore } from '../state/chat-store'
import { getCodebuffClient } from '../utils/codebuff-client'
import { loadAgentDefinitions } from '../utils/load-agent-definitions'
import { logger } from '../utils/logger'
import {
  loadMostRecentChatState,
  saveChatState,
} from '../utils/run-state-storage'
import {
  createEventHandler,
  createStreamChunkHandler,
} from '../utils/sdk-event-handlers'
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
  setupStreamingContext,
} from './helpers/send-message'
import { NETWORK_ERROR_ID } from '../utils/validation-error-helpers'

import type { ElapsedTimeTracker } from './use-elapsed-time'
import type { StreamStatus } from './use-message-queue'
import type { PendingImage } from '../state/chat-store'
import type { ChatMessage } from '../types/chat'
import type { SendMessageFn } from '../types/contracts/send-message'
import type { AgentMode } from '../utils/constants'
import type { SendMessageTimerEvent } from '../utils/send-message-timer'
import type { AgentDefinition, MessageContent, RunState } from '@codebuff/sdk'
import type { SetStateAction } from 'react'

// Main chat send hook: orchestrates prep, streaming, and completion.
const yieldToEventLoop = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

interface UseSendMessageOptions {
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setFocusedAgentId: (id: string | null) => void
  setInputFocused: (focused: boolean) => void
  inputRef: React.MutableRefObject<any>
  setStreamingAgents: React.Dispatch<React.SetStateAction<Set<string>>>
  activeSubagentsRef: React.MutableRefObject<Set<string>>
  isChainInProgressRef: React.MutableRefObject<boolean>
  setActiveSubagents: React.Dispatch<React.SetStateAction<Set<string>>>
  setIsChainInProgress: (value: boolean) => void
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
  setHasReceivedPlanResponse: (value: boolean) => void
  lastMessageMode: AgentMode | null
  setLastMessageMode: (mode: AgentMode | null) => void
  addSessionCredits: (credits: number) => void
  setRunState: (runState: RunState | null) => void
  isQueuePausedRef?: React.MutableRefObject<boolean>
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

  const fallbackAgent = match(agentMode)
    .with('MAX', () => 'base2-max')
    .with('DEFAULT', () => 'base2')
    .with('PLAN', () => 'base2-plan')
    .exhaustive()

  return selectedAgentDefinition ?? agentId ?? fallbackAgent
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
  setMessages,
  setFocusedAgentId,
  setInputFocused,
  inputRef,
  setStreamingAgents,
  activeSubagentsRef,
  isChainInProgressRef,
  setActiveSubagents,
  setIsChainInProgress,
  setStreamStatus,
  setCanProcessQueue,
  abortControllerRef,
  agentId,
  onBeforeMessageSend,
  mainAgentTimer,
  scrollToLatest,
  onTimerEvent = () => {},
  setHasReceivedPlanResponse,
  lastMessageMode,
  setLastMessageMode,
  addSessionCredits,
  setRunState,
  isQueuePausedRef,
  resumeQueue,
  continueChat,
  continueChatId,
}: UseSendMessageOptions): {
  sendMessage: SendMessageFn
  clearMessages: () => void
} => {
  const queryClient = useQueryClient()
  const setIsRetrying = useChatStore.getState().setIsRetrying
  const previousRunStateRef = useRef<RunState | null>(null)
  const streamRefs = createStreamController()

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
    (agentId: string) => {
      updateActiveSubagents((next) => next.add(agentId))
    },
    [updateActiveSubagents],
  )

  const removeActiveSubagent = useCallback(
    (agentId: string) => {
      updateActiveSubagents((next) => next.delete(agentId))
    },
    [updateActiveSubagents],
  )

  const pendingMessageUpdatesRef = useRef<
    ((messages: ChatMessage[]) => ChatMessage[])[]
  >([])
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushPendingUpdates = useCallback(() => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current)
      flushTimeoutRef.current = null
    }
    if (pendingMessageUpdatesRef.current.length === 0) {
      return
    }
    const queuedUpdates = pendingMessageUpdatesRef.current.slice()
    pendingMessageUpdatesRef.current = []

    setMessages((prev) => {
      let next = prev
      for (const updater of queuedUpdates) {
        next = updater(next)
      }
      return next
    })
  }, [setMessages])

  const queueMessageUpdate = useCallback(
    (updater: (messages: ChatMessage[]) => ChatMessage[]) => {
      pendingMessageUpdatesRef.current.push(updater)
      if (!flushTimeoutRef.current) {
        flushTimeoutRef.current = setTimeout(() => {
          flushTimeoutRef.current = null
          flushPendingUpdates()
        }, 48)
      }
    },
    [flushPendingUpdates],
  )

  const applyMessageUpdate = useCallback(
    (update: SetStateAction<ChatMessage[]>) => {
      flushPendingUpdates()
      setMessages(update)
    },
    [flushPendingUpdates, setMessages],
  )

  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current)
        flushTimeoutRef.current = null
      }
      flushPendingUpdates()
    }
  }, [flushPendingUpdates])

  function clearMessages() {
    previousRunStateRef.current = null
  }

  const prepareUserMessage = useCallback(
    (params: {
      content: string
      agentMode: AgentMode
      postUserMessage?: (prev: ChatMessage[]) => ChatMessage[]
      attachedImages?: PendingImage[]
    }) => {
      return prepareUserMessageHelper({
        ...params,
        deps: {
          applyMessageUpdate,
          lastMessageMode,
          setLastMessageMode,
          scrollToLatest,
          setHasReceivedPlanResponse,
        },
      })
    },
    [
      applyMessageUpdate,
      lastMessageMode,
      scrollToLatest,
      setLastMessageMode,
      setHasReceivedPlanResponse,
    ],
  )

  const sendMessage = useCallback<SendMessageFn>(
    async ({ content, agentMode, postUserMessage, images: attachedImages }) => {
      if (agentMode !== 'PLAN') {
        setHasReceivedPlanResponse(false)
      }

      const timerController = createSendMessageTimerController({
        mainAgentTimer,
        onTimerEvent,
        agentId,
      })
      setIsRetrying(false)

      const { userMessageId, messageContent, bashContextForPrompt } =
        await prepareUserMessage({
          content,
          agentMode,
          postUserMessage,
          attachedImages,
        })

      try {
        const validationResult = await onBeforeMessageSend()

        if (!validationResult.success) {
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
          return
        }
      } catch (error) {
        logger.error(
          { error },
          'Validation before message send failed with exception',
        )

        applyMessageUpdate((prev) => [
          ...prev,
          createErrorChatMessage(
            '⚠️ Agent validation failed unexpectedly. Please try again.',
          ),
        ])
        await yieldToEventLoop()
        setTimeout(() => scrollToLatest(), 0)

        return
      }

      setFocusedAgentId(null)
      setInputFocused(true)
      inputRef.current?.focus()

      const client = await getCodebuffClient()

      if (!client) {
        logger.error(
          {},
          'No Codebuff client available. Please ensure you are authenticated.',
        )
        return
      }

      const aiMessageId = generateAiMessageId()
      const aiMessage = createAiMessageShell(aiMessageId)

      applyMessageUpdate((prev) =>
        autoCollapsePreviousMessages(prev, aiMessageId),
      )

      const { updater, hasReceivedContentRef, abortController } =
        setupStreamingContext({
          aiMessageId,
          timerController,
          queueMessageUpdate,
          flushPendingUpdates,
          streamRefs,
          abortControllerRef,
          setStreamStatus,
          setCanProcessQueue,
          isQueuePausedRef,
          updateChainInProgress,
          setIsRetrying,
        })
      setStreamStatus('waiting')
      applyMessageUpdate((prev) => [...prev, aiMessage])
      setCanProcessQueue(false)
      updateChainInProgress(true)
      let actualCredits: number | undefined

      try {
        const agentDefinitions = loadAgentDefinitions()
        const resolvedAgent = resolveAgent(agentMode, agentId, agentDefinitions)

        const promptWithBashContext = bashContextForPrompt
          ? bashContextForPrompt + content
          : content
        const effectivePrompt = buildPromptWithContext(
          promptWithBashContext,
          messageContent,
        )

        const eventContext = {
          streaming: {
            streamRefs,
            setStreamingAgents,
            setStreamStatus,
          },
          message: {
            aiMessageId,
            updater,
            hasReceivedContentRef,
          },
          subagents: {
            addActiveSubagent,
            removeActiveSubagent,
          },
          mode: {
            agentMode,
            setHasReceivedPlanResponse,
          },
          logger,
          setIsRetrying,
          onTotalCost: (cost: number) => {
            actualCredits = cost
            addSessionCredits(cost)
          },
        }

        const runState = await client.run({
          logger,
          agent: resolvedAgent,
          prompt: effectivePrompt,
          content: messageContent,
          previousRun: previousRunStateRef.current ?? undefined,
          abortController,
          retry: {
            maxRetries: MAX_RETRIES_PER_MESSAGE,
            backoffBaseMs: RETRY_BACKOFF_BASE_DELAY_MS,
            backoffMaxMs: RETRY_BACKOFF_MAX_DELAY_MS,
            onRetry: async ({ attempt, delayMs, errorCode }) => {
              logger.warn(
                { sdkAttempt: attempt, delayMs, errorCode },
                'SDK retrying after error',
              )
              setIsRetrying(true)
              setStreamStatus('waiting')
            },
            onRetryExhausted: async ({ totalAttempts, errorCode }) => {
              logger.warn(
                { totalAttempts, errorCode },
                'SDK exhausted all retries',
              )
            },
          },
          agentDefinitions,
          maxAgentSteps: 40,
          handleStreamChunk: createStreamChunkHandler(eventContext),
          handleEvent: createEventHandler(eventContext),
        })

        previousRunStateRef.current = runState
        setRunState(runState)
        setIsRetrying(false)

        applyMessageUpdate((currentMessages) => {
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
          queryClient,
        })
      } catch (error) {
        handleRunError({
          error,
          aiMessageId,
          timerController,
          updater,
          setIsRetrying,
          setStreamStatus,
          setCanProcessQueue,
          updateChainInProgress,
          queryClient,
        })
      }
    },
    [
      addActiveSubagent,
      addSessionCredits,
      agentId,
      applyMessageUpdate,
      flushPendingUpdates,
      inputRef,
      isQueuePausedRef,
      mainAgentTimer,
      onTimerEvent,
      onBeforeMessageSend,
      prepareUserMessage,
      queueMessageUpdate,
      queryClient,
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
      streamRefs,
      updateChainInProgress,
      setStreamingAgents,
    ],
  )

  return {
    sendMessage,
    clearMessages,
  }
}
