import React, { useCallback, useEffect, useRef } from 'react'
import { useFeedbackStore } from '../state/feedback-store'
import { FeedbackInputMode } from './feedback-input-mode'
import { useChatStore } from '../state/chat-store'
import { logger } from '../utils/logger'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { showClipboardMessage } from '../utils/clipboard'
import type { ChatMessage } from '../types/chat'

interface FeedbackContainerProps {
  inputRef: React.MutableRefObject<any>
  onExitFeedback?: () => void
  width: number
}

export const FeedbackContainer: React.FC<FeedbackContainerProps> = ({
  inputRef,
  onExitFeedback,
  width,
}) => {
  const feedbackMode = useFeedbackStore((state) => state.feedbackMode)
  const feedbackText = useFeedbackStore((state) => state.feedbackText)
  const feedbackCursor = useFeedbackStore((state) => state.feedbackCursor)
  const feedbackCategory = useFeedbackStore((state) => state.feedbackCategory)
  const feedbackMessageId = useFeedbackStore(
    (state) => state.feedbackMessageId,
  )
  const setFeedbackText = useFeedbackStore((state) => state.setFeedbackText)
  const setFeedbackCursor = useFeedbackStore((state) => state.setFeedbackCursor)
  const setFeedbackCategory = useFeedbackStore(
    (state) => state.setFeedbackCategory,
  )
  const closeFeedback = useFeedbackStore((state) => state.closeFeedback)
  const resetFeedbackForm = useFeedbackStore(
    (state) => state.resetFeedbackForm,
  )
  const markMessageFeedbackSubmitted = useFeedbackStore(
    (state) => state.markMessageFeedbackSubmitted,
  )
  const restoreSavedInput = useFeedbackStore((state) => state.restoreSavedInput)

  const messages = useChatStore((state) => state.messages)
  const agentMode = useChatStore((state) => state.agentMode)
  const sessionCreditsUsed = useChatStore((state) => state.sessionCreditsUsed)
  const runState = useChatStore((state) => state.runState)

  const previousFeedbackModeRef = useRef(feedbackMode)

  const handleFeedbackSubmit = useCallback(() => {
    const text = feedbackText.trim()
    if (!text) {
      return
    }

    const target = feedbackMessageId
      ? messages.find((m: ChatMessage) => m.id === feedbackMessageId)
      : null

    const targetIndex = target ? messages.indexOf(target) : messages.length - 1
    const startIndex = Math.max(0, targetIndex - 9)
    const recent = messages
      .slice(startIndex, targetIndex + 1)
      .map((m: ChatMessage) => ({
        type: m.variant,
        id: m.id,
        ...(m.completionTime && { completionTime: m.completionTime }),
        ...(m.credits && { credits: m.credits }),
      }))

    logger.info({
      eventId: AnalyticsEvent.FEEDBACK_SUBMITTED,
      source: 'cli',
      messageId: target?.id || null,
      variant: target?.variant || null,
      completionTime: target?.completionTime || null,
      credits: target?.credits || null,
      agentMode,
      sessionCreditsUsed,
      recentMessages: recent,
      feedback: {
        text,
        category: feedbackCategory,
        type: feedbackMessageId ? 'message' : 'general',
      },
      runState,
    })

    if (feedbackMessageId) {
      markMessageFeedbackSubmitted(feedbackMessageId, feedbackCategory)
    }

    resetFeedbackForm()
    closeFeedback()
    showClipboardMessage('Feedback sent ✔', { durationMs: 5000 })

    if (onExitFeedback) {
      onExitFeedback()
    }
  }, [
    feedbackText,
    feedbackMessageId,
    feedbackCategory,
    messages,
    agentMode,
    sessionCreditsUsed,
    runState,
    markMessageFeedbackSubmitted,
    resetFeedbackForm,
    closeFeedback,
    onExitFeedback,
  ])

  const handleFeedbackCancel = useCallback(() => {
    closeFeedback()
    if (onExitFeedback) {
      onExitFeedback()
    }
  }, [closeFeedback, onExitFeedback])

  const handleFeedbackClear = useCallback(() => {
    setFeedbackText('')
    setFeedbackCursor(0)
    setFeedbackCategory('other')
  }, [setFeedbackText, setFeedbackCursor, setFeedbackCategory])

  useEffect(() => {
    if (feedbackMode !== previousFeedbackModeRef.current) {
      previousFeedbackModeRef.current = feedbackMode
      if (inputRef.current) {
        inputRef.current.focus()
      }
    }
  }, [feedbackMode, inputRef])

  if (!feedbackMode) {
    return null
  }

  return (
    <FeedbackInputMode
      value={feedbackText}
      cursor={feedbackCursor}
      onChange={setFeedbackText}
      onCursorChange={setFeedbackCursor}
      onSubmit={handleFeedbackSubmit}
      onCancel={handleFeedbackCancel}
      onClear={handleFeedbackClear}
      feedbackCategory={feedbackCategory}
      onCategoryChange={setFeedbackCategory}
      inputRef={inputRef}
      width={width}
    />
  )
}
