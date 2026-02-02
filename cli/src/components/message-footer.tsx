import { SUBSCRIPTION_DISPLAY_NAME } from '@codebuff/common/constants/subscription-plans'
import { pluralize } from '@codebuff/common/util/string'
import { TextAttributes } from '@opentui/core'
import React, { useCallback, useMemo } from 'react'

import { CopyButton } from './copy-button'
import { ElapsedTimer } from './elapsed-timer'
import { FeedbackIconButton } from './feedback-icon-button'
import { useSubscriptionQuery } from '../hooks/use-subscription-query'
import { useTheme } from '../hooks/use-theme'
import {
  useFeedbackStore,
  selectIsFeedbackOpenForMessage,
  selectHasSubmittedFeedback,
  selectMessageFeedbackCategory,
} from '../state/feedback-store'

import type { ContentBlock, TextContentBlock } from '../types/chat'

interface MessageFooterProps {
  messageId: string
  blocks?: ContentBlock[]
  content: string
  isLoading: boolean
  isComplete?: boolean
  completionTime?: string
  credits?: number
  timerStartTime: number | null
  onFeedback?: (messageId: string) => void
  onCloseFeedback?: () => void
}

export const MessageFooter: React.FC<MessageFooterProps> = ({
  messageId,
  blocks,
  content,
  isLoading,
  isComplete,
  completionTime,
  credits,
  timerStartTime,
  onFeedback,
  onCloseFeedback,
}) => {
  const theme = useTheme()

  // Memoize selectors to prevent new function references on every render
  const selectIsFeedbackOpenMemo = useMemo(
    () => selectIsFeedbackOpenForMessage(messageId),
    [messageId],
  )
  const selectHasSubmittedFeedbackMemo = useMemo(
    () => selectHasSubmittedFeedback(messageId),
    [messageId],
  )
  const selectMessageFeedbackCategoryMemo = useMemo(
    () => selectMessageFeedbackCategory(messageId),
    [messageId],
  )

  const isFeedbackOpen = useFeedbackStore(selectIsFeedbackOpenMemo)
  const hasSubmittedFeedback = useFeedbackStore(selectHasSubmittedFeedbackMemo)
  const selectedFeedbackCategory = useFeedbackStore(
    selectMessageFeedbackCategoryMemo,
  )

  const shouldShowLoadingTimer = isLoading && !isComplete
  const shouldShowCompletionFooter = isComplete
  const canRequestFeedback = shouldShowCompletionFooter && !hasSubmittedFeedback
  const isGoodOrBadSelection =
    selectedFeedbackCategory === 'good_result' ||
    selectedFeedbackCategory === 'bad_result'
  const shouldShowSubmittedFeedbackState =
    shouldShowCompletionFooter && hasSubmittedFeedback && isGoodOrBadSelection
  const shouldRenderFeedbackButton =
    Boolean(onFeedback) &&
    (canRequestFeedback || shouldShowSubmittedFeedbackState)

  const handleFeedbackOpen = useCallback(() => {
    if (!canRequestFeedback || !onFeedback) return
    onFeedback(messageId)
  }, [canRequestFeedback, onFeedback, messageId])

  const handleFeedbackClose = useCallback(() => {
    if (!canRequestFeedback) return
    onCloseFeedback?.()
  }, [canRequestFeedback, onCloseFeedback])

  // Build text from content and text blocks for copy button
  const textToCopy = [
    content,
    ...(blocks || [])
      .filter((b): b is TextContentBlock => b.type === 'text')
      .map((b) => b.content),
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim()

  // Loading timer
  if (shouldShowLoadingTimer) {
    return (
      <text
        attributes={TextAttributes.DIM}
        style={{
          wrapMode: 'none',
          marginTop: 0,
          marginBottom: 0,
          alignSelf: 'flex-end',
        }}
      >
        <ElapsedTimer
          startTime={timerStartTime}
          attributes={TextAttributes.DIM}
        />
      </text>
    )
  }

  // Completion footer
  if (!shouldShowCompletionFooter) {
    return null
  }

  const footerItems: { key: string; node: React.ReactNode }[] = []

  // Add copy button first if there's content to copy
  if (textToCopy.length > 0) {
    footerItems.push({
      key: 'copy',
      node: (
        <CopyButton
          textToCopy={textToCopy}
          leadingSpace={false}
          style={{ wrapMode: 'none' }}
        />
      ),
    })
  }

  if (completionTime) {
    footerItems.push({
      key: 'time',
      node: (
        <text
          attributes={TextAttributes.DIM}
          style={{
            wrapMode: 'none',
            fg: theme.secondary,
            marginTop: 0,
            marginBottom: 0,
          }}
        >
          {completionTime}
        </text>
      ),
    })
  }
  if (typeof credits === 'number' && credits > 0) {
    footerItems.push({
      key: 'credits',
      node: <CreditsOrSubscriptionIndicator credits={credits} />,
    })
  }
  if (shouldRenderFeedbackButton) {
    footerItems.push({
      key: 'feedback',
      node: (
        <FeedbackIconButton
          onClick={handleFeedbackOpen}
          onClose={handleFeedbackClose}
          isOpen={canRequestFeedback ? isFeedbackOpen : false}
          messageId={messageId}
          selectedCategory={selectedFeedbackCategory}
          hasSubmittedFeedback={hasSubmittedFeedback}
        />
      ),
    })
  }

  if (footerItems.length === 0) {
    return null
  }

  return (
    <box
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-end',
        gap: 1,
      }}
    >
      {footerItems.map((item, idx) => (
        <React.Fragment key={item.key}>
          {idx > 0 && (
            <text
              attributes={TextAttributes.DIM}
              style={{
                wrapMode: 'none',
                fg: theme.muted,
                marginTop: 0,
                marginBottom: 0,
              }}
            >
              •
            </text>
          )}
          {item.node}
        </React.Fragment>
      ))}
    </box>
  )
}

