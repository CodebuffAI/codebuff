import { getProjectRoot } from '../../project-files'
import { useChatStore } from '../../state/chat-store'
import { processBashContext } from '../../utils/bash-context-processor'
import { getErrorObject } from '../../utils/error'
import {
  createErrorMessage,
  createPaymentErrorMessage,
  isOutOfCreditsError,
  isPaymentRequiredError,
} from '../../utils/error-handling'
import { formatElapsedTime } from '../../utils/format-elapsed-time'
import { processImagesForMessage } from '../../utils/image-processor'
import { logger } from '../../utils/logger'
import { appendInterruptionNotice } from '../../utils/message-block-helpers'
import { getUserMessage } from '../../utils/message-history'
import { createMessageUpdater } from '../../utils/message-updater'
import { createModeDividerMessage } from '../../utils/send-message-helpers'
import { usageQueryKeys } from '../use-usage-query'

import type { PendingImage } from '../../state/chat-store'
import type { ChatMessage } from '../../types/chat'
import type { AgentMode } from '../../utils/constants'
import type { MessageUpdater } from '../../utils/message-updater'
import type { SendMessageTimerController } from '../../utils/send-message-timer'
import type { StreamController } from '../stream-state'
import type { StreamStatus } from '../use-message-queue'
import type { MessageContent, RunState } from '@codebuff/sdk'
import type { QueryClient } from '@tanstack/react-query'
import type { MutableRefObject, SetStateAction } from 'react'

const yieldToEventLoop = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

export type PrepareUserMessageDeps = {
  applyMessageUpdate: (update: SetStateAction<ChatMessage[]>) => void
  lastMessageMode: AgentMode | null
  setLastMessageMode: (mode: AgentMode | null) => void
  scrollToLatest: () => void
  setHasReceivedPlanResponse: (value: boolean) => void
}

export const prepareUserMessage = async (params: {
  content: string
  agentMode: AgentMode
  postUserMessage?: (prev: ChatMessage[]) => ChatMessage[]
  attachedImages?: PendingImage[]
  deps: PrepareUserMessageDeps
}): Promise<{
  userMessageId: string
  messageContent: MessageContent[] | undefined
  bashContextForPrompt: string
}> => {
  const { content, agentMode, postUserMessage, attachedImages, deps } = params
  const {
    applyMessageUpdate,
    lastMessageMode,
    setLastMessageMode,
    scrollToLatest,
  } = deps

  const { pendingBashMessages, clearPendingBashMessages } =
    useChatStore.getState()
  const { bashMessages, bashContextForPrompt } =
    processBashContext(pendingBashMessages)

  if (bashMessages.length > 0) {
    applyMessageUpdate((prev) => [...prev, ...bashMessages])
  }
  clearPendingBashMessages()

  const pendingImages = attachedImages ?? useChatStore.getState().pendingImages
  if (!attachedImages && pendingImages.length > 0) {
    useChatStore.getState().clearPendingImages()
  }

  const { attachments, messageContent } = await processImagesForMessage({
    content,
    pendingImages,
    projectRoot: getProjectRoot(),
  })

  const shouldInsertDivider =
    lastMessageMode === null || lastMessageMode !== agentMode

  const userMessage = getUserMessage(content, attachments)
  const userMessageId = userMessage.id
  if (attachments.length > 0) {
    userMessage.attachments = attachments
  }

  applyMessageUpdate((prev) => {
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
  }
}

export const setupStreamingContext = (params: {
  aiMessageId: string
  timerController: SendMessageTimerController
  queueMessageUpdate: (
    updater: (messages: ChatMessage[]) => ChatMessage[],
  ) => void
  flushPendingUpdates: () => void
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
    queueMessageUpdate,
    flushPendingUpdates,
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
  const updater = createMessageUpdater(
    aiMessageId,
    queueMessageUpdate,
    flushPendingUpdates,
  )
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
  updater: MessageUpdater
  aiMessageId: string
  streamRefs: StreamController
  setStreamStatus: (status: StreamStatus) => void
  setCanProcessQueue: (can: boolean) => void
  updateChainInProgress: (value: boolean) => void
  setHasReceivedPlanResponse: (value: boolean) => void
  resumeQueue?: () => void
  queryClient: QueryClient
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
    queryClient,
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
      const { message, showUsageBanner } = createPaymentErrorMessage(output)
      updater.setError(message)

      if (showUsageBanner) {
        useChatStore.getState().setInputMode('usage')
        queryClient.invalidateQueries({
          queryKey: usageQueryKeys.current(),
        })
      }
    } else {
      const partial = createErrorMessage(
        output.message ?? 'No output from agent run',
        aiMessageId,
      )
      updater.setError(partial.content ?? '')
    }

    finalizeAfterError()
    return
  }

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
  updater: MessageUpdater
  setIsRetrying: (value: boolean) => void
  setStreamStatus: (status: StreamStatus) => void
  setCanProcessQueue: (can: boolean) => void
  updateChainInProgress: (value: boolean) => void
  queryClient: QueryClient
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
    queryClient,
  } = params

  const partial = createErrorMessage(error, aiMessageId)

  logger.error({ error: getErrorObject(error) }, 'SDK client.run() failed')
  setIsRetrying(false)
  setStreamStatus('idle')
  setCanProcessQueue(true)
  updateChainInProgress(false)
  timerController.stop('error')

  if (isPaymentRequiredError(error)) {
    const { message } = createPaymentErrorMessage(error)

    updater.setError(message)
    useChatStore.getState().setInputMode('usage')
    queryClient.invalidateQueries({ queryKey: usageQueryKeys.current() })
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
