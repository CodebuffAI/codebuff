import { getProjectRoot } from '../../project-files'
import { useChatStore } from '../../state/chat-store'
import { processBashContext } from '../../utils/bash-context-processor'
import {
  createErrorMessage,
  isOutOfCreditsError,
  OUT_OF_CREDITS_MESSAGE,
} from '../../utils/error-handling'
import { invalidateActivityQuery } from '../use-activity-query'
import { usageQueryKeys } from '../use-usage-query'
import { formatElapsedTime } from '../../utils/format-elapsed-time'
import { processImagesForMessage } from '../../utils/image-processor'
import { logger } from '../../utils/logger'
import { appendInterruptionNotice } from '../../utils/message-block-helpers'
import { getUserMessage } from '../../utils/message-history'
import {
  createBatchedMessageUpdater,
  type BatchedMessageUpdater,
} from '../../utils/message-updater'
import { createModeDividerMessage } from '../../utils/send-message-helpers'

import type {
  PendingAttachment,
  PendingImageAttachment,
  PendingTextAttachment,
} from '../../state/chat-store'
import type { ChatMessage } from '../../types/chat'
import type { AgentMode } from '../../utils/constants'

import type { SendMessageTimerController } from '../../utils/send-message-timer'
import type { StreamController } from '../stream-state'
import type { StreamStatus } from '../use-message-queue'
import type { MessageContent, RunState } from '@codebuff/sdk'
import type { MutableRefObject, SetStateAction } from 'react'
import { getErrorObject } from '@codebuff/common/util/error'

const yieldToEventLoop = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

export type PrepareUserMessageDeps = {
  setMessages: (update: SetStateAction<ChatMessage[]>) => void
  lastMessageMode: AgentMode | null
  setLastMessageMode: (mode: AgentMode | null) => void
  scrollToLatest: () => void
  setHasReceivedPlanResponse: (value: boolean) => void
}

export const prepareUserMessage = async (params: {
  content: string
  agentMode: AgentMode
  postUserMessage?: (prev: ChatMessage[]) => ChatMessage[]
  attachments?: PendingAttachment[]
  deps: PrepareUserMessageDeps
}): Promise<{
  userMessageId: string
  messageContent: MessageContent[] | undefined
  bashContextForPrompt: string
  finalContent: string
}> => {
  const { content, agentMode, postUserMessage, attachments, deps } = params
  const { setMessages, lastMessageMode, setLastMessageMode, scrollToLatest } =
    deps

  const { pendingBashMessages, clearPendingBashMessages } =
    useChatStore.getState()
  const { bashMessages, bashContextForPrompt } =
    processBashContext(pendingBashMessages)

  if (bashMessages.length > 0) {
    setMessages((prev) => [...prev, ...bashMessages])
  }
  clearPendingBashMessages()

  // Split attachments by kind
  const allAttachments =
    attachments ?? useChatStore.getState().pendingAttachments
  if (!attachments && allAttachments.length > 0) {
    useChatStore.getState().clearPendingAttachments()
  }

  const pendingImages = allAttachments.filter(
    (a): a is PendingImageAttachment => a.kind === 'image',
  )
  const pendingTextAttachments = allAttachments.filter(
    (a): a is PendingTextAttachment => a.kind === 'text',
  )

  // Append text attachments to the content
  let finalContent = content
  if (pendingTextAttachments.length > 0) {
    const textAttachmentContent = pendingTextAttachments
      .map((att) => `[Pasted Text]\n${att.content}`)
      .join('\n\n')
    finalContent = content
      ? `${content}\n\n${textAttachmentContent}`
      : textAttachmentContent
  }

  const { attachments: imageAttachments, messageContent } = await processImagesForMessage({
    content: finalContent,
    pendingImages,
    projectRoot: getProjectRoot(),
  })

  const shouldInsertDivider =
    lastMessageMode === null || lastMessageMode !== agentMode

  // Convert pending text attachments to stored text attachments for display
  const textAttachmentsForMessage = pendingTextAttachments.map((att) => ({
    id: att.id,
    content: att.content,
    preview: att.preview,
    charCount: att.charCount,
  }))

  // Pass original content (not finalContent) for display, but finalContent goes to agent
  const userMessage = getUserMessage(content, imageAttachments, textAttachmentsForMessage)
  const userMessageId = userMessage.id
  if (imageAttachments.length > 0) {
    userMessage.attachments = imageAttachments
  }

  setMessages((prev) => {
    let next = [...prev]
    if (shouldInsertDivider) {
      next.push(createModeDividerMessage(agentMode))
    }
    next.push(userMessage)
    if (postUserMessage) {
      next = postUserMessage(next)
    }
    if (next.length > 100) {
      return next.slice(-100)
    }
    return next
  })

  setLastMessageMode(agentMode)
  await yieldToEventLoop()
  setTimeout(() => scrollToLatest(), 0)

  return {
    userMessageId,
    messageContent,
    bashContextForPrompt,
    finalContent,
  }
}

