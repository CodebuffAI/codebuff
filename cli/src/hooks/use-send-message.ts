import { has, isEqual } from 'lodash'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getCodebuffClient, formatToolOutput } from '../utils/codebuff-client'
import {
  MAIN_AGENT_ID,
  shouldHideAgent,
  shouldCollapseByDefault,
} from '../utils/constants'
import { createValidationErrorBlocks } from '../utils/create-validation-error-blocks'
import { getErrorObject } from '../utils/error'
import { formatTimestamp } from '../utils/helpers'
import { loadAgentDefinitions } from '../utils/load-agent-definitions'
import { getLoadedAgentsData } from '../utils/local-agent-registry'
import { logger } from '../utils/logger'
import { getUserMessage } from '../utils/message-history'
import { isAuthenticationError, isNetworkError } from '@codebuff/sdk'
import {
  loadMostRecentChatState,
  saveChatState,
} from '../utils/run-state-storage'
import { setCurrentChatId } from '../project-files'

import type { ElapsedTimeTracker } from './use-elapsed-time'
import type { StreamStatus } from './use-message-queue'
import type { ChatMessage, ContentBlock, ToolContentBlock } from '../types/chat'
import type { SendMessageFn } from '../types/contracts/send-message'
import type { ParamsOf } from '../types/function-params'
import type { SetElement } from '../types/utils'
import type { AgentMode } from '../utils/constants'
import type { AgentDefinition, RunState, ToolName } from '@codebuff/sdk'
import type { SetStateAction } from 'react'
const hiddenToolNames = new Set<ToolName | 'spawn_agent_inline'>([
  'spawn_agent_inline',
  'end_turn',
  'spawn_agents',
])

const MAX_RETRIES_PER_MESSAGE = 3
const RETRY_BACKOFF_BASE_DELAY_MS = 1_000
const RETRY_BACKOFF_MAX_DELAY_MS = 8_000

const RETRYABLE_ERROR_CODES = new Set([
  'NETWORK_ERROR',
  'TIMEOUT',
  'CONNECTION_LOST',
  'ECONNRESET',
])

const yieldToEventLoop = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

const waitForDelay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

const getErrorMessage = (error: unknown, fallback = 'Request failed') => {
  if (error instanceof Error) {
    return error.message || fallback
  }
  if (typeof error === 'string') {
    return error
  }
  return fallback
}

const isRetryableError = (error: unknown) => {
  if (!error) {
    return false
  }
  if (isAuthenticationError(error)) {
    return false
  }
  if (isNetworkError(error)) {
    return true
  }
  const maybeError = error as { code?: string; status?: number }
  if (maybeError.code && RETRYABLE_ERROR_CODES.has(maybeError.code)) {
    return true
  }
  if (typeof maybeError.status === 'number') {
    if (maybeError.status >= 500) {
      return true
    }
    if (maybeError.status === 429) {
      return true
    }
  }
  return false
}

// Helper function to recursively update blocks
const updateBlocksRecursively = (
  blocks: ContentBlock[],
  targetAgentId: string,
  updateFn: (block: ContentBlock) => ContentBlock,
): ContentBlock[] => {
  let foundTarget = false
  const result = blocks.map((block) => {
    if (block.type === 'agent' && block.agentId === targetAgentId) {
      foundTarget = true
      return updateFn(block)
    }
    if (block.type === 'agent' && block.blocks) {
      const updatedBlocks = updateBlocksRecursively(
        block.blocks,
        targetAgentId,
        updateFn,
      )
      // Only create new block if nested blocks actually changed
      if (updatedBlocks !== block.blocks) {
        foundTarget = true
        return {
          ...block,
          blocks: updatedBlocks,
        }
      }
    }
    return block
  })

  // Return original array reference if nothing changed
  return foundTarget ? result : blocks
}

const scrubPlanTags = (s: string) =>
  s.replace(/<PLAN>[\s\S]*?<\/cb_plan>/g, '').replace(/<PLAN>[\s\S]*$/g, '')

const scrubPlanTagsInBlocks = (blocks: ContentBlock[]): ContentBlock[] => {
  return blocks
    .map((b) => {
      if (b.type === 'text') {
        const newContent = scrubPlanTags(b.content)
        return {
          ...b,
          content: newContent,
        }
      }
      return b
    })
    .filter((b) => b.type !== 'text' || b.content.trim() !== '')
}

export type SendMessageTimerEvent =
  | {
      type: 'start'
      startedAt: number
      messageId: string
      agentId?: string
    }
  | {
      type: 'stop'
      startedAt: number
      finishedAt: number
      elapsedMs: number
      messageId: string
      agentId?: string
      outcome: 'success' | 'error' | 'aborted'
    }

export type SendMessageTimerOutcome = 'success' | 'error' | 'aborted'

export interface SendMessageTimerController {
  start: (messageId: string) => void
  stop: (outcome: SendMessageTimerOutcome) => {
    finishedAt: number
    elapsedMs: number
  } | null
  isActive: () => boolean
}

export interface SendMessageTimerControllerOptions {
  mainAgentTimer: ElapsedTimeTracker
  onTimerEvent: (event: SendMessageTimerEvent) => void
  agentId?: string
  now?: () => number
}

export const createSendMessageTimerController = (
  options: SendMessageTimerControllerOptions,
): SendMessageTimerController => {
  const {
    mainAgentTimer,
    onTimerEvent,
    agentId,
    now = () => Date.now(),
  } = options

  let timerStartedAt: number | null = null
  let timerMessageId: string | null = null
  let timerActive = false

  const start = (messageId: string) => {
    if (timerActive) {
      return
    }
    timerActive = true
    timerMessageId = messageId
    timerStartedAt = now()
    mainAgentTimer.start()
    onTimerEvent({
      type: 'start',
      startedAt: timerStartedAt,
      messageId,
      ...(agentId ? { agentId } : {}),
    })
  }

  const stop = (outcome: SendMessageTimerOutcome) => {
    if (!timerActive || timerStartedAt == null || !timerMessageId) {
      return null
    }
    timerActive = false
    mainAgentTimer.stop()
    const finishedAt = now()
    const elapsedMs = Math.max(0, finishedAt - timerStartedAt)
    onTimerEvent({
      type: 'stop',
      startedAt: timerStartedAt,
      finishedAt,
      elapsedMs,
      messageId: timerMessageId,
      outcome,
      ...(agentId ? { agentId } : {}),
    })
    timerStartedAt = null
    timerMessageId = null
    return { finishedAt, elapsedMs }
  }

  const isActive = () => timerActive

  return { start, stop, isActive }
}

interface UseSendMessageOptions {
  messages: ChatMessage[]
  allToggleIds: Set<string>
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
  startStreaming: () => void
  stopStreaming: () => void
  setCanProcessQueue: (can: boolean) => void
  abortControllerRef: React.MutableRefObject<AbortController | null>
  agentId?: string
  onBeforeMessageSend: () => Promise<{
    success: boolean
    errors: Array<{ id: string; message: string }>
  }>
  mainAgentTimer: ElapsedTimeTracker
  scrollToLatest: () => void
  availableWidth?: number
  onTimerEvent?: (event: SendMessageTimerEvent) => void
  setHasReceivedPlanResponse: (value: boolean) => void
  lastMessageMode: AgentMode | null
  setLastMessageMode: (mode: AgentMode | null) => void
  addSessionCredits: (credits: number) => void
  setRunState: (runState: RunState | null) => void
  isQueuePausedRef?: React.MutableRefObject<boolean>
  resumeQueue?: () => void
  isConnectedRef: React.MutableRefObject<boolean>
  continueChat: boolean
  continueChatId?: string
}