/**
 * Shows either subscription indicator or credits count based on subscription status.
 * If user has an active subscription with remaining block credits, shows "✓ Strong".
 * If block is < 15% remaining, also shows the percentage.
 * Otherwise, shows the regular credits count.
 */
const CreditsOrSubscriptionIndicator: React.FC<{ credits: number }> = ({ credits }) => {
  const theme = useTheme()
  const { data: subscriptionData } = useSubscriptionQuery({
    refetchInterval: false, // Don't poll, just use cached data
    refetchOnActivity: false,
    pauseWhenIdle: false,
  })

  const hasActiveSubscription = subscriptionData?.hasSubscription === true
  const rateLimit = subscriptionData?.rateLimit
  const isLimited = rateLimit?.limited === true

  // Calculate block remaining percentage
  const blockPercentRemaining = useMemo(() => {
    if (!rateLimit?.blockLimit || rateLimit.blockUsed == null) return null
    const remaining = rateLimit.blockLimit - rateLimit.blockUsed
    return Math.round((remaining / rateLimit.blockLimit) * 100)
  }, [rateLimit])

  // Show subscription indicator if user has active subscription and block is not depleted
  const showSubscriptionIndicator = hasActiveSubscription && !isLimited && blockPercentRemaining !== null && blockPercentRemaining > 0

  if (showSubscriptionIndicator) {
    const showPercentage = blockPercentRemaining < 20
    return (
      <text
        attributes={TextAttributes.DIM}
        style={{
          wrapMode: 'none',
          fg: theme.success,
          marginTop: 0,
          marginBottom: 0,
        }}
      >
        {showPercentage ? `✓ ${SUBSCRIPTION_DISPLAY_NAME} (${blockPercentRemaining}% left)` : `✓ ${SUBSCRIPTION_DISPLAY_NAME}`}
      </text>
    )
  }

  // Default: show credits count
  return (
    <text
      attributes={TextAttributes.DIM}
      style={{
        wrapMode: 'none',
        fg: theme.secondary,
        marginTop: 0,
        marginBottom: 0,
      }}
    >
      {pluralize(credits, 'credit')}
    </text>
  )
}
