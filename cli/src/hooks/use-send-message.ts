import {
  MAX_RETRIES_PER_MESSAGE,
  RETRY_BACKOFF_BASE_DELAY_MS,
  RETRY_BACKOFF_MAX_DELAY_MS,
  isPaymentRequiredError,
  ErrorCodes,
} from '@codebuff/sdk'
import { useQueryClient } from '@tanstack/react-query'
import { has } from 'lodash'
import { useCallback, useEffect, useRef } from 'react'

import { usageQueryKeys } from '../hooks/use-usage-query'
import { setCurrentChatId } from '../project-files'
import { useChatStore } from '../state/chat-store'
import { getCodebuffClient, formatToolOutput } from '../utils/codebuff-client'
import { shouldHideAgent } from '../utils/constants'

import { getErrorObject } from '../utils/error'
import { formatElapsedTime } from '../utils/format-elapsed-time'
import { loadAgentDefinitions } from '../utils/load-agent-definitions'

import { logger } from '../utils/logger'
import { extractImagePaths, processImageFile } from '../utils/image-handler'
import {
  buildBashHistoryMessages,
  createRunTerminalToolResult,
  formatBashContextForPrompt,
} from '../utils/bash-messages'
import { getUserMessage } from '../utils/message-history'
import { getProjectRoot } from '../project-files'
import path from 'path'
import { NETWORK_ERROR_ID } from '../utils/validation-error-helpers'
import {
  loadMostRecentChatState,
  saveChatState,
} from '../utils/run-state-storage'
import {
  updateBlocksRecursively,
  scrubPlanTagsInBlocks,
  autoCollapsePreviousMessages,
  createAgentBlock,
  getAgentBaseName,
  createSpawnAgentBlocks,
  isHiddenToolName,
  addInterruptionNotice,
  appendStreamChunkToBlocks,
  extractPlanFromBuffer,
  updateAgentBlockContent,
  transformAskUserBlock,
  updateToolBlockWithOutput,
  isSpawnAgentsResult,
  extractSpawnAgentResultContent,
  markMessageComplete,
  setMessageError,
  createModeDividerMessage,
  createAiMessageShell,
  generateAiMessageId,
  createErrorMessage,
} from '../utils/send-message-helpers'

import type { ElapsedTimeTracker } from './use-elapsed-time'
import type { StreamStatus } from './use-message-queue'
import type { ChatMessage, ContentBlock, ToolContentBlock } from '../types/chat'
import type { SendMessageFn } from '../types/contracts/send-message'
import type { ParamsOf } from '../types/function-params'
import type { AgentMode } from '../utils/constants'
import type {
  AgentDefinition,
  RunState,
  ToolName,
  MessageContent,
} from '@codebuff/sdk'
import type { SetStateAction } from 'react'

