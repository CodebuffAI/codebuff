import { TextAttributes } from '@opentui/core'
import React, { memo, useState } from 'react'

import { CopyButton } from '../copy-button'
import { Button } from '../button'
import { useTheme } from '../../hooks/use-theme'
import { MAX_COLLAPSED_LINES, truncateToLines } from '../../utils/strings'
import { trimNewlines } from './block-helpers'
import { ContentWithMarkdown } from './content-with-markdown'

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
      ? trimNewlines(content)
      : content.trim()

    const hasContent = normalizedContent.length > 0

    if (!hasContent) {
      return null
    }

    // Collapse-by-default only applies to COMPLETE user messages whose rendered
    // content exceeds the configured line threshold. Streaming/incomplete
    // messages and AI messages are never collapsed.
    const isCollapsibleUser =
      isUser &&
      !isStreamingMessage &&
      normalizedContent.split('\n').length > MAX_COLLAPSED_LINES

    if (!showCopyButton) {
      return (
        <UserTextDisplay
          messageId={messageId}
          normalizedContent={normalizedContent}
          isStreamingMessage={isStreamingMessage}
          isCollapsibleUser={isCollapsibleUser}
          textColor={textColor}
          codeBlockWidth={codeBlockWidth}
          palette={palette}
          isUser={isUser}
        />
      )
    }

    return (
      <UserTextWithInlineCopy
        content={content}
        normalizedContent={normalizedContent}
        isStreamingMessage={isStreamingMessage}
        isCollapsibleUser={isCollapsibleUser}
        textColor={textColor}
        codeBlockWidth={codeBlockWidth}
        palette={palette}
      />
    )
  },
)

interface UserTextDisplayProps {
  messageId: string
  normalizedContent: string
  isStreamingMessage: boolean
  isCollapsibleUser: boolean
  isUser: boolean
  textColor: string
  codeBlockWidth: number
  palette: MarkdownPalette
}

/**
 * Plain (no copy button) user text display. Applies collapse-by-default for
 * long complete user messages, mirroring the UserTextWithInlineCopy behavior.
 */
const UserTextDisplay = memo(
  ({
    messageId,
    normalizedContent,
    isStreamingMessage,
    isCollapsibleUser,
    isUser,
    textColor,
    codeBlockWidth,
    palette,
  }: UserTextDisplayProps) => {
    const { displayContent, isExpanded, setIsExpanded, showToggle } =
      useCollapsibleContent(normalizedContent, isCollapsibleUser)

    const textEl = (
      <text
        key={`message-content-${messageId}`}
        style={{ wrapMode: 'word', fg: textColor, width: '100%' }}
        attributes={isUser ? TextAttributes.ITALIC : undefined}
      >
        <ContentWithMarkdown
          content={displayContent}
          isStreaming={isStreamingMessage}
          codeBlockWidth={codeBlockWidth}
          palette={palette}
        />
      </text>
    )

    if (!showToggle) {
      return textEl
    }

    return (
      <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
        {textEl}
        <CollapseToggle isExpanded={isExpanded} onToggle={setIsExpanded} />
      </box>
    )
  },
)

interface UserTextWithInlineCopyProps {
  content: string
  normalizedContent: string
  isStreamingMessage: boolean
  isCollapsibleUser: boolean
  textColor: string
  codeBlockWidth: number
  palette: MarkdownPalette
}

const UserTextWithInlineCopy = memo(
  ({
    content,
    normalizedContent,
    isStreamingMessage,
    isCollapsibleUser,
    textColor,
    codeBlockWidth,
    palette,
  }: UserTextWithInlineCopyProps) => {
    const { displayContent, isExpanded, setIsExpanded, showToggle } =
      useCollapsibleContent(normalizedContent, isCollapsibleUser)

    const copyEl = (
      <CopyButton
        textToCopy={content}
        style={{ wrapMode: 'word', fg: textColor, width: '100%' }}
      >
        <span attributes={TextAttributes.ITALIC}>
          <ContentWithMarkdown
            content={displayContent}
            isStreaming={isStreamingMessage}
            codeBlockWidth={codeBlockWidth}
            palette={palette}
          />
        </span>
      </CopyButton>
    )

    if (!showToggle) {
      return copyEl
    }

    return (
      <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
        {copyEl}
        <CollapseToggle isExpanded={isExpanded} onToggle={setIsExpanded} />
      </box>
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
    // Collapse-by-default only for complete (non-streaming) user block text
    // exceeding the configured line threshold.
    const isCollapsibleUser =
      !isStreaming && content.split('\n').length > MAX_COLLAPSED_LINES

    const { displayContent, isExpanded, setIsExpanded, showToggle } =
      useCollapsibleContent(content, isCollapsibleUser)

    const copyEl = (
      <CopyButton
        textToCopy={contentToCopy}
        style={{
          wrapMode: 'word',
          fg: textColor,
          marginTop,
          marginBottom,
          width: '100%',
        }}
      >
        <span attributes={TextAttributes.ITALIC}>
          <ContentWithMarkdown
            content={displayContent}
            isStreaming={isStreaming}
            codeBlockWidth={codeBlockWidth}
            palette={palette}
          />
        </span>
      </CopyButton>
    )

    if (!showToggle) {
      return copyEl
    }

    return (
      <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
        {copyEl}
        <CollapseToggle isExpanded={isExpanded} onToggle={setIsExpanded} />
      </box>
    )
  },
)

// ============================================================================
// Shared collapse helpers
// ============================================================================

interface CollapsibleContent {
  /** The content to render: truncated preview when collapsed, full when expanded */
  displayContent: string
  isExpanded: boolean
  setIsExpanded: (value: boolean) => void
  /** Whether the collapse toggle should be shown (persistent across collapsed/expanded states) */
  showToggle: boolean
}

/**
 * Hook encapsulating the collapse-by-default behavior for long user messages.
 *
 * - `normalizedContent` is what gets rendered; it is truncated via
 *   `truncateToLines` when collapsed.
 * - Collapse only applies when `isCollapsible` is true (i.e. a complete user
 *   message exceeding MAX_COLLAPSED_LINES). Streaming / short messages are
 *   always shown in full.
 */
function useCollapsibleContent(
  normalizedContent: string,
  isCollapsible: boolean,
): CollapsibleContent {
  const [isExpanded, setIsExpanded] = useState(false)

  // The toggle stays visible in both collapsed and expanded states so that
  // users can always re-collapse ("Show less") after expanding.
  const showToggle = isCollapsible
  const displayContent =
    isCollapsible && !isExpanded
      ? truncateToLines(normalizedContent, MAX_COLLAPSED_LINES) ??
        normalizedContent
      : normalizedContent

  return {
    displayContent,
    isExpanded,
    setIsExpanded,
    showToggle,
  }
}

interface CollapseToggleProps {
  isExpanded: boolean
  onToggle: (value: boolean) => void
}

/**
 * Show more / Show less toggle for collapsed user messages.
 * Mirrors the terminal-command-display.tsx affordance.
 */
const CollapseToggle = memo(({ isExpanded, onToggle }: CollapseToggleProps) => {
  const theme = useTheme()

  return (
    <Button
      style={{ marginTop: 0 }}
      onClick={() => onToggle(!isExpanded)}
    >
      <text
        fg={theme.secondary}
        style={{ wrapMode: 'word' }}
        attributes={TextAttributes.UNDERLINE}
      >
        {isExpanded ? '▴ Show less' : '▾ Show more'}
      </text>
    </Button>
  )
})