export const setupStreamingContext = (params: {
  aiMessageId: string
  timerController: SendMessageTimerController
  setMessages: (updater: (messages: ChatMessage[]) => ChatMessage[]) => void
  streamRefs: StreamController
  abortControllerRef: MutableRefObject<AbortController | null>
  setStreamStatus: (status: StreamStatus) => void
  setCanProcessQueue: (can: boolean) => void
  isQueuePausedRef?: MutableRefObject<boolean>
  updateChainInProgress: (value: boolean) => void
  setIsRetrying: (value: boolean) => void
}) => {
  const {
    aiMessageId,
    timerController,
    setMessages,
    streamRefs,
    abortControllerRef,
    setStreamStatus,
    setCanProcessQueue,
    isQueuePausedRef,
    updateChainInProgress,
    setIsRetrying,
  } = params

  streamRefs.reset()
  timerController.start(aiMessageId)
  const updater = createBatchedMessageUpdater(aiMessageId, setMessages)
  const hasReceivedContentRef = { current: false }
  const abortController = new AbortController()
  abortControllerRef.current = abortController

  abortController.signal.addEventListener('abort', () => {
    // Abort means the user stopped streaming; finalize with an interruption notice.
    streamRefs.setters.setWasAbortedByUser(true)
    setStreamStatus('idle')
    setCanProcessQueue(!isQueuePausedRef?.current)
    updateChainInProgress(false)
    setIsRetrying(false)
    timerController.stop('aborted')

    updater.updateAiMessageBlocks((blocks) => appendInterruptionNotice(blocks))
    updater.markComplete()
  })

  return { updater, hasReceivedContentRef, abortController }
}

export const handleRunCompletion = (params: {
  runState: RunState
  actualCredits: number | undefined
  agentMode: AgentMode
  timerController: SendMessageTimerController
  updater: BatchedMessageUpdater
  aiMessageId: string
  streamRefs: StreamController
  setStreamStatus: (status: StreamStatus) => void
  setCanProcessQueue: (can: boolean) => void
  updateChainInProgress: (value: boolean) => void
  setHasReceivedPlanResponse: (value: boolean) => void
  resumeQueue?: () => void
}) => {
  const {
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
  } = params

  const output = runState.output
  const finalizeAfterError = () => {
    setStreamStatus('idle')
    setCanProcessQueue(true)
    updateChainInProgress(false)
    timerController.stop('error')
  }

  if (!output) {
    if (!streamRefs.state.wasAbortedByUser) {
      updater.setError('No output from agent run')
      finalizeAfterError()
    }
    return
  }

  if (output.type === 'error') {
    if (streamRefs.state.wasAbortedByUser) {
      return
    }

    if (isOutOfCreditsError(output)) {
      updater.setError(OUT_OF_CREDITS_MESSAGE)
      useChatStore.getState().setInputMode('outOfCredits')
      invalidateActivityQuery(usageQueryKeys.current())
      finalizeAfterError()
      return
    }

    const partial = createErrorMessage(
      output.message ?? 'No output from agent run',
      aiMessageId,
    )
    updater.setError(partial.content ?? '')

    finalizeAfterError()
    return
  }

  invalidateActivityQuery(usageQueryKeys.current())

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
  let completionTime: string | undefined
  if (elapsedSeconds > 0) {
    completionTime = formatElapsedTime(elapsedSeconds)
  }

  updater.markComplete({
    ...(completionTime && { completionTime }),
    ...(actualCredits !== undefined && { credits: actualCredits }),
    metadata: {
      runState,
    },
  })
}

export const handleRunError = (params: {
  error: unknown
  aiMessageId: string
  timerController: SendMessageTimerController
  updater: BatchedMessageUpdater
  setIsRetrying: (value: boolean) => void
  setStreamStatus: (status: StreamStatus) => void
  setCanProcessQueue: (can: boolean) => void
  updateChainInProgress: (value: boolean) => void
}) => {
  const {
    error,
    aiMessageId,
    timerController,
    updater,
    setIsRetrying,
    setStreamStatus,
    setCanProcessQueue,
    updateChainInProgress,
  } = params

  const partial = createErrorMessage(error, aiMessageId)

  logger.error(
    { error: getErrorObject(error, { includeRawError: true }) },
    'SDK client.run() failed',
  )
  setIsRetrying(false)
  setStreamStatus('idle')
  setCanProcessQueue(true)
  updateChainInProgress(false)
  timerController.stop('error')

  if (isOutOfCreditsError(error)) {
    updater.setError(OUT_OF_CREDITS_MESSAGE)
    useChatStore.getState().setInputMode('outOfCredits')
    invalidateActivityQuery(usageQueryKeys.current())
    return
  }

  updater.updateAiMessage((msg) => {
    const updatedContent = [msg.content, partial.content]
      .filter(Boolean)
      .join('\n\n')
    return {
      ...msg,
      content: updatedContent,
    }
  })

  updater.markComplete()
}