const yieldToEventLoop = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

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
  continueChat,
  continueChatId,
}: UseSendMessageOptions): {
  sendMessage: SendMessageFn
  clearMessages: () => void
} => {
  const queryClient = useQueryClient()
  const setIsRetrying = useChatStore.getState().setIsRetrying
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

  useEffect(() => {
    return () => {
      setIsRetrying(false)
    }
  }, [setIsRetrying])

  const spawnAgentsMapRef = useRef<
    Map<string, { index: number; agentType: string }>
  >(new Map())
  const rootStreamBufferRef = useRef('')
  const agentStreamAccumulatorsRef = useRef<Map<string, string>>(new Map())
  const rootStreamSeenRef = useRef(false)
  const planExtractedRef = useRef(false)
  const wasAbortedByUserRef = useRef(false)

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

  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current)
        flushTimeoutRef.current = null
      }
      flushPendingUpdates()
    }
  }, [flushPendingUpdates])

  const sendMessage = useCallback<SendMessageFn>(
    async (params: ParamsOf<SendMessageFn>) => {
      const {
        content,
        agentMode,
        postUserMessage,
        images: attachedImages,
      } = params

      if (agentMode !== 'PLAN') {
        setHasReceivedPlanResponse(false)
      }

      // Include any pending bash messages in the UI before sending
      // and prepare context for the LLM
      const { pendingBashMessages, clearPendingBashMessages } =
        useChatStore.getState()

      // Format bash context to add to message history for the LLM
      const bashContext = formatBashContextForPrompt(pendingBashMessages)

      if (pendingBashMessages.length > 0) {
        // Convert pending bash messages to chat messages and add to history (UI only)
        // Skip messages that were already added to history (non-ghost mode)
        const bashMessagesToAdd = pendingBashMessages.filter(
          (bash) => !bash.addedToHistory,
        )
        if (bashMessagesToAdd.length > 0) {
          applyMessageUpdate((prev) => {
            const bashMessages: ChatMessage[] = []

            for (const bash of bashMessagesToAdd) {
              const toolCallId = crypto.randomUUID()
              const cwd = bash.cwd || process.cwd()
              const toolResultOutput = createRunTerminalToolResult({
                command: bash.command,
                cwd,
                stdout: bash.stdout || null,
                stderr: bash.stderr || null,
                exitCode: bash.exitCode,
              })
              const outputJson = JSON.stringify(toolResultOutput)
              const { assistantMessage } = buildBashHistoryMessages({
                command: bash.command,
                cwd,
                toolCallId,
                output: outputJson,
                isComplete: true,
              })

              bashMessages.push(assistantMessage)
            }
            return [...prev, ...bashMessages]
          })
        }
        clearPendingBashMessages()
      }

      const timerController = createSendMessageTimerController({
        mainAgentTimer,
        onTimerEvent,
        agentId,
      })
      setIsRetrying(false)

      // Check if mode changed and insert divider if needed
      // Also show divider on first message (when lastMessageMode is null)
      const shouldInsertDivider =
        lastMessageMode === null || lastMessageMode !== agentMode

      // --- Process images before sending ---
      // Get pending images from store OR use explicitly attached images (e.g. from queue)
      // If attachedImages is provided, we use those to prevent picking up new pending images
      const pendingImages =
        attachedImages ?? useChatStore.getState().pendingImages

      // Also extract image paths from the input text
      const detectedImagePaths = extractImagePaths(content)

      // Combine pending images with detected paths (avoid duplicates)
      const allImagePaths = [
        ...pendingImages.map((img) => img.path),
        ...detectedImagePaths,
      ]
      const uniqueImagePaths = [...new Set(allImagePaths)]

      // Build attachments from pending images first (for UI display)
      // These show in the user message regardless of processing success
      const attachments = pendingImages.map((img) => ({
        path: img.path,
        filename: img.filename,
      }))

      // Clear pending images immediately after capturing them
      // Only clear if we pulled from the store (attachedImages was undefined)
      // If attachedImages was provided (e.g. from queue), the store was likely cleared when queued
      if (!attachedImages && pendingImages.length > 0) {
        useChatStore.getState().clearPendingImages()
      }

      // Process all images for SDK
      const projectRoot = getProjectRoot()
      const validImageParts: Array<{
        type: 'image'
        image: string
        mediaType: string
        filename: string | undefined
        size: number | undefined
        path: string
      }> = []
      const imageWarnings: string[] = []

      for (const imagePath of uniqueImagePaths) {
        const result = await processImageFile(imagePath, projectRoot)
        if (result.success && result.imagePart) {
          validImageParts.push({
            type: 'image',
            image: result.imagePart.image,
            mediaType: result.imagePart.mediaType,
            filename: result.imagePart.filename,
            size: result.imagePart.size,
            path: imagePath,
          })
          if (result.wasCompressed) {
            imageWarnings.push(
              `📦 ${result.imagePart.filename || imagePath}: compressed`,
            )
          }
        } else if (!result.success) {
          logger.warn(
            { imagePath, error: result.error },
            'Failed to process image for SDK',
          )
          // Add user-visible warning for rejected images
          const filename = path.basename(imagePath)
          imageWarnings.push(`⚠️ ${filename}: ${result.error}`)
        }
      }

      // Build message content array for SDK (images only - text comes from prompt parameter
      // which includes bash context and fallback text for image-only messages)
      let messageContent: MessageContent[] | undefined
      if (validImageParts.length > 0) {
        messageContent = validImageParts.map((img) => ({
          type: 'image' as const,
          image: img.image,
          mediaType: img.mediaType,
        }))

        logger.info(
          {
            imageCount: validImageParts.length,
            totalSize: validImageParts.reduce(
              (sum, part) => sum + (part.size || 0),
              0,
            ),
            messageContentLength: messageContent?.length,
          },
          `📎 ${validImageParts.length} image(s) attached to SDK message`,
        )
      }

      // Create user message and capture its ID for later updates
      const userMessage = getUserMessage(content, attachments)
      const userMessageId = userMessage.id

      // Add attachments to user message
      if (attachments.length > 0) {
        userMessage.attachments = attachments
      }

      applyMessageUpdate((prev) => {
        let newMessages = [...prev]

        // Insert mode divider if mode changed
        if (shouldInsertDivider) {
          newMessages.push(createModeDividerMessage(agentMode))
        }

        // Add user message to UI first
        newMessages.push(userMessage)

        if (postUserMessage) {
          newMessages = postUserMessage(newMessages)
        }
        if (newMessages.length > 100) {
          return newMessages.slice(-100)
        }
        return newMessages
      })

      // Update last message mode
      setLastMessageMode(agentMode)

      await yieldToEventLoop()

      // Scroll to bottom after user message appears
      setTimeout(() => scrollToLatest(), 0)

      // Validate agents before sending message (blocking)
      try {
        const validationResult = await onBeforeMessageSend()

        if (!validationResult.success) {
          // If validation failed with no specific errors, create a network error
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

          // Attach validation errors to the user message using explicit ID
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === userMessageId
                ? {
                    ...msg,
                    validationErrors: errorsToAttach,
                  }
                : msg,
            ),
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
          createErrorMessage(
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

      // Auto-collapse previous message toggles to minimize clutter.
      // Respects user intent by keeping toggles open that the user manually expanded.
      applyMessageUpdate((prev) =>
        autoCollapsePreviousMessages(prev, aiMessageId),
      )

      rootStreamBufferRef.current = ''
      rootStreamSeenRef.current = false
      planExtractedRef.current = false
      agentStreamAccumulatorsRef.current = new Map<string, string>()
      wasAbortedByUserRef.current = false
      timerController.start(aiMessageId)

      const updateAgentContent = (
        targetAgentId: string,
        update:
          | { type: 'text'; content: string; replace?: boolean }
          | Extract<ContentBlock, { type: 'tool' }>,
      ) => {
        queueMessageUpdate((prev) =>
          prev.map((msg) => {
            if (msg.id === aiMessageId && msg.blocks) {
              const newBlocks = updateBlocksRecursively(
                msg.blocks,
                targetAgentId,
                (block) => {
                  if (block.type !== 'agent') return block
                  return updateAgentBlockContent(block, update)
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
        if (!delta.text) return

        queueMessageUpdate((prev) =>
          prev.map((msg) => {
            if (msg.id !== aiMessageId) return msg
            const blocks = msg.blocks ? [...msg.blocks] : []
            return { ...msg, blocks: appendStreamChunkToBlocks(blocks, delta) }
          }),
        )

        // Detect and extract <PLAN>...</PLAN> once available
        if (
          agentMode === 'PLAN' &&
          delta.type === 'text' &&
          !planExtractedRef.current
        ) {
          const rawPlan = extractPlanFromBuffer(rootStreamBufferRef.current)
          if (rawPlan) {
            planExtractedRef.current = true
            setHasReceivedPlanResponse(true)

            applyMessageUpdate((prev) =>
              prev.map((msg) => {
                if (msg.id !== aiMessageId) return msg
                const cleanedBlocks = scrubPlanTagsInBlocks(msg.blocks || [])
                return {
                  ...msg,
                  blocks: [
                    ...cleanedBlocks,
                    { type: 'plan' as const, content: rawPlan },
                  ],
                }
              }),
            )
          }
        }
      }

      setStreamStatus('waiting')
      applyMessageUpdate((prev) => [...prev, aiMessage])
      setCanProcessQueue(false)
      updateChainInProgress(true)
      let hasReceivedContent = false
      let actualCredits: number | undefined = undefined

      const abortController = new AbortController()
      abortControllerRef.current = abortController
      abortController.signal.addEventListener('abort', () => {
        wasAbortedByUserRef.current = true
        setStreamStatus('idle')
        setCanProcessQueue(!isQueuePausedRef?.current)
        updateChainInProgress(false)
        setIsRetrying(false)
        timerController.stop('aborted')

        applyMessageUpdate((prev) =>
          prev.map((msg) => {
            if (msg.id !== aiMessageId) {
              return msg
            }

            const blocks: ContentBlock[] = msg.blocks ? [...msg.blocks] : []
            return {
              ...msg,
              blocks: addInterruptionNotice(blocks),
              isComplete: true,
            }
          }),
        )
      })

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

        // Note: Image processing is done earlier in sendMessage, messageContent is already built

        let runState: RunState
        try {
          // If there's bash context, always prepend it to the user's prompt
          // This ensures consistent behavior whether or not there's a previous run
          const promptWithBashContext = bashContext
            ? bashContext + content
            : content
          const hasNonWhitespacePromptWithContext =
            (promptWithBashContext ?? '').trim().length > 0

          // Use a default prompt when only images are attached (no text content)
          const effectivePrompt =
            (hasNonWhitespacePromptWithContext ? promptWithBashContext : '') ||
            (messageContent ? 'See attached image(s)' : '')

          runState = await client.run({
            logger,
            agent: selectedAgentDefinition ?? agentId ?? fallbackAgent,
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
                  '🔄 SDK retrying after error',
                )
                setIsRetrying(true)
                setStreamStatus('waiting')
              },
              onRetryExhausted: async ({ totalAttempts, errorCode }) => {
                logger.warn(
                  { totalAttempts, errorCode },
                  '❌ SDK exhausted all retries',
                )
              },
            },
            agentDefinitions: agentDefinitions,
            maxAgentSteps: 40,

            handleStreamChunk: (event) => {
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
                  setIsRetrying(false) // Clear retry state once we start receiving content
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
                  agentStreamAccumulatorsRef.current.get(agentId) ?? ''
                if (!chunk) {
                  return
                }
                agentStreamAccumulatorsRef.current.set(
                  agentId,
                  previous + chunk,
                )

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
                    agentStreamAccumulatorsRef.current.get(event.agentId) ?? ''
                  if (!text) {
                    return
                  }
                  agentStreamAccumulatorsRef.current.set(
                    event.agentId,
                    previous + text,
                  )

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
                  ] of spawnAgentsMapRef.current.entries()) {
                    const eventType = event.agentType || ''
                    const storedType = info.agentType || ''

                    // Extract base names without version or scope
                    const eventBaseName = getAgentBaseName(eventType)
                    const storedBaseName = getAgentBaseName(storedType)

                    // Match if base names are the same
                    const isMatch = eventBaseName === storedBaseName
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
                                    ...(event.params && {
                                      params: event.params,
                                    }),
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
                                (block) => ({
                                  ...block,
                                  agentId: event.agentId,
                                }),
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

                      spawnAgentsMapRef.current.delete(tempId)
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
                        const newAgentBlock: ContentBlock = createAgentBlock({
                          agentId: event.agentId,
                          agentType: event.agentType || 'unknown',
                          prompt: event.prompt,
                          params: event.params,
                        })

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

                    setStreamingAgents((prev) =>
                      new Set(prev).add(event.agentId),
                    )
                  }
                }
              } else if (event.type === 'subagent_finish') {
                if (event.agentId) {
                  if (shouldHideAgent(event.agentType)) {
                    return
                  }
                  agentStreamAccumulatorsRef.current.delete(event.agentId)
                  removeActiveSubagent(event.agentId)

                  applyMessageUpdate((prev) =>
                    prev.map((msg) => {
                      if (msg.id === aiMessageId && msg.blocks) {
                        // Use recursive update to handle nested agents
                        const blocks = updateBlocksRecursively(
                          msg.blocks,
                          event.agentId,
                          (block) => ({
                            ...block,
                            status: 'complete' as const,
                          }),
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
                const {
                  toolCallId,
                  toolName,
                  input,
                  agentId,
                  includeToolCall,
                  parentAgentId,
                } = event

                if (toolName === 'spawn_agents' && input?.agents) {
                  const agents = Array.isArray(input.agents) ? input.agents : []

                  agents.forEach((agent: any, index: number) => {
                    const tempAgentId = `${toolCallId}-${index}`
                    spawnAgentsMapRef.current.set(tempAgentId, {
                      index,
                      agentType: agent.agent_type || 'unknown',
                    })
                  })

                  applyMessageUpdate((prev) =>
                    prev.map((msg) => {
                      if (msg.id !== aiMessageId) {
                        return msg
                      }

                      const existingBlocks: ContentBlock[] = msg.blocks
                        ? [...msg.blocks]
                        : []

                      const newAgentBlocks = createSpawnAgentBlocks(
                        toolCallId,
                        agents,
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

                if (isHiddenToolName(toolName)) {
                  return
                }

                // If this tool call belongs to a subagent, add it to that agent's blocks
                if (parentAgentId && agentId) {
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
                        ...(includeToolCall !== undefined && {
                          includeToolCall,
                        }),
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

                // Handle ask_user result transformation
                const resultValue = (event.output?.[0] as any)?.value
                if (resultValue) {
                  applyMessageUpdate((prev) =>
                    prev.map((msg) => {
                      if (msg.id !== aiMessageId || !msg.blocks) return msg
                      const newBlocks = transformAskUserBlock(
                        msg.blocks,
                        toolCallId,
                        resultValue,
                      )
                      return newBlocks !== msg.blocks
                        ? { ...msg, blocks: newBlocks }
                        : msg
                    }),
                  )
                }

                // Check if this is a spawn_agents result
                const firstOutputValue = has(event.output?.[0], 'value')
                  ? event.output?.[0]?.value
                  : undefined

                if (isSpawnAgentsResult(firstOutputValue)) {
                  const outputArray = firstOutputValue as Array<{
                    value?: unknown
                  }>
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
                            const result = outputArray[agentIndex]
                            if (result) {
                              const { content, hasError } =
                                extractSpawnAgentResultContent(
                                  result,
                                  formatToolOutput,
                                )
                              if (content) {
                                return {
                                  ...block,
                                  blocks: [{ type: 'text' as const, content }],
                                  status: hasError
                                    ? ('failed' as const)
                                    : ('complete' as const),
                                }
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

                  outputArray.forEach((_: unknown, index: number) => {
                    const agentId = `${toolCallId}-${index}`
                    setStreamingAgents((prev) => {
                      const next = new Set(prev)
                      next.delete(agentId)
                      return next
                    })
                  })
                  return
                }

                // Format tool output
                let output: string
                const parsed = (event.output?.[0] as any)?.value
                if (
                  parsed?.stdout !== undefined ||
                  parsed?.stderr !== undefined
                ) {
                  output = (parsed.stdout || '') + (parsed.stderr || '')
                } else {
                  output = formatToolOutput(event.output)
                }

                applyMessageUpdate((prev) =>
                  prev.map((msg) => {
                    if (msg.id === aiMessageId && msg.blocks) {
                      const newBlocks = updateToolBlockWithOutput(
                        msg.blocks,
                        toolCallId,
                        output,
                      )
                      return newBlocks !== msg.blocks
                        ? { ...msg, blocks: newBlocks }
                        : msg
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
        } catch (error) {
          // SDK threw an error (abort or unexpected failure)
          logger.error({ error: getErrorObject(error) }, 'SDK run threw error')
          throw error
        }

        previousRunStateRef.current = runState
        setRunState(runState)
        setIsRetrying(false)

        // Save both runState and current messages
        applyMessageUpdate((currentMessages) => {
          saveChatState(runState, currentMessages)
          return currentMessages
        })

        if (!runState.output || runState.output.type === 'error') {
          const errorOutput =
            runState.output?.type === 'error' ? runState.output : null
          const errorMessage =
            errorOutput?.message ?? 'No output from agent run'

          // Check if this was a user-initiated cancellation - if so, don't show error since
          // the abort handler already shows [response interrupted]
          if (wasAbortedByUserRef.current) {
            logger.info(
              { errorMessage },
              'Run cancelled by user, not showing error',
            )
            return
          }

          logger.warn(
            { errorMessage, errorCode: errorOutput?.errorCode },
            'Agent run failed',
          )

          // Check if this is an out-of-credits error using the error code
          const isOutOfCredits =
            errorOutput?.errorCode === ErrorCodes.PAYMENT_REQUIRED

          if (isOutOfCredits) {
            const appUrl =
              process.env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'https://codebuff.com'
            const paymentErrorMessage =
              errorOutput?.message ??
              `Out of credits. Please add credits at ${appUrl}/usage`
            applyMessageUpdate((prev) =>
              prev.map((msg) => {
                if (msg.id !== aiMessageId) return msg
                return setMessageError(msg, paymentErrorMessage)
              }),
            )
            // Show the usage banner so user can see their balance and renewal date
            useChatStore.getState().setInputMode('usage')
            // Refresh usage data to show current state
            queryClient.invalidateQueries({
              queryKey: usageQueryKeys.current(),
            })
          } else {
            // Generic error - display the error message directly from SDK
            applyMessageUpdate((prev) =>
              prev.map((msg) => {
                if (msg.id !== aiMessageId) return msg
                return setMessageError(msg, `**Error:** ${errorMessage}`)
              }),
            )
          }

          setStreamStatus('idle')
          setCanProcessQueue(true)
          updateChainInProgress(false)
          timerController.stop('error')
          return
        }

        // Always refresh usage data after response completes
        // This ensures the UsageBanner's credit warning logic has fresh data
        // Use invalidateQueries to trigger refetch for any active observers
        queryClient.invalidateQueries({ queryKey: usageQueryKeys.current() })

        setStreamStatus('idle')
        if (resumeQueue) {
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
          elapsedSeconds > 0 ? formatElapsedTime(elapsedSeconds) : undefined

        applyMessageUpdate((prev) =>
          prev.map((msg) => {
            if (msg.id !== aiMessageId) return msg
            return markMessageComplete(msg, {
              completionTime,
              credits: actualCredits,
              runState,
            })
          }),
        )
      } catch (error) {
        logger.error(
          { error: getErrorObject(error) },
          'SDK client.run() failed',
        )
        setIsRetrying(false)
        setStreamStatus('idle')
        setCanProcessQueue(true)
        updateChainInProgress(false)
        timerController.stop('error')

        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred'

        // Handle payment required (out of credits) specially
        if (isPaymentRequiredError(error)) {
          const appUrl =
            process.env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'https://codebuff.com'
          const paymentErrorMessage =
            error instanceof Error && error.message
              ? error.message
              : `Out of credits. Please add credits at ${appUrl}/usage`

          applyMessageUpdate((prev) =>
            prev.map((msg) => {
              if (msg.id !== aiMessageId) return msg
              return setMessageError(msg, paymentErrorMessage)
            }),
          )
          // Show the usage banner so user can see their balance and renewal date
          useChatStore.getState().setInputMode('usage')
          // Refresh usage data to show current state
          queryClient.invalidateQueries({ queryKey: usageQueryKeys.current() })
          return
        }

        applyMessageUpdate((prev) =>
          prev.map((msg) => {
            if (msg.id !== aiMessageId) return msg
            return {
              ...msg,
              content: msg.content + `\n\n**Error:** ${errorMessage}`,
              isComplete: true,
            }
          }),
        )
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
      setIsRetrying,
    ],
  )

  return {
    sendMessage,
    clearMessages,
  }
}
