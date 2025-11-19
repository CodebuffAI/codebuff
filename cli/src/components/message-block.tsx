import { TextAttributes } from '@opentui/core'
import { pluralize } from '@codebuff/common/util/string'
import React, { memo, useCallback, type ReactNode } from 'react'

import { ElapsedTimer } from './elapsed-timer'
import { FeedbackIconButton } from './feedback-icon-button'
import { useTheme } from '../hooks/use-theme'
import { useWhyDidYouUpdateById } from '../hooks/use-why-did-you-update'
import { type MarkdownPalette } from '../utils/markdown-renderer'
import { useMessageActions } from '../contexts/message-actions-context'
import { useChatTheme } from '../contexts/chat-theme-context'
import {
  useFeedbackStore,
  selectIsFeedbackOpenForMessage,
  selectHasSubmittedFeedback,
  selectMessageFeedbackCategory,
} from '../state/feedback-store'
import { ThinkingBlock } from './blocks/thinking-block'
import { ContentWithMarkdown } from './blocks/content-with-markdown'
import { PlanBox } from './renderers/plan-box'
import { BlocksRenderer } from './blocks/blocks-renderer'

import type { ContentBlock } from '../types/chat'
import type { ThemeColor } from '../types/theme-system'

interface MessageBlockProps {
  messageId: string
  blocks?: ContentBlock[]
  content: string
  isUser: boolean
  isAi: boolean
  isLoading: boolean
  timestamp: string
  isComplete?: boolean
  completionTime?: string
  credits?: number
  textColor?: ThemeColor
  timestampColor: string
  markdownOptions: { codeBlockWidth: number; palette: MarkdownPalette }
  streamingAgents: Set<string>
}

const trimTrailingNewlines = (value: string): string =>
  value.replace(/[\r\n]+$/g, '')

const sanitizePreview = (value: string): string =>
  value.replace(/[#*_`~\[\]()]/g, '').trim()

export const MessageBlock = memo((props: MessageBlockProps): ReactNode => {
  const {
    messageId,
    blocks,
    content,
    isUser,
    isAi,
    isLoading,
    timestamp,
    isComplete,
    completionTime,
    credits,
    textColor,
    timestampColor,
    markdownOptions,
    streamingAgents,
  } = props
  const { availableWidth, markdownPalette, timerStartTime } = useChatTheme()
  const { onToggleCollapsed, onBuildFast, onBuildMax, onFeedback, onCloseFeedback } = useMessageActions()
  useWhyDidYouUpdateById('MessageBlock', messageId, props, {
    logLevel: 'debug',
    enabled: false,
  })

  const theme = useTheme()
  const isFeedbackOpen = useFeedbackStore(selectIsFeedbackOpenForMessage(messageId))
  const hasSubmittedFeedback = useFeedbackStore(selectHasSubmittedFeedback(messageId))
  const selectedFeedbackCategory = useFeedbackStore(selectMessageFeedbackCategory(messageId))

  const resolvedTextColor = textColor ?? theme.foreground
  const shouldShowLoadingTimer = isAi && isLoading && !isComplete
  const shouldShowCompletionFooter = isAi && isComplete
  const canRequestFeedback =
    shouldShowCompletionFooter && !hasSubmittedFeedback
  const isGoodOrBadSelection =
    selectedFeedbackCategory === 'good_result' ||
    selectedFeedbackCategory === 'bad_result'
  const shouldShowSubmittedFeedbackState =
    shouldShowCompletionFooter && hasSubmittedFeedback && isGoodOrBadSelection
  const shouldRenderFeedbackButton =
    Boolean(onFeedback) && (canRequestFeedback || shouldShowSubmittedFeedbackState)

  const handleFeedbackOpen = useCallback(() => {
    if (!canRequestFeedback || !onFeedback) return
    onFeedback(messageId)
  }, [canRequestFeedback, onFeedback, messageId])

  const handleFeedbackClose = useCallback(() => {
    if (!canRequestFeedback) return
    onCloseFeedback?.()
  }, [canRequestFeedback, onCloseFeedback])

  const renderLoadingTimer = () => {
    if (!shouldShowLoadingTimer) {
      return null
    }
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

  const renderCompletionFooter = () => {
    if (!shouldShowCompletionFooter) {
      return null
    }

    const footerItems: { key: string; node: React.ReactNode }[] = []
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
            {pluralize(credits, 'credit')}
          </text>
        ),
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

  const renderSimpleContent = () => {
    const isStreamingMessage = isLoading || !isComplete
    const normalizedContent = isStreamingMessage
      ? trimTrailingNewlines(content)
      : content.trim()

    return (
      <text
        key={`message-content-${messageId}`}
        style={{ wrapMode: 'word', fg: resolvedTextColor }}
        attributes={isUser ? TextAttributes.ITALIC : undefined}
      >
        <ContentWithMarkdown
          content={normalizedContent}
          isStreaming={isStreamingMessage}
          codeBlockWidth={markdownOptions.codeBlockWidth}
          palette={markdownOptions.palette}
        />
      </text>
    )
  }

  const renderBlocks = () => {
    if (!blocks) return renderSimpleContent()

    const planBlocks = blocks.filter((b) => b.type === 'plan')
    const nonPlanBlocks = blocks.filter((b) => b.type !== 'plan')

    return (
      <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
        {nonPlanBlocks.length > 0 && (
          <BlocksRenderer
            sourceBlocks={nonPlanBlocks}
            messageId={messageId}
            isLoading={isLoading}
            isComplete={isComplete}
            isUser={isUser}
            textColor={resolvedTextColor}
            availableWidth={availableWidth}
            markdownPalette={markdownPalette}
            streamingAgents={streamingAgents}
            onToggleCollapsed={onToggleCollapsed}
            onBuildFast={onBuildFast}
            onBuildMax={onBuildMax}
          />
        )}
        {planBlocks.map((block, idx) => (
          <box key={`${messageId}-plan-${idx}`} style={{ width: '100%' }}>
            <PlanBox
              planContent={block.type === 'plan' ? block.content : ''}
              availableWidth={availableWidth}
              markdownPalette={markdownPalette}
              onBuildFast={onBuildFast}
              onBuildMax={onBuildMax}
            />
          </box>
        ))}
      </box>
    )
  }

  return (
    <>
      {isUser && (
        <text
          attributes={TextAttributes.DIM}
          style={{
            wrapMode: 'none',
            fg: timestampColor,
            marginTop: 0,
            marginBottom: 0,
            alignSelf: 'flex-start',
          }}
        >
          {`[${timestamp}]`}
        </text>
      )}
      {renderBlocks()}
      {isAi && (
        <>
          {renderLoadingTimer()}
          {renderCompletionFooter()}
        </>
      )}
    </>
  )
})
