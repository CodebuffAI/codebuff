import React, { useCallback, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { FeedbackInputMode } from './feedback-input-mode'
import { useChatStore } from '../state/chat-store'
import { useFeedbackStore } from '../state/feedback-store'
import { showClipboardMessage } from '../utils/clipboard'
import { getApiClient } from '../utils/codebuff-api'
import { buildFeedbackPayload, buildMessageContext } from '../utils/feedback-helpers'
import { resolveFeedbackSubmission } from '../utils/feedback-submission'
import { logger } from '../utils/logger'

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
    feedbackFooterMessage,
    isSubmitting,
    errors,
    setFeedbackText,
    setFeedbackCursor,
    setFeedbackCategory,
  } = useFeedbackStore(
    useShallow((state) => ({
      feedbackMode: state.feedbackMode,
      feedbackText: state.feedbackText,
      feedbackCursor: state.feedbackCursor,
      feedbackCategory: state.feedbackCategory,
      feedbackMessageId: state.feedbackMessageId,
      feedbackFooterMessage: state.feedbackFooterMessage,
      isSubmitting: state.isSubmitting,
      errors: state.errors,
      setFeedbackText: state.setFeedbackText,
      setFeedbackCursor: state.setFeedbackCursor,
      setFeedbackCategory: state.setFeedbackCategory,
    })),
  )

  const { messages, agentMode, sessionCreditsUsed } = useChatStore(
    useShallow((state) => ({
      messages: state.messages,
      agentMode: state.agentMode,
      sessionCreditsUsed: state.sessionCreditsUsed,
    })),
  )

  const handleFeedbackSubmit = useCallback(() => {
    const store = useFeedbackStore.getState()
    if (store.isSubmitting) return

    const { clientFeedbackId } = store
    if (!clientFeedbackId) return

    const text = feedbackText.trim()
    if (!text) {
      return
    }

    store.setIsSubmitting(true)

    const { target, recentMessages } = buildMessageContext(messages, feedbackMessageId)
    const payload = buildFeedbackPayload({
      text,
      feedbackCategory,
      feedbackMessageId,
      target,
      recentMessages,
      agentMode,
      sessionCreditsUsed,
      errors,
      clientFeedbackId,
    })

    const submittedMessageId = feedbackMessageId
    const submittedCategory = feedbackCategory
    const submittedClientFeedbackId = clientFeedbackId

    getApiClient()
      .feedback(payload)
      .then((response) => {
        const store = useFeedbackStore.getState()
        const { isCurrentSubmission, shouldSettleSubmission } = resolveFeedbackSubmission(
          store.clientFeedbackId,
          submittedClientFeedbackId,
        )

        if (!response.ok) {
          logger.warn(
            { status: response.status, error: response.error },
            'Feedback API returned error',
          )
          if (!shouldSettleSubmission) return
          store.setIsSubmitting(false)
          showClipboardMessage('Feedback failed to send', { durationMs: 5000 })
          return
        }

        if (submittedMessageId) {
          store.markMessageFeedbackSubmitted(submittedMessageId, submittedCategory)
        }

        if (isCurrentSubmission) {
          store.resetFeedbackForm()
          store.closeFeedback()
          store.setIsSubmitting(false)
          if (onExitFeedback) onExitFeedback()
        } else if (shouldSettleSubmission) {
          store.setIsSubmitting(false)
        }

        if (shouldSettleSubmission) {
          showClipboardMessage('Feedback sent!', { durationMs: 5000 })
        }
      })
      .catch((error: unknown) => {
        logger.warn({ error }, 'Failed to submit feedback to API')
        const store = useFeedbackStore.getState()
        if (!resolveFeedbackSubmission(store.clientFeedbackId, submittedClientFeedbackId).shouldSettleSubmission) {
          return
        }
        store.setIsSubmitting(false)
        showClipboardMessage('Feedback failed to send', { durationMs: 5000 })
      })
  }, [
    feedbackText,
    feedbackMessageId,
    feedbackCategory,
    errors,
    messages,
    agentMode,
    sessionCreditsUsed,
    onExitFeedback,
  ])

  const handleFeedbackCancel = useCallback(() => {
    useFeedbackStore.getState().closeFeedback()
    if (onExitFeedback) {
      onExitFeedback()
    }
  }, [onExitFeedback])

  useEffect(() => {
    if (feedbackMode && inputRef.current) {
      inputRef.current.focus()
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
      feedbackCategory={feedbackCategory}
      onCategoryChange={setFeedbackCategory}
      inputRef={inputRef}
      width={width}
      footerMessage={feedbackFooterMessage}
      isSubmitting={isSubmitting}
    />
  )
}