export const useSendMessage = ({
  messages,
  allToggleIds,
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
  startStreaming,
  stopStreaming,
  setCanProcessQueue,
  abortControllerRef,
  agentId,
  onBeforeMessageSend,
  mainAgentTimer,
  scrollToLatest,
  availableWidth = 80,
  onTimerEvent = () => {},
  setHasReceivedPlanResponse,
  lastMessageMode,
  setLastMessageMode,
  addSessionCredits,
  setRunState,
  isQueuePausedRef,
  resumeQueue,
  isConnectedRef,
  continueChat,
  continueChatId,
}: UseSendMessageOptions): {
  sendMessage: SendMessageFn
  clearMessages: () => void
  pendingRetryCount: number
  retryPendingMessages: () => Promise<void>
  processFailedMessages: () => void
} => {
  const previousRunStateRef = useRef<RunState | null>(null)

  // Load previous chat state on mount if continueChat is true
  useEffect(() => {
    if (continueChat && !previousRunStateRef.current) {
      const loadedState = loadMostRecentChatState(continueChatId ?? undefined)
      if (loadedState) {
        previousRunStateRef.current = loadedState.runState
        setRunState(loadedState.runState)
        setMessages(loadedState.messages)

        // Ensure subsequent saves use this conversation id
        if (loadedState.chatId) {
          setCurrentChatId(loadedState.chatId)
        }

        logger.info(
          {
            messageCount: loadedState.messages.length,
            chatId: loadedState.chatId,
          },
          'Loaded previous chat state for continuation',
        )
      } else {
        logger.info(
          { chatId: continueChatId ?? null },
          'No previous chat state found to continue from',
        )
      }
    }
  }, [continueChat, continueChatId, setMessages, setRunState])
  const spawnAgentsMapRef = useRef<
    Record<string, { index: number; agentType: string }>
  >({})
  const rootStreamBufferRef = useRef('')
  const agentStreamAccumulatorsRef = useRef<Record<string, string>>({})
  const rootStreamSeenRef = useRef(false)
  const planExtractedRef = useRef(false)
  const pendingRetriesRef = useRef<
    Record<string, { content: string; agentMode: AgentMode }>
  >({})
  const [pendingRetryCount, setPendingRetryCount] = useState(0)
  const retryAttemptsRef = useRef<Record<string, number>>({})
  const retryInFlightRef = useRef(false)
  const retryBackoffDelayRef = useRef(RETRY_BACKOFF_BASE_DELAY_MS)
  const streamHadOutputRef = useRef(false)
  const currentRunContextRef = useRef<{
    userMessageId: string
    content: string
    agentMode: AgentMode
  } | null>(null)
  const failedDueToConnectionRef = useRef<
    Record<string, { content: string; agentMode: AgentMode }>
  >({})

  const updateChainInProgress = useCallback(
    (value: boolean) => {
      isChainInProgressRef.current = value
      setIsChainInProgress(value)
    },
    [setIsChainInProgress, isChainInProgressRef],
  )

  function clearMessages() {
    previousRunStateRef.current = null
  }

  const updateActiveSubagents = useCallback(
    (mutate: (next: Set<string>) => void) => {
      setActiveSubagents((prev) => {
        const next = new Set(prev)
        mutate(next)

        if (next.size === prev.size) {
          let changed = false
          for (const candidate of prev) {
            if (!next.has(candidate)) {
              changed = true
              break
            }
          }
          if (!changed) {
            activeSubagentsRef.current = prev
            return prev
          }
        }

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
      updateActiveSubagents((next) => {
        if (next.has(agentId)) {
          next.delete(agentId)
        }
      })
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

  const scheduleFlush = useCallback(() => {
    if (flushTimeoutRef.current) {
      return
    }
    flushTimeoutRef.current = setTimeout(() => {
      flushTimeoutRef.current = null
      flushPendingUpdates()
    }, 48)
  }, [flushPendingUpdates])

  const queueMessageUpdate = useCallback(
    (updater: (messages: ChatMessage[]) => ChatMessage[]) => {
      pendingMessageUpdatesRef.current.push(updater)
      scheduleFlush()
    },
    [scheduleFlush],
  )

  const applyMessageUpdate = useCallback(
    (update: SetStateAction<ChatMessage[]>) => {
      flushPendingUpdates()
      setMessages(update)
    },
    [flushPendingUpdates, setMessages],
  )

  const markAiMessageInterrupted = useCallback(
    (messageId: string) => {
      applyMessageUpdate((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) {
            return msg
          }

          const blocks: ContentBlock[] = msg.blocks ? [...msg.blocks] : []
          const lastBlock = blocks[blocks.length - 1]

          if (lastBlock && lastBlock.type === 'text') {
            const interruptedBlock: ContentBlock = {
              ...lastBlock,
              content: `${lastBlock.content}\n\n[response interrupted]`,
            }
            return {
              ...msg,
              blocks: [...blocks.slice(0, -1), interruptedBlock],
              isComplete: true,
            }
          }

          const interruptionNotice: ContentBlock = {
            type: 'text',
            content: '[response interrupted]',
          }
          return {
            ...msg,
            blocks: [...blocks, interruptionNotice],
            isComplete: true,
          }
        }),
      )
    },
    [applyMessageUpdate],
  )

  const markUserMessageFailed = useCallback(
    (messageId: string, errorMessage: string) => {
      if (!messageId) {
        return
      }
      applyMessageUpdate((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) {
            return msg
          }
          return {
            ...msg,
            isComplete: true,
            isError: true,
            errorMessage,
          }
        }),
      )
      delete retryAttemptsRef.current[messageId]
    },
    [applyMessageUpdate],
  )

  const schedulePendingRetry = useCallback(
    ({
      userMessageId,
      content,
      agentMode,
      note,
    }: {
      userMessageId: string
      content: string
      agentMode: AgentMode
      note: string
    }) => {
      if (!userMessageId) {
        return
      }
      const pending = pendingRetriesRef.current
      const alreadyScheduled = userMessageId in pending
      pending[userMessageId] = { content, agentMode }

      logger.info(
        {
          userMessageId,
          note,
          alreadyScheduled,
          pendingCount: Object.keys(pending).length,
          contentPreview: content.slice(0, 50),
        },
        '[SCHEDULE-RETRY] Scheduled message for retry',
      )

      if (!alreadyScheduled) {
        logger.debug(
          { pendingRetryCount: Object.keys(pending).length },
          '[SCHEDULE-RETRY] Updating pendingRetryCount',
        )
        setPendingRetryCount(Object.keys(pending).length)
      }
      setCanProcessQueue(false)
    },
    [setCanProcessQueue],
  )

  const clearPendingRetryForMessage = useCallback((messageId: string) => {
    if (!messageId) {
      return
    }
    const pending = pendingRetriesRef.current
    if (messageId in pending) {
      delete pending[messageId]
      setPendingRetryCount(Object.keys(pending).length)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current)
        flushTimeoutRef.current = null
      }
      currentRunContextRef.current = null
      flushPendingUpdates()
    }
  }, [flushPendingUpdates])

  const sendMessage = useCallback<SendMessageFn>(
    async (params: ParamsOf<SendMessageFn>) => {
      const { content, agentMode, postUserMessage, retryOfMessageId } = params
      let userMessageId = retryOfMessageId ?? ''

      if (retryOfMessageId) {
        const attempts = retryAttemptsRef.current[retryOfMessageId] ?? 0
        if (attempts >= MAX_RETRIES_PER_MESSAGE) {
          logger.warn(
            { retryOfMessageId, attempts },
            'Max retries reached for message',
          )
          markUserMessageFailed(
            retryOfMessageId,
            'Maximum retry attempts reached',
          )
          clearPendingRetryForMessage(retryOfMessageId)
          setCanProcessQueue(true)
          if (resumeQueue && !isQueuePausedRef?.current) {
            resumeQueue()
          }
          return
        }
        retryAttemptsRef.current[retryOfMessageId] = attempts + 1
      }

      if (agentMode !== 'PLAN') {
        setHasReceivedPlanResponse(false)
      }

      const timerController = createSendMessageTimerController({
        mainAgentTimer,
        onTimerEvent,
        agentId,
      })

      // Use memoized toggle IDs from the store selector
      // This is computed efficiently in the Zustand store
      const previousToggleIds = allToggleIds

      // Check if mode changed and insert divider if needed
      // Also show divider on first message (when lastMessageMode is null)
      const shouldInsertDivider =
        !retryOfMessageId &&
        (lastMessageMode === null || lastMessageMode !== agentMode)

      applyMessageUpdate((prev) => {
        let newMessages = [...prev]

        // Insert mode divider if mode changed
        if (shouldInsertDivider) {
          const dividerMessage: ChatMessage = {
            id: `divider-${Date.now()}`,
            variant: 'ai',
            content: '',
            blocks: [
              {
                type: 'mode-divider',
                mode: agentMode,
              },
            ],
            timestamp: formatTimestamp(),
          }
          newMessages.push(dividerMessage)
        }

        // Add user message to UI first (only for new sends)
        if (!retryOfMessageId) {
          const userMessage = getUserMessage(content)
          newMessages.push(userMessage)
          userMessageId = userMessage.id
        }

        if (!retryOfMessageId && postUserMessage) {
          newMessages = postUserMessage(newMessages)
        }
        if (newMessages.length > 100) {
          return newMessages.slice(-100)
        }
        return newMessages
      })

      if (!userMessageId) {
        logger.error(
          { retryOfMessageId },
          'Unable to determine user message id for send operation',
        )
        return
      }

      clearPendingRetryForMessage(userMessageId)
      if (!retryOfMessageId) {
        delete retryAttemptsRef.current[userMessageId]
      }

      // Update last message mode
      setLastMessageMode(agentMode)

      await yieldToEventLoop()

      // Scroll to bottom after user message appears
      setTimeout(() => scrollToLatest(), 0)

      // Validate agents before sending message (blocking)
      try {
        const validationResult = await onBeforeMessageSend()

        if (!validationResult.success) {
          logger.warn('Message send blocked due to agent validation errors')

          // Create validation error blocks with clickable file paths
          const loadedAgentsData = getLoadedAgentsData()
          const errorBlocks = createValidationErrorBlocks({
            errors: validationResult.errors,
            loadedAgentsData,
            availableWidth,
          })

          const errorMessage: ChatMessage = {
            id: `error-${Date.now()}`,
            variant: 'error',
            content: '',
            blocks: errorBlocks,
            timestamp: formatTimestamp(),
          }

          applyMessageUpdate((prev) => [...prev, errorMessage])
          await yieldToEventLoop()
          setTimeout(() => scrollToLatest(), 0)

          return
        }
      } catch (error) {
        logger.error(
          { error },
          'Validation before message send failed with exception',
        )

        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          variant: 'error',
          content: 'Agent validation failed unexpectedly. Please try again.',
          timestamp: formatTimestamp(),
        }

        applyMessageUpdate((prev) => [...prev, errorMessage])
        await yieldToEventLoop()
        setTimeout(() => scrollToLatest(), 0)

        return
      }

      setFocusedAgentId(null)
      setInputFocused(true)
      inputRef.current?.focus()

      const client = getCodebuffClient()

      if (!client) {
        logger.error(
          {},
          'No Codebuff client available. Please ensure you are authenticated.',
        )
        return
      }

      const aiMessageId = `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const aiMessage: ChatMessage = {
        id: aiMessageId,
        variant: 'ai',
        content: '',
        blocks: [],
        timestamp: formatTimestamp(),
      }

      // Auto-collapse previous message toggles to minimize clutter.
      // Respects user intent by keeping toggles open that the user manually expanded.
      applyMessageUpdate((prev) => {
        return prev.map((message) => {
          // Don't collapse the message we just added
          if (message.id === aiMessageId) {
            return message
          }

          // Handle agent variant messages
          if (message.variant === 'agent') {
            const userOpened = message.metadata?.userOpened ?? false
            return userOpened
              ? message
              : {
                  ...message,
                  metadata: {
                    ...message.metadata,
                    isCollapsed: true,
                  },
                }
          }

          // Handle blocks within messages
          if (!message.blocks) return message

          const autoCollapseBlocksRecursively = (
            blocks: ContentBlock[],
          ): ContentBlock[] => {
            return blocks.map((block) => {
              // Handle thinking blocks (grouped text blocks)
              if (block.type === 'text' && block.thinkingId) {
                return block.userOpened
                  ? block
                  : { ...block, isCollapsed: true }
              }

              // Handle agent blocks
              if (block.type === 'agent') {
                const updatedBlock = block.userOpened
                  ? block
                  : { ...block, isCollapsed: true }

                // Recursively update nested blocks
                if (updatedBlock.blocks) {
                  return {
                    ...updatedBlock,
                    blocks: autoCollapseBlocksRecursively(updatedBlock.blocks),
                  }
                }
                return updatedBlock
              }

              // Handle tool blocks
              if (block.type === 'tool') {
                return block.userOpened
                  ? block
                  : { ...block, isCollapsed: true }
              }

              // Handle agent-list blocks
              if (block.type === 'agent-list') {
                return block.userOpened
                  ? block
                  : { ...block, isCollapsed: true }
              }

              return block
            })
          }

          return {
            ...message,
            blocks: autoCollapseBlocksRecursively(message.blocks),
          }
        })
      })

      rootStreamBufferRef.current = ''
      rootStreamSeenRef.current = false
      planExtractedRef.current = false
      agentStreamAccumulatorsRef.current = {}
      timerController.start(aiMessageId)

      const updateAgentContent = (
        agentId: string,
        update:
          | { type: 'text'; content: string; replace?: boolean }
          | Extract<ContentBlock, { type: 'tool' }>,
      ) => {
        const preview =
          update.type === 'text'
            ? update.content.slice(0, 120)
            : JSON.stringify({ toolName: update.toolName }).slice(0, 120)
        queueMessageUpdate((prev) =>
          prev.map((msg) => {
            if (msg.id === aiMessageId && msg.blocks) {
              // Use recursive update to handle nested agents
              const newBlocks = updateBlocksRecursively(
                msg.blocks,
                agentId,
                (block) => {
                  if (block.type !== 'agent') {
                    return block
                  }
                  const agentBlocks: ContentBlock[] = block.blocks
                    ? [...block.blocks]
                    : []
                  if (update.type === 'text') {
                    const text = update.content ?? ''
                    const replace = update.replace ?? false

                    if (replace) {
                      const updatedBlocks = [...agentBlocks]
                      let replaced = false

                      for (let i = updatedBlocks.length - 1; i >= 0; i--) {
                        const entry = updatedBlocks[i]
                        if (entry.type === 'text') {
                          replaced = true
                          if (
                            entry.content === text &&
                            block.content === text
                          ) {
                            logger.info(
                              {
                                agentId,
                                preview,
                              },
                              'Agent block text replacement skipped',
                            )
                            return block
                          }
                          updatedBlocks[i] = { ...entry, content: text }
                          break
                        }
                      }

                      if (!replaced) {
                        updatedBlocks.push({ type: 'text', content: text })
                      }

                      return {
                        ...block,
                        content: text,
                        blocks: updatedBlocks,
                      }
                    }

                    if (!text) {
                      return block
                    }

                    const lastBlock = agentBlocks[agentBlocks.length - 1]
                    if (lastBlock && lastBlock.type === 'text') {
                      if (lastBlock.content.endsWith(text)) {
                        logger.info(
                          { agentId, preview },
                          'Skipping duplicate agent text append',
                        )
                        return block
                      }
                      const updatedLastBlock: ContentBlock = {
                        ...lastBlock,
                        content: lastBlock.content + text,
                      }
                      const updatedContent = (block.content ?? '') + text
                      return {
                        ...block,
                        content: updatedContent,
                        blocks: [...agentBlocks.slice(0, -1), updatedLastBlock],
                      }
                    } else {
                      const updatedContent = (block.content ?? '') + text
                      return {
                        ...block,
                        content: updatedContent,
                        blocks: [
                          ...agentBlocks,
                          { type: 'text', content: text },
                        ],
                      }
                    }
                  } else if (update.type === 'tool') {
                    logger.info(
                      {
                        agentId,
                        toolName: update.toolName,
                      },
                      'Agent block tool appended',
                    )
                    return { ...block, blocks: [...agentBlocks, update] }
                  }
                  return block
                },
              )
              return { ...msg, blocks: newBlocks }
            }
            return msg
          }),
        )
      }

      const appendRootChunk = (
        delta:
          | { type: 'text'; text: string }
          | { type: 'reasoning'; text: string },
      ) => {
        if (!delta.text) {
          return
        }

        queueMessageUpdate((prev) =>
          prev.map((msg) => {
            if (msg.id !== aiMessageId) {
              return msg
            }

            const blocks: ContentBlock[] = msg.blocks ? [...msg.blocks] : []
            const lastBlock = blocks[blocks.length - 1]

            if (
              lastBlock &&
              lastBlock.type === 'text' &&
              delta.type === lastBlock.textType
            ) {
              const updatedBlock: ContentBlock = {
                ...lastBlock,
                content: lastBlock.content + delta.text,
              }
              return {
                ...msg,
                blocks: [...blocks.slice(0, -1), updatedBlock],
              }
            }

            return {
              ...msg,
              blocks: [
                ...blocks,
                {
                  type: 'text',
                  content: delta.text,
                  textType: delta.type,
                  ...(delta.type === 'reasoning' && {
                    color: 'grey',
                    isCollapsed: true,
                  }),
                },
              ],
            }
          }),
        )

        // Detect and extract <PLAN>...</PLAN> once available
        if (
          agentMode === 'PLAN' &&
          delta.type === 'text' &&
          !planExtractedRef.current &&
          rootStreamBufferRef.current.includes('</PLAN>')
        ) {
          const buffer = rootStreamBufferRef.current
          const openIdx = buffer.indexOf('<PLAN>')
          const closeIdx = buffer.indexOf('</PLAN>')
          if (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx) {
            const rawPlan = buffer
              .slice(openIdx + '<PLAN>'.length, closeIdx)
              .trim()
            planExtractedRef.current = true
            setHasReceivedPlanResponse(true)

            applyMessageUpdate((prev) =>
              prev.map((msg) => {
                if (msg.id !== aiMessageId) return msg
                const cleanedBlocks = scrubPlanTagsInBlocks(msg.blocks || [])
                const newBlocks = [
                  ...cleanedBlocks,
                  {
                    type: 'plan' as const,
                    content: rawPlan,
                  },
                ]
                return {
                  ...msg,
                  blocks: newBlocks,
                }
              }),
            )
          }
        }
      }

      setStreamStatus('waiting')
      applyMessageUpdate((prev) => {
        return [...prev, aiMessage]
      })
      setCanProcessQueue(false)
      updateChainInProgress(true)
      let hasReceivedContent = false
      let actualCredits: number | undefined = undefined
      let settled = false

      streamHadOutputRef.current = false

      const abortController = new AbortController()
      abortControllerRef.current = abortController

      // Abort listener for immediate UI cleanup.
      // Note: With shared controller, both SDK (timeout) and user (Ctrl+C) can abort.
      // This listener only updates UI state - the error handler manages retries.
      abortController.signal.addEventListener('abort', () => {
        if (settled) {
          return
        }
        // Update UI immediately for responsive feedback
        streamHadOutputRef.current = false
        setStreamStatus('idle')
        updateChainInProgress(false)
        timerController.stop('aborted')

        // Note: We intentionally do NOT:
        // - Set canProcessQueue = false (would block retries)
        // - Clear currentRunContextRef (error handler needs it)
        // - Mark message as interrupted (error handler handles it)
      })

      currentRunContextRef.current = {
        userMessageId,
        content,
        agentMode,
      }

      try {
        // Load local agent definitions from .agents directory
        const agentDefinitions = loadAgentDefinitions()
        const selectedAgentDefinition =
          agentId && agentDefinitions.length > 0
            ? (agentDefinitions.find(
                (definition) => definition.id === agentId,
              ) as AgentDefinition | undefined)
            : undefined

        const fallbackAgent =
          agentMode === 'DEFAULT'
            ? 'base2'
            : agentMode === 'MAX'
              ? 'base2-max'
              : 'base2-plan'

        const runState = await client.run({
          logger,
          agent: selectedAgentDefinition ?? agentId ?? fallbackAgent,
          prompt: content,
          previousRun: previousRunStateRef.current ?? undefined,
          abortController: abortController,
          agentDefinitions: agentDefinitions,
          maxAgentSteps: 40,

          handleStreamChunk: (event) => {
            if (!streamHadOutputRef.current) {
              streamHadOutputRef.current = true
            }
            if (
              typeof event === 'string' ||
              (event.type === 'reasoning_chunk' &&
                event.ancestorRunIds.length === 0)
            ) {
              const eventObj:
                | { type: 'text'; text: string }
                | { type: 'reasoning'; text: string } =
                typeof event === 'string'
                  ? { type: 'text', text: event }
                  : { type: 'reasoning', text: event.chunk }
              if (!hasReceivedContent) {
                hasReceivedContent = true
                setStreamStatus('streaming')
              }

              if (!eventObj.text) {
                return
              }

              if (eventObj.type === 'text') {
                rootStreamBufferRef.current =
                  (rootStreamBufferRef.current ?? '') + eventObj.text
              }

              rootStreamSeenRef.current = true
              appendRootChunk(eventObj)
            } else if (
              event.type === 'subagent_chunk' ||
              event.type === 'reasoning_chunk'
            ) {
              const { agentId, chunk } = event

              const previous =
                agentStreamAccumulatorsRef.current[agentId] ?? ''
              if (!chunk) {
                return
              }
              agentStreamAccumulatorsRef.current[agentId] = previous + chunk

              // TODO: Add reasoning chunks to a separate component
              updateAgentContent(agentId, {
                type: 'text',
                content: chunk,
              })
              return
            } else {
              event satisfies never
              throw new Error('Unhandled event type')
            }
          },

          handleEvent: (event) => {
            logger.info(
              {
                type: event.type,
                hasAgentId: has(event, 'agentId') && event.agentId,
                event,
              },
              `SDK ${JSON.stringify(event.type)} Event received (raw)`,
            )

            // Handle error events from SDK
            if (event.type === 'error') {
              logger.error(
                { errorMessage: event.message },
                'SDK error event received',
              )
              currentRunContextRef.current = null
              // Stop streaming and update UI
              setStreamStatus('idle')
              setCanProcessQueue(false)
              updateChainInProgress(false)
              timerController.stop('error')

              // Display error message to user
              applyMessageUpdate((prev) =>
                prev.map((msg) => {
                  if (msg.id !== aiMessageId) {
                    return msg
                  }

                  const blocks: ContentBlock[] = msg.blocks
                    ? [...msg.blocks]
                    : []
                  const errorBlock: ContentBlock = {
                    type: 'text',
                    content: `\n\n**Error:** ${event.message}`,
                  }

                  return {
                    ...msg,
                    blocks: [...blocks, errorBlock],
                    isComplete: true,
                    variant: 'error' as const,
                  }
                }),
              )

              // Track failed messages for batch retry on reconnection (avoids state update cascade)
              const errorMsg = event.message || ''
              const isConnectionError =
                !isConnectedRef.current ||
                (typeof errorMsg === 'string' &&
                  (errorMsg.includes('Failed to start agent run') ||
                    errorMsg.includes('Unable to connect') ||
                    errorMsg.includes('network') ||
                    errorMsg.includes('fetch failed')))

              if (isConnectionError && userMessageId && content && agentMode) {
                failedDueToConnectionRef.current[userMessageId] = {
                  content,
                  agentMode,
                }
              }

              return
            }

            if (event.type === 'text') {
              const text = event.text

              if (typeof text !== 'string' || !text) return

              // Track if main agent (no agentId) started streaming
              if (!hasReceivedContent && !event.agentId) {
                hasReceivedContent = true
                setStreamStatus('streaming')
              } else if (!hasReceivedContent) {
                hasReceivedContent = true
                setStreamStatus('streaming')
              }

              if (event.agentId) {
                logger.info(
                  {
                    agentId: event.agentId,
                    textPreview: text.slice(0, 100),
                  },
                  'setMessages: text event with agentId',
                )
                const previous =
                  agentStreamAccumulatorsRef.current[event.agentId] ?? ''
                if (!text) {
                  return
                }
                agentStreamAccumulatorsRef.current[event.agentId] =
                  previous + text

                updateAgentContent(event.agentId, {
                  type: 'text',
                  content: text,
                })
              } else {
                if (rootStreamSeenRef.current) {
                  // Skip redundant root text events when stream chunks already handled
                  return
                }
                const previous = rootStreamBufferRef.current ?? ''
                if (!text) {
                  return
                }
                logger.info(
                  {
                    textPreview: text.slice(0, 100),
                    previousLength: previous.length,
                    appendedLength: text.length,
                  },
                  'setMessages: text event without agentId',
                )
                rootStreamBufferRef.current = previous + text

                appendRootChunk({ type: 'text', text })
              }
              return
            }

            if (
              event.type === 'finish' &&
              typeof event.totalCost === 'number'
            ) {
              actualCredits = event.totalCost
              addSessionCredits(event.totalCost)
            }

            if (event.type === 'subagent_start') {
              // Skip rendering hidden agents
              if (shouldHideAgent(event.agentType)) {
                return
              }

              if (event.agentId) {
                logger.info(
                  {
                    agentId: event.agentId,
                    agentType: event.agentType,
                    parentAgentId: event.parentAgentId || 'ROOT',
                    hasParentAgentId: !!event.parentAgentId,
                    eventKeys: Object.keys(event),
                    params: event.params,
                    prompt: event.prompt,
                  },
                  'CLI: subagent_start event received',
                )
                addActiveSubagent(event.agentId)

                let foundExistingBlock = false
                for (const [
                  tempId,
                  info,
                ] of Object.entries(spawnAgentsMapRef.current)) {
                  const eventType = event.agentType || ''
                  const storedType = info.agentType || ''
                  // Match if exact match, or if eventType ends with storedType (e.g., 'codebuff/file-picker@0.0.2' matches 'file-picker')
                  const isMatch =
                    eventType === storedType ||
                    (eventType.includes('/') &&
                      eventType.split('/')[1]?.split('@')[0] === storedType)
                  if (isMatch) {
                    logger.info(
                      {
                        tempId,
                        realAgentId: event.agentId,
                        agentType: eventType,
                        hasParentAgentId: !!event.parentAgentId,
                        parentAgentId: event.parentAgentId || 'none',
                      },
                      'setMessages: matching spawn_agents block found',
                    )
                    applyMessageUpdate((prev) =>
                      prev.map((msg) => {
                        if (msg.id === aiMessageId && msg.blocks) {
                          // Find and extract the block with tempId
                          let blockToMove: ContentBlock | null = null
                          const extractBlock = (
                            blocks: ContentBlock[],
                          ): ContentBlock[] => {
                            const result: ContentBlock[] = []
                            for (const block of blocks) {
                              if (
                                block.type === 'agent' &&
                                block.agentId === tempId
                              ) {
                                blockToMove = {
                                  ...block,
                                  agentId: event.agentId,
                                  ...(event.params && { params: event.params }),
                                  ...(event.prompt &&
                                    block.initialPrompt === '' && {
                                      initialPrompt: event.prompt,
                                    }),
                                }
                                // Don't add to result - we're extracting it
                              } else if (
                                block.type === 'agent' &&
                                block.blocks
                              ) {
                                // Recursively process nested blocks
                                result.push({
                                  ...block,
                                  blocks: extractBlock(block.blocks),
                                })
                              } else {
                                result.push(block)
                              }
                            }
                            return result
                          }

                          let blocks = extractBlock(msg.blocks)

                          if (!blockToMove) {
                            // Fallback: just rename if we couldn't find it
                            blocks = updateBlocksRecursively(
                              msg.blocks,
                              tempId,
                              (block) => ({ ...block, agentId: event.agentId }),
                            )
                            return { ...msg, blocks }
                          }

                          // If parentAgentId exists, nest under parent
                          if (event.parentAgentId) {
                            logger.info(
                              {
                                tempId,
                                realAgentId: event.agentId,
                                parentAgentId: event.parentAgentId,
                              },
                              'setMessages: moving spawn_agents block to nest under parent',
                            )

                            // Try to find parent and nest
                            let parentFound = false
                            const updatedBlocks = updateBlocksRecursively(
                              blocks,
                              event.parentAgentId,
                              (parentBlock) => {
                                if (parentBlock.type !== 'agent') {
                                  return parentBlock
                                }
                                parentFound = true
                                return {
                                  ...parentBlock,
                                  blocks: [
                                    ...(parentBlock.blocks || []),
                                    blockToMove!,
                                  ],
                                }
                              },
                            )

                            // If parent found, use updated blocks; otherwise add to top level
                            if (parentFound) {
                              blocks = updatedBlocks
                            } else {
                              logger.info(
                                {
                                  tempId,
                                  realAgentId: event.agentId,
                                  parentAgentId: event.parentAgentId,
                                },
                                'setMessages: spawn_agents parent not found, adding to top level',
                              )
                              blocks = [...blocks, blockToMove]
                            }
                          } else {
                            // No parent - add back at top level with new ID
                            blocks = [...blocks, blockToMove]
                          }

                          return { ...msg, blocks }
                        }
                        return msg
                      }),
                    )

                    setStreamingAgents((prev) => {
                      const next = new Set(prev)
                      next.delete(tempId)
                      next.add(event.agentId)
                      return next
                    })

                    delete spawnAgentsMapRef.current[tempId]
                    foundExistingBlock = true
                    break
                  }
                }

                if (!foundExistingBlock) {
                  logger.info(
                    {
                      agentId: event.agentId,
                      agentType: event.agentType,
                      parentAgentId: event.parentAgentId || 'ROOT',
                    },
                    'setMessages: creating new agent block (no spawn_agents match)',
                  )
                  applyMessageUpdate((prev) =>
                    prev.map((msg) => {
                      if (msg.id !== aiMessageId) {
                        return msg
                      }

                      const blocks: ContentBlock[] = msg.blocks
                        ? [...msg.blocks]
                        : []
                      const newAgentBlock: ContentBlock = {
                        type: 'agent',
                        agentId: event.agentId,
                        agentName: event.agentType || 'Agent',
                        agentType: event.agentType || 'unknown',
                        content: '',
                        status: 'running' as const,
                        blocks: [] as ContentBlock[],
                        initialPrompt: event.prompt || '',
                        ...(event.params && { params: event.params }),
                        ...(shouldCollapseByDefault(event.agentType || '') && {
                          isCollapsed: true,
                        }),
                      }

                      // If parentAgentId exists, nest inside parent agent
                      if (event.parentAgentId) {
                        logger.info(
                          {
                            childId: event.agentId,
                            parentId: event.parentAgentId,
                          },
                          'Nesting agent inside parent',
                        )

                        // Try to find and update parent
                        let parentFound = false
                        const updatedBlocks = updateBlocksRecursively(
                          blocks,
                          event.parentAgentId,
                          (parentBlock) => {
                            if (parentBlock.type !== 'agent') {
                              return parentBlock
                            }
                            parentFound = true
                            return {
                              ...parentBlock,
                              blocks: [
                                ...(parentBlock.blocks || []),
                                newAgentBlock,
                              ],
                            }
                          },
                        )

                        // If parent was found, use updated blocks; otherwise add to top level
                        if (parentFound) {
                          return { ...msg, blocks: updatedBlocks }
                        } else {
                          logger.info(
                            {
                              childId: event.agentId,
                              parentId: event.parentAgentId,
                            },
                            'Parent agent not found, adding to top level',
                          )
                          // Parent doesn't exist - add at top level as fallback
                          return {
                            ...msg,
                            blocks: [...blocks, newAgentBlock],
                          }
                        }
                      }

                      // No parent - add to top level
                      return {
                        ...msg,
                        blocks: [...blocks, newAgentBlock],
                      }
                    }),
                  )

                  setStreamingAgents((prev) => new Set(prev).add(event.agentId))
                }
              }
            } else if (event.type === 'subagent_finish') {
              if (event.agentId) {
                if (shouldHideAgent(event.agentType)) {
                  return
                }
                delete agentStreamAccumulatorsRef.current[event.agentId]
                removeActiveSubagent(event.agentId)

                applyMessageUpdate((prev) =>
                  prev.map((msg) => {
                    if (msg.id === aiMessageId && msg.blocks) {
                      // Use recursive update to handle nested agents
                      const blocks = updateBlocksRecursively(
                        msg.blocks,
                        event.agentId,
                        (block) => ({ ...block, status: 'complete' as const }),
                      )
                      return { ...msg, blocks }
                    }
                    return msg
                  }),
                )

                setStreamingAgents((prev) => {
                  const next = new Set(prev)
                  next.delete(event.agentId)
                  return next
                })
              }
            }

            if (event.type === 'tool_call' && event.toolCallId) {
              const { toolCallId, toolName, input, agentId, includeToolCall } =
                event

              if (toolName === 'spawn_agents' && input?.agents) {
                const agents = Array.isArray(input.agents) ? input.agents : []

                agents.forEach((agent: any, index: number) => {
                  const tempAgentId = `${toolCallId}-${index}`
                  spawnAgentsMapRef.current[tempAgentId] = {
                    index,
                    agentType: agent.agent_type || 'unknown',
                  }
                })

                applyMessageUpdate((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== aiMessageId) {
                      return msg
                    }

                    const existingBlocks: ContentBlock[] = msg.blocks
                      ? [...msg.blocks]
                      : []

                    const newAgentBlocks: ContentBlock[] = agents.map(
                      (agent: any, index: number) => ({
                        type: 'agent',
                        agentId: `${toolCallId}-${index}`,
                        agentName: agent.agent_type || 'Agent',
                        agentType: agent.agent_type || 'unknown',
                        content: '',
                        status: 'running' as const,
                        blocks: [] as ContentBlock[],
                        initialPrompt: agent.prompt || '',
                        ...(shouldCollapseByDefault(agent.agent_type || '') && {
                          isCollapsed: true,
                        }),
                      }),
                    )

                    return {
                      ...msg,
                      blocks: [...existingBlocks, ...newAgentBlocks],
                    }
                  }),
                )

                agents.forEach((_: any, index: number) => {
                  const agentId = `${toolCallId}-${index}`
                  setStreamingAgents((prev) => new Set(prev).add(agentId))
                })

                return
              }

              function isHiddenToolName(
                toolName: string,
              ): toolName is SetElement<typeof hiddenToolNames> {
                return hiddenToolNames.has(
                  toolName as SetElement<typeof hiddenToolNames>,
                )
              }
              if (isHiddenToolName(toolName)) {
                return
              }

              // If this tool call belongs to a subagent, add it to that agent's blocks
              if (agentId) {
                applyMessageUpdate((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== aiMessageId || !msg.blocks) {
                      return msg
                    }

                    // Use recursive update to handle nested agents
                    const updatedBlocks = updateBlocksRecursively(
                      msg.blocks,
                      agentId,
                      (block) => {
                        if (block.type !== 'agent') {
                          return block
                        }
                        const agentBlocks: ContentBlock[] = block.blocks
                          ? [...block.blocks]
                          : []
                        const newToolBlock: ToolContentBlock = {
                          type: 'tool',
                          toolCallId,
                          toolName: toolName as ToolName,
                          input,
                          agentId,
                          ...(includeToolCall !== undefined && {
                            includeToolCall,
                          }),
                        }

                        return {
                          ...block,
                          blocks: [...agentBlocks, newToolBlock],
                        }
                      },
                    )

                    return { ...msg, blocks: updatedBlocks }
                  }),
                )
              } else {
                // Top-level tool call (or agent block doesn't exist yet)
                applyMessageUpdate((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== aiMessageId) {
                      return msg
                    }

                    const existingBlocks: ContentBlock[] = msg.blocks
                      ? [...msg.blocks]
                      : []
                    const newToolBlock: ContentBlock = {
                      type: 'tool',
                      toolCallId,
                      toolName: toolName as ToolName,
                      input,
                      agentId,
                      ...(includeToolCall !== undefined && { includeToolCall }),
                    }

                    return {
                      ...msg,
                      blocks: [...existingBlocks, newToolBlock],
                    }
                  }),
                )
              }

              setStreamingAgents((prev) => new Set(prev).add(toolCallId))
            } else if (event.type === 'tool_result' && event.toolCallId) {
              const { toolCallId } = event

              // Check if this is a spawn_agents result
              // The structure is: output[0].value = [{ agentName, agentType, value }]
              const firstOutputValue = has(event.output?.[0], 'value')
                ? event.output?.[0]?.value
                : undefined
              const isSpawnAgentsResult =
                Array.isArray(firstOutputValue) &&
                firstOutputValue.some((v: any) => v?.agentName || v?.agentType)

              if (isSpawnAgentsResult && Array.isArray(firstOutputValue)) {
                applyMessageUpdate((prev) =>
                  prev.map((msg) => {
                    if (msg.id === aiMessageId && msg.blocks) {
                      const blocks = msg.blocks.map((block) => {
                        if (
                          block.type === 'agent' &&
                          block.agentId.startsWith(toolCallId)
                        ) {
                          const agentIndex = parseInt(
                            block.agentId.split('-').pop() || '0',
                            10,
                          )
                          const result = firstOutputValue[agentIndex]

                          if (has(result, 'value') && result.value) {
                            let content: string
                            if (typeof result.value === 'string') {
                              content = result.value
                            } else if (
                              has(result.value, 'errorMessage') &&
                              result.value.errorMessage
                            ) {
                              // Handle error messages from failed agent spawns
                              content = String(result.value.errorMessage)
                            } else if (
                              has(result.value, 'value') &&
                              result.value.value &&
                              typeof result.value.value === 'string'
                            ) {
                              // Handle nested value structure like { type: "lastMessage", value: "..." }
                              content = result.value.value
                            } else if (
                              has(result.value, 'message') &&
                              result.value.message
                            ) {
                              content = result.value.message
                            } else {
                              content = formatToolOutput([result])
                            }

                            logger.info(
                              {
                                agentId: block.agentId,
                                contentLength: content.length,
                                contentPreview: content.substring(0, 100),
                              },
                              'setMessages: spawn_agents result processed',
                            )

                            const resultTextBlock: ContentBlock = {
                              type: 'text',
                              content,
                            }
                            // Determine status based on whether there's an error
                            const hasError =
                              has(result.value, 'errorMessage') &&
                              result.value.errorMessage
                            return {
                              ...block,
                              blocks: [resultTextBlock],
                              status: hasError
                                ? ('failed' as const)
                                : ('complete' as const),
                            }
                          }
                        }
                        return block
                      })
                      return { ...msg, blocks }
                    }
                    return msg
                  }),
                )

                firstOutputValue.forEach((_: any, index: number) => {
                  const agentId = `${toolCallId}-${index}`
                  setStreamingAgents((prev) => {
                    const next = new Set(prev)
                    next.delete(agentId)
                    return next
                  })
                })
                return
              }

              const updateToolBlock = (
                blocks: ContentBlock[],
              ): ContentBlock[] => {
                return blocks.map((block) => {
                  if (
                    block.type === 'tool' &&
                    block.toolCallId === toolCallId
                  ) {
                    let output: string
                    if (block.toolName === 'run_terminal_command') {
                      const parsed = (event.output?.[0] as any)?.value
                      if (parsed?.stdout || parsed?.stderr) {
                        output = (parsed.stdout || '') + (parsed.stderr || '')
                      } else {
                        output = formatToolOutput(event.output)
                      }
                    } else {
                      output = formatToolOutput(event.output)
                    }
                    return { ...block, output }
                  } else if (block.type === 'agent' && block.blocks) {
                    const updatedBlocks = updateToolBlock(block.blocks)
                    // Avoid creating new block if nested blocks didn't change
                    if (isEqual(block.blocks, updatedBlocks)) {
                      return block
                    }
                    return { ...block, blocks: updatedBlocks }
                  }
                  return block
                })
              }

              applyMessageUpdate((prev) =>
                prev.map((msg) => {
                  if (msg.id === aiMessageId && msg.blocks) {
                    return { ...msg, blocks: updateToolBlock(msg.blocks) }
                  }
                  return msg
                }),
              )

              setStreamingAgents((prev) => {
                const next = new Set(prev)
                next.delete(toolCallId)
                return next
              })
            }
          },
        })

        previousRunStateRef.current = runState
        setRunState(runState)

        // Save both runState and current messages
        applyMessageUpdate((currentMessages) => {
          saveChatState(runState, currentMessages)
          return currentMessages
        })

        if (!runState.output || runState.output.type === 'error') {
          currentRunContextRef.current = null
          streamHadOutputRef.current = false
          setCanProcessQueue(false)

          const errorMessage =
            runState.output?.type === 'error'
              ? runState.output.message
              : 'No output from agent run'

          logger.warn({ errorMessage }, 'Agent run failed')

          // Track failed messages for batch retry on reconnection (avoids state update cascade)
          const isConnectionError =
            !isConnectedRef.current ||
            (typeof errorMessage === 'string' &&
              (errorMessage.includes('Unable to connect') ||
                errorMessage.includes('network') ||
                errorMessage.includes('fetch failed') ||
                errorMessage.includes('connection')))

          if (isConnectionError && userMessageId && content && agentMode) {
            logger.info(
              { userMessageId },
              '[RUNSTATE-ERROR] Tracking message for retry on reconnection',
            )
            failedDueToConnectionRef.current[userMessageId] = {
              content,
              agentMode,
            }
          }

          return
        }

        currentRunContextRef.current = null
        streamHadOutputRef.current = false
        setStreamStatus('idle')
        if (resumeQueue && !isQueuePausedRef?.current) {
          resumeQueue()
        }
        setCanProcessQueue(true)
        updateChainInProgress(false)
        const timerResult = timerController.stop('success')

        if (agentMode === 'PLAN') {
          setHasReceivedPlanResponse(true)
        }

        const elapsedMs = timerResult?.elapsedMs ?? 0
        const elapsedSeconds = Math.floor(elapsedMs / 1000)
        const completionTime =
          elapsedSeconds > 0 ? `${elapsedSeconds}s` : undefined

        applyMessageUpdate((prev) =>
          prev.map((msg) => {
            if (msg.id !== aiMessageId) {
              return msg
            }
            return {
              ...msg,
              isComplete: true,
              ...(completionTime && { completionTime }),
              ...(actualCredits !== undefined && {
                credits: actualCredits,
              }),
              metadata: {
                ...(msg.metadata ?? {}),
                runState,
              },
            }
          }),
        )
        settled = true
        delete retryAttemptsRef.current[userMessageId]
      } catch (error) {
        settled = true
        logger.error(
          { error: getErrorObject(error) },
          'SDK client.run() failed',
        )
        currentRunContextRef.current = null
        streamHadOutputRef.current = false
        setStreamStatus('idle')
        setCanProcessQueue(false)
        updateChainInProgress(false)
        timerController.stop('error')

        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred'

        // Mark message as interrupted when an error occurs
        markAiMessageInterrupted(aiMessageId)

        applyMessageUpdate((prev) =>
          prev.map((msg) => {
            if (msg.id !== aiMessageId) {
              return msg
            }
            const updatedContent =
              msg.content + `\n\n**Error:** ${errorMessage}`
            return {
              ...msg,
              content: updatedContent,
            }
          }),
        )

        applyMessageUpdate((prev) =>
          prev.map((msg) => {
            if (msg.id !== aiMessageId) {
              return msg
            }
            return { ...msg, isComplete: true }
          }),
        )

        const pendingAlreadyScheduled =
          userMessageId in pendingRetriesRef.current
        const timedOutDueToSdk =
          isNetworkError(error) && Boolean(error.streamTimedOut)

        const shouldRetryError =
          timedOutDueToSdk ||
          !isConnectedRef.current ||
          isRetryableError(error)

        if (!shouldRetryError) {
          logger.error(
            { userMessageId, error: errorMessage },
            'Non-retryable error encountered; not scheduling retry',
          )
          markUserMessageFailed(userMessageId, errorMessage)
          setCanProcessQueue(true)
          if (resumeQueue && !isQueuePausedRef?.current) {
            resumeQueue()
          }
          return
        }

        if (!pendingAlreadyScheduled) {
          const note = !isConnectedRef.current
            ? 'Waiting for connection…'
            : timedOutDueToSdk
              ? 'Timed out…'
              : 'Stream interrupted'

          schedulePendingRetry({
            userMessageId,
            content,
            agentMode,
            note,
          })
        }
      }
    },
    [
      applyMessageUpdate,
      queueMessageUpdate,
      setFocusedAgentId,
      setInputFocused,
      inputRef,
      setStreamingAgents,
      allToggleIds,
      activeSubagentsRef,
      isChainInProgressRef,
      setStreamStatus,
      startStreaming,
      stopStreaming,
      setCanProcessQueue,
      abortControllerRef,
      updateChainInProgress,
      addActiveSubagent,
      removeActiveSubagent,
      onBeforeMessageSend,
      mainAgentTimer,
      scrollToLatest,
      availableWidth,
      setHasReceivedPlanResponse,
      lastMessageMode,
      setLastMessageMode,
      addSessionCredits,
      resumeQueue,
      clearPendingRetryForMessage,
      schedulePendingRetry,
      isConnectedRef,
      markAiMessageInterrupted,
      markUserMessageFailed,
    ],
  )

  // Process connection failures and schedule them for retry (batched to avoid state cascades)
  const processFailedMessages = useCallback(() => {
    const failedMessages = Object.entries(
      failedDueToConnectionRef.current,
    )

    if (failedMessages.length === 0) {
      return
    }

    // Schedule all failed messages for retry in one batch
    for (const [messageId, messageInfo] of failedMessages) {
      // Check if already scheduled
      if (messageId in pendingRetriesRef.current) {
        continue
      }

      schedulePendingRetry({
        userMessageId: messageId,
        content: messageInfo.content,
        agentMode: messageInfo.agentMode,
        note: 'Waiting for connection…',
      })
    }

    // Clear the failed messages map
    failedDueToConnectionRef.current = {}
  }, [schedulePendingRetry])

  const retryPendingMessages = useCallback(async () => {
    if (retryInFlightRef.current) {
      return
    }
    retryInFlightRef.current = true
    try {
      if (Object.keys(pendingRetriesRef.current).length === 0) {
        retryBackoffDelayRef.current = RETRY_BACKOFF_BASE_DELAY_MS
        return
      }

      const delayMs = retryBackoffDelayRef.current
      if (delayMs > 0) {
        await waitForDelay(delayMs)
      }

      const pendingEntries = Object.entries(pendingRetriesRef.current)

      if (pendingEntries.length === 0) {
        retryBackoffDelayRef.current = RETRY_BACKOFF_BASE_DELAY_MS
        return
      }

      pendingRetriesRef.current = {}
      setPendingRetryCount(0)

      const dividerMessage: ChatMessage = {
        id: `retry-divider-${Date.now()}`,
        variant: 'ai',
        content: '',
        blocks: [
          {
            type: 'mode-divider',
            mode: 'Retrying...',
          },
        ],
        timestamp: formatTimestamp(),
      }
      applyMessageUpdate((prev) => [...prev, dividerMessage])

      for (const [messageId, payload] of pendingEntries) {
        const attempts = retryAttemptsRef.current[messageId] ?? 0
        if (attempts >= MAX_RETRIES_PER_MESSAGE) {
          logger.warn(
            { messageId, attempts },
            'Max retries reached; skipping message',
          )
          markUserMessageFailed(messageId, 'Maximum retry attempts reached')
          setCanProcessQueue(true)
          if (resumeQueue && !isQueuePausedRef?.current) {
            resumeQueue()
          }
          continue
        }
        retryAttemptsRef.current[messageId] = attempts + 1

        await sendMessage({
          content: payload.content,
          agentMode: payload.agentMode,
          retryOfMessageId: messageId,
        })
      }

      if (Object.keys(pendingRetriesRef.current).length === 0) {
        retryBackoffDelayRef.current = RETRY_BACKOFF_BASE_DELAY_MS
      } else {
        retryBackoffDelayRef.current = Math.min(
          retryBackoffDelayRef.current * 2,
          RETRY_BACKOFF_MAX_DELAY_MS,
        )
      }
    } finally {
      retryInFlightRef.current = false
    }
  }, [
    applyMessageUpdate,
    isQueuePausedRef,
    markUserMessageFailed,
    resumeQueue,
    sendMessage,
    setCanProcessQueue,
  ])


  return {
    sendMessage,
    clearMessages,
    pendingRetryCount,
    retryPendingMessages,
    processFailedMessages,
  }
}
