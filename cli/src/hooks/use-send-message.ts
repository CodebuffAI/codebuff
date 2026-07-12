import { useCallback, useEffect, useRef } from 'react'

import { setCurrentChatId } from '../project-files'
import { createStreamController } from './stream-state'
import { useChatStore } from '../state/chat-store'
import { getCodebuffClient } from '../utils/codebuff-client'
import { AGENT_MODE_TO_COST_MODE, AGENT_MODE_TO_ID } from '../utils/constants'
import { createEventHandlerState } from '../utils/create-event-handler-state'
import { createRunConfig } from '../utils/create-run-config'
import { loadAgentDefinitions } from '../utils/local-agent-registry'
import { logger } from '../utils/logger'
import { getOpenbuffProviderReadiness } from '../utils/openbuff-provider'
import {
  clearCheckpoint,
  loadCheckpoint,
  loadMostRecentChatState,
  saveChatState,
  saveCheckpoint,
  type TurnCheckpoint,
} from '../utils/run-state-storage'
import {
  autoCollapsePreviousMessages,
  createAiMessageShell,
  createErrorMessage as createErrorChatMessage,
  generateAiMessageId,
} from '../utils/send-message-helpers'
import { createSendMessageTimerController } from '../utils/send-message-timer'
import {
  cleanupProviderReadinessFailure,
  createRunOwnership,
  finalizeQueueState,
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
import type { PendingAttachment } from '../types/store'
import type { ChatMessage } from '../types/chat'
import type { SendMessageFn } from '../types/contracts/send-message'
import type { AgentMode } from '../utils/constants'
import type { SendMessageTimerEvent } from '../utils/send-message-timer'
import type { AgentDefinition, MessageContent, RunState } from '@openbuff/sdk'
interface UseSendMessageOptions {
  inputRef: React.MutableRefObject<any>
  activeSubagentsRef: React.MutableRefObject<Set<string>>
  isChainInProgressRef: React.MutableRefObject<boolean>
  setStreamStatus: (status: StreamStatus) => void
  setContextWindowUsage: (usage: { used: number; max: number } | null) => void
  setCanProcessQueue: (can: boolean) => void
  abortControllerRef: React.MutableRefObject<AbortController | null>
  agentId?: string
  onBeforeMessageSend: () => Promise<{
    success: boolean
    errors: Array<{ id: string; message: string }>
  }>
  /** Optional callback fired with the per-turn cost in cents (USD * 100). */
  onTotalCost?: (costCents: number) => void
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
  setContextWindowUsage,
  setCanProcessQueue,
  abortControllerRef,
  agentId,
  onBeforeMessageSend,
  mainAgentTimer,
  scrollToLatest,
  onTimerEvent = () => {},
  onTotalCost,
  isQueuePausedRef,
  isProcessingQueueRef,
  resumeQueue,
  continueChat,
  continueChatId,
}: UseSendMessageOptions): {
  sendMessage: SendMessageFn
  clearMessages: () => void
} => {
  // Read store setters fresh on each callback invocation via useChatStore.getState()
  // rather than capturing them once at component scope. If the zustand store is ever
  // recreated (test isolation, HMR, store swap), a captured setter would be stale,
  // bound to a dead store. Calling getState() inside each callback guarantees the
  // setter always references the live store. These setters have stable identity within
  // a given store instance and don't need to trigger re-renders, so they are excluded
  // from useCallback/useEffect dependency arrays.
  const previousRunStateRef = useRef<RunState | null>(
    useChatStore.getState().runState,
  )
  // P2-3: If a mid-turn checkpoint was loaded on chat restore (interrupted
  // turn), it's stored here. On the next sendMessage, we check whether the
  // prompt matches the checkpoint's last user message — if so, we resume the
  // interrupted turn from the checkpointed state; otherwise we discard it.
  const resumableCheckpointRef = useRef<TurnCheckpoint | null>(null)
  // Memoize stream controller to maintain referential stability across renders
  const streamRefsRef = useRef<ReturnType<
    typeof createStreamController
  > | null>(null)
  if (!streamRefsRef.current) {
    streamRefsRef.current = createStreamController()
  }
  const streamRefs = streamRefsRef.current
  const activeRunOwnerRef = useRef<symbol | null>(null)

  useEffect(() => {
    if (continueChat && !previousRunStateRef.current) {
      const loadedState = loadMostRecentChatState(continueChatId ?? undefined)
      if (loadedState) {
        const { setRunState, setMessages } = useChatStore.getState()
        previousRunStateRef.current = loadedState.runState
        setRunState(loadedState.runState)
        setMessages(loadedState.messages)
        if (loadedState.chatId) {
          setCurrentChatId(loadedState.chatId)
        }
        // P2-3: Check for a mid-turn checkpoint from an interrupted (crashed)
        // turn. Validate that checkpointTurnId matches a message id in the
        // restored messages — if not, the checkpoint is stale and discarded.
        const checkpoint = loadCheckpoint()
        if (checkpoint) {
          const matchesMessage = loadedState.messages.some(
            (msg) => msg.id === checkpoint.checkpointTurnId,
          )
          if (matchesMessage) {
            resumableCheckpointRef.current = checkpoint
            logger.info(
              { checkpointTurnId: checkpoint.checkpointTurnId },
              '[send-message] Loaded mid-turn checkpoint for interrupted turn',
            )
          } else {
            logger.debug(
              { checkpointTurnId: checkpoint.checkpointTurnId },
              '[send-message] Mid-turn checkpoint is stale (no matching message), discarding',
            )
            clearCheckpoint()
          }
        }
      }
    }
  }, [continueChat, continueChatId])

  const updateChainInProgress = useCallback(
    (value: boolean) => {
      isChainInProgressRef.current = value
      useChatStore.getState().setIsChainInProgress(value)
    },
    [isChainInProgressRef],
  )

  const updateActiveSubagents = useCallback(
    (mutate: (next: Set<string>) => void) => {
      useChatStore.getState().setActiveSubagents((prev) => {
        const next = new Set(prev)
        mutate(next)
        activeSubagentsRef.current = next
        return next
      })
    },
    [activeSubagentsRef],
  )

  const addActiveSubagent = useCallback(
    (subagentId: string, agentType?: string) => {
      updateActiveSubagents((next) => next.add(subagentId))
      if (agentType) {
        useChatStore.getState().setActiveAgentTypes((prev) => {
          const next = new Map(prev)
          next.set(subagentId, agentType)
          return next
        })
      }
    },
    [updateActiveSubagents],
  )

  const removeActiveSubagent = useCallback(
    (subagentId: string) => {
      updateActiveSubagents((next) => next.delete(subagentId))
      useChatStore.getState().setActiveAgentTypes((prev) => {
        const next = new Map(prev)
        next.delete(subagentId)
        return next
      })
    },
    [updateActiveSubagents],
  )

  function clearMessages() {
    previousRunStateRef.current = null
    useChatStore.getState().setRunState(null)
  }

  const prepareUserMessage = useCallback(
    (params: {
      content: string
      agentMode: AgentMode
      postUserMessage?: (prev: ChatMessage[]) => ChatMessage[]
      attachments?: PendingAttachment[]
    }) => {
      // Access store fresh each call so setters bind to the live store instance.
      const {
        lastMessageMode,
        setMessages,
        setLastMessageMode,
        setHasReceivedPlanResponse,
      } = useChatStore.getState()
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
    [scrollToLatest],
  )

  const sendMessage = useCallback<SendMessageFn>(
    async ({ content, agentMode, postUserMessage, attachments }) => {
      // Read setters fresh from the live store on each invocation so they always
      // bind to the current store instance (see note above about store recreation).
      const {
        setMessages,
        setFocusedAgentId,
        setInputFocused,
        setStreamingAgents,
        setHasReceivedPlanResponse,
        setRunState,
        setIsRetrying,
      } = useChatStore.getState()
      // CRITICAL: Set chain in progress immediately (synchronously) before any async work.
      // This ensures the router can detect that we're busy and queue subsequent messages.
      // Set the ref directly first to guarantee immediate visibility to other code paths,
      // then call updateChainInProgress to also update React state for re-renders.
      isChainInProgressRef.current = true
      updateChainInProgress(true)
      setCanProcessQueue(false)
      const { isCurrentRunOwner, isCurrentRunActive, releaseRunOwner } =
        createRunOwnership(activeRunOwnerRef)

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
        releaseRunOwner()
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
                  // Hide this for now, as validate endpoint may be flaky and we don't want to bother users.
                  // {
                  //   id: NETWORK_ERROR_ID,
                  //   message:
                  //     'Agent validation failed. This may be due to a network issue or temporary server problem. Please try again.',
                  // },
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
          releaseRunOwner()
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
        releaseRunOwner()
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
          '[send-message] No client available. Please check your provider configuration.',
        )
        // Show error to user instead of silently failing
        setMessages((prev) => [
          ...prev,
          createErrorChatMessage(
            '⚠️ Unable to connect. Please check your provider configuration and try again.',
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
        releaseRunOwner()
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
        const providerReadiness = getOpenbuffProviderReadiness({
          agent: resolvedAgent,
          agentMode,
        })
        if (!providerReadiness.ok) {
          cleanupProviderReadinessFailure({
            message: providerReadiness.message,
            updater,
            timerController,
            setStreamStatus,
            setCanProcessQueue,
            updateChainInProgress,
            releaseRunOwner,
            isProcessingQueueRef,
            isQueuePausedRef,
          })
          return
        }

        const promptWithBashContext = bashContextForPrompt
          ? bashContextForPrompt + finalContent
          : finalContent
        const effectivePrompt = buildPromptWithContext(
          promptWithBashContext,
          messageContent,
        )

        // P2-3: Determine whether we're resuming an interrupted turn from a
        // checkpoint. We resume only if the checkpoint's last user message
        // matches the effective prompt — otherwise the user typed a new
        // (different) message and we start fresh, discarding the stale
        // checkpoint state.
        const checkpoint = resumableCheckpointRef.current
        let resumeInterruptedTurn = false
        let previousRunState = previousRunStateRef.current
        if (checkpoint && previousRunState?.sessionState) {
          const lastUserMessage = [...checkpoint.mainAgentState.messageHistory]
            .reverse()
            .find((msg) => msg.role === 'user')
          const lastUserText =
            lastUserMessage && typeof lastUserMessage.content === 'string'
              ? lastUserMessage.content
              : null
          if (lastUserText === effectivePrompt) {
            previousRunState = {
              ...previousRunState,
              sessionState: {
                ...previousRunState.sessionState,
                mainAgentState: checkpoint.mainAgentState,
              },
            }
            resumeInterruptedTurn = true
            logger.info(
              '[send-message] Resuming interrupted turn from mid-turn checkpoint',
            )
          } else {
            // Prompt doesn't match — user typed a new message. Discard the
            // stale checkpoint so it can't interfere with future turns.
            resumableCheckpointRef.current = null
            clearCheckpoint()
          }
        }

        const eventHandlerState = createEventHandlerState({
          streamRefs,
          setStreamingAgents,
          setStreamStatus,
          setContextWindowUsage,
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
            onTotalCost?.(cost)
          },
        })

        const runConfig = createRunConfig({
          logger,
          agent: resolvedAgent,
          prompt: effectivePrompt,
          content: messageContent,
          previousRunState,
          agentDefinitions,
          eventHandlerState,
          signal: abortController.signal,
          costMode: AGENT_MODE_TO_COST_MODE[agentMode],
          onCheckpoint: (agentState) => {
            if (isCurrentRunActive(abortController.signal)) {
              saveCheckpoint(userMessageId, agentState)
            }
          },
          resumeInterruptedTurn,
        })

        logger.info(
          { runConfig },
          '[send-message] Sending message with sdk run config',
        )
        const runState = await client.run(runConfig)

        // Accept an aborted run's preserved state while it still owns the send.
        // This serializes cancel-A/send-B and prevents continuation from forking
        // from what the user sees in the TUI.
        if (!isCurrentRunOwner()) {
          logger.debug(
            {
              aborted: abortController.signal.aborted,
              isCurrentRunOwner: isCurrentRunOwner(),
            },
            '[send-message] Ignoring run completion from superseded send',
          )
          return
        }

        previousRunStateRef.current = runState
        setRunState(runState)
        setIsRetrying(false)

        setMessages((currentMessages) => {
          saveChatState(runState, currentMessages)
          return currentMessages
        })
        // The SDK state is authoritative for both success and cooperative abort.
        clearCheckpoint()
        resumableCheckpointRef.current = null
        handleRunCompletion({
          runState,
          actualCredits,
          agentMode,
          timerController,
          updater,
          aiMessageId,
          wasAbortedByUser: abortController.signal.aborted,
          setStreamStatus,
          setCanProcessQueue,
          updateChainInProgress,
          setHasReceivedPlanResponse,
          resumeQueue,
          isProcessingQueueRef,
          isQueuePausedRef,
        })
      } catch (error) {
        if (!abortController.signal.aborted) {
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
        } else {
          logger.debug({ error }, '[send-message] Run rejected after abort')
          if (isCurrentRunOwner()) {
            finalizeQueueState({
              setStreamStatus,
              setCanProcessQueue,
              updateChainInProgress,
              isProcessingQueueRef,
              isQueuePausedRef,
              resumeQueue,
            })
          }
        }
      } finally {
        if (isCurrentRunOwner()) {
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
        }
        releaseRunOwner()
        updater.dispose()
      }
    },
    [
      addActiveSubagent,
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
      setContextWindowUsage,
      setStreamStatus,
      streamRefs,
      updateChainInProgress,
    ],
  )

  return {
    sendMessage,
    clearMessages,
  }
}
