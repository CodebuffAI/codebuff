import { TextAttributes } from '@opentui/core'
import React, { memo } from 'react'

import { CopyButton } from '../copy-button'
import { ContentWithMarkdown } from './content-with-markdown'
import { trimTrailingNewlines } from './block-helpers'
import type { MarkdownPalette } from '../../utils/markdown-renderer'

interface UserContentWithCopyButtonProps {
  content: string
  messageId: string
  isLoading: boolean
  isComplete?: boolean
  isUser: boolean
  textColor: string
  codeBlockWidth: number
  palette: MarkdownPalette
  showCopyButton: boolean
}

export const UserContentWithCopyButton = memo(
  ({
    content,
    messageId,
    isLoading,
    isComplete,
    isUser,
    textColor,
    codeBlockWidth,
    palette,
    showCopyButton,
  }: UserContentWithCopyButtonProps) => {
    const isStreamingMessage = isLoading || !isComplete
    const normalizedContent = isStreamingMessage
      ? trimTrailingNewlines(content)
      : content.trim()

    const hasContent = normalizedContent.length > 0

    if (!hasContent) {
      return null
    }

    if (!showCopyButton) {
      return (
        <text
          key={`message-content-${messageId}`}
          style={{ wrapMode: 'word', fg: textColor }}
          attributes={isUser ? TextAttributes.ITALIC : undefined}
        >
          <ContentWithMarkdown
            content={normalizedContent}
            isStreaming={isStreamingMessage}
            codeBlockWidth={codeBlockWidth}
            palette={palette}
          />
        </text>
      )
    }

    return (
      <UserTextWithInlineCopy
        messageId={messageId}
        content={content}
        normalizedContent={normalizedContent}
        isStreamingMessage={isStreamingMessage}
        textColor={textColor}
        codeBlockWidth={codeBlockWidth}
        palette={palette}
      />
    )
  },
)

interface UserTextWithInlineCopyProps {
  messageId: string
  content: string
  normalizedContent: string
  isStreamingMessage: boolean
  textColor: string
  codeBlockWidth: number
  palette: MarkdownPalette
}

const UserTextWithInlineCopy = memo(
  ({
    messageId,
    content,
    normalizedContent,
    isStreamingMessage,
    textColor,
    codeBlockWidth,
    palette,
  }: UserTextWithInlineCopyProps) => {
    return (
      <CopyButton
        textToCopy={content}
        style={{ wrapMode: 'word', fg: textColor }}
      >
        <span attributes={TextAttributes.ITALIC}>
          <ContentWithMarkdown
            content={normalizedContent}
            isStreaming={isStreamingMessage}
            codeBlockWidth={codeBlockWidth}
            palette={palette}
          />
        </span>
      </CopyButton>
    )
  },
)

interface UserBlockTextWithInlineCopyProps {
  content: string
  contentToCopy: string
  isStreaming: boolean
  textColor: string
  codeBlockWidth: number
  palette: MarkdownPalette
  marginTop: number
  marginBottom: number
}

export const UserBlockTextWithInlineCopy = memo(
  ({
    content,
    contentToCopy,
    isStreaming,
    textColor,
    codeBlockWidth,
    palette,
    marginTop,
    marginBottom,
  }: UserBlockTextWithInlineCopyProps) => {
    return (
      <CopyButton
        textToCopy={contentToCopy}
        style={{
          wrapMode: 'word',
          fg: textColor,
          marginTop,
          marginBottom,
        }}
      >
        <span attributes={TextAttributes.ITALIC}>
          <ContentWithMarkdown
            content={content}
            isStreaming={isStreaming}
            codeBlockWidth={codeBlockWidth}
            palette={palette}
          />
        </span>
      </CopyButton>
    )
  },
)
