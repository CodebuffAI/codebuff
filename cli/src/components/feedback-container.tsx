import React, { useCallback, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

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
  const {
    feedbackMode,
    feedbackText,
    feedbackCursor,
    feedbackCategory,
    feedbackMessageId,
    setFeedbackText,
    setFeedbackCursor,
    setFeedbackCategory,
    closeFeedback,
    resetFeedbackForm,
    markMessageFeedbackSubmitted,
    restoreSavedInput,
  } = useFeedbackStore(
    useShallow((state) => ({
      feedbackMode: state.feedbackMode,
      feedbackText: state.feedbackText,
      feedbackCursor: state.feedbackCursor,
      feedbackCategory: state.feedbackCategory,
      feedbackMessageId: state.feedbackMessageId,
      setFeedbackText: state.setFeedbackText,
      setFeedbackCursor: state.setFeedbackCursor,
      setFeedbackCategory: state.setFeedbackCategory,
      closeFeedback: state.closeFeedback,
      resetFeedbackForm: state.resetFeedbackForm,
      markMessageFeedbackSubmitted: state.markMessageFeedbackSubmitted,
      restoreSavedInput: state.restoreSavedInput,
    })),
  )

  const { messages, agentMode, sessionCreditsUsed, runState } = useChatStore(
    useShallow((state) => ({
      messages: state.messages,
      agentMode: state.agentMode,
      sessionCreditsUsed: state.sessionCreditsUsed,
      runState: state.runState,
    })),
  )

  const previousFeedbackModeRef = useRef(feedbackMode)

  const buildMessageContext = useCallback(
    (targetMessageId: string | null) => {
      const target = targetMessageId
        ? messages.find((m: ChatMessage) => m.id === targetMessageId)
        : null

      const targetIndex = target ? messages.indexOf(target) : messages.length - 1
      const startIndex = Math.max(0, targetIndex - 9)
      const recentMessages = messages
        .slice(startIndex, targetIndex + 1)
        .map((m: ChatMessage) => ({
          type: m.variant,
          id: m.id,
          ...(m.completionTime && { completionTime: m.completionTime }),
          ...(m.credits && { credits: m.credits }),
        }))

      return { target, recentMessages }
    },
    [messages],
  )

  const handleFeedbackSubmit = useCallback(() => {
    const text = feedbackText.trim()
    if (!text) {
      return
    }

    const { target, recentMessages } = buildMessageContext(feedbackMessageId)

    logger.info(
      {
        eventId: AnalyticsEvent.FEEDBACK_SUBMITTED,
        source: 'cli',
        messageId: target?.id || null,
        variant: target?.variant || null,
        completionTime: target?.completionTime || null,
        credits: target?.credits || null,
        agentMode,
        sessionCreditsUsed,
        recentMessages,
        feedback: {
          text,
          category: feedbackCategory,
          type: feedbackMessageId ? 'message' : 'general',
        },
        runState,
      },
      'User submitted feedback',
    )

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
    buildMessageContext,
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
