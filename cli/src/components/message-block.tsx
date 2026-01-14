import { TextAttributes } from '@opentui/core'
import React, { memo, useCallback, useState, type ReactNode } from 'react'

import { AgentBranchItem } from './agent-branch-item'
import { Button } from './button'
import { CopyButton } from './copy-button'
import { ImageCard } from './image-card'
import { ImplementorGroup } from './implementor-row'
import { MessageFooter } from './message-footer'
import { ValidationErrorPopover } from './validation-error-popover'
import { useTheme } from '../hooks/use-theme'
import { useWhyDidYouUpdateById } from '../hooks/use-why-did-you-update'
import { getCliEnv } from '../utils/env'
import { isTextBlock, isToolBlock, isImageBlock } from '../types/chat'
import { shouldRenderAsSimpleText } from '../utils/constants'
import {
  isImplementorAgent,
  getImplementorIndex,
  groupConsecutiveImplementors,
} from '../utils/implementor-helpers'
import { getAgentStatusInfo } from '../utils/agent-helpers'
import { type MarkdownPalette } from '../utils/markdown-renderer'
import { formatCwd } from '../utils/path-helpers'
import { AgentListBranch } from './blocks/agent-list-branch'
import { AskUserBranch } from './blocks/ask-user-branch'
import { ContentWithMarkdown } from './blocks/content-with-markdown'
import { ImageBlock } from './blocks/image-block'
import { ThinkingBlock } from './blocks/thinking-block'
import { ToolBranch } from './blocks/tool-branch'
import { PlanBox } from './renderers/plan-box'

import type {
  ContentBlock,
  TextContentBlock,
  HtmlContentBlock,
  AgentContentBlock,
  ImageAttachment,
  ImageContentBlock,
  ChatMessageMetadata,
} from '../types/chat'
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
  timerStartTime: number | null
  textColor?: ThemeColor
  timestampColor: string
  markdownOptions: { codeBlockWidth: number; palette: MarkdownPalette }
  availableWidth: number
  markdownPalette: MarkdownPalette
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  onFeedback?: (messageId: string) => void
  onCloseFeedback?: () => void
  validationErrors?: Array<{ id: string; message: string }>
  onOpenFeedback?: (options?: {
    category?: string
    footerMessage?: string
    errors?: Array<{ id: string; message: string }>
  }) => void
  attachments?: ImageAttachment[]
  metadata?: ChatMessageMetadata
  isLastMessage?: boolean
}

const MessageAttachments = ({
  attachments,
}: {
  attachments: ImageAttachment[]
}) => {
  if (attachments.length === 0) {
    return null
  }

  return (
    <box
      style={{
        flexDirection: 'row',
        gap: 1,
        flexWrap: 'wrap',
        marginTop: 1,
      }}
    >
      {attachments.map((attachment) => (
        <ImageCard
          key={attachment.path}
          image={attachment}
          showRemoveButton={false}
        />
      ))}
    </box>
  )
}

export const MessageBlock: React.FC<MessageBlockProps> = ({
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
  timerStartTime,
  textColor,
  timestampColor,
  markdownOptions,
  availableWidth,
  markdownPalette,
  streamingAgents,
  onToggleCollapsed,
  onBuildFast,
  onBuildMax,
  onFeedback,
  onCloseFeedback,
  validationErrors,
  onOpenFeedback,
  attachments,
  metadata,
  isLastMessage,
}) => {
  const [showValidationPopover, setShowValidationPopover] = useState(false)

  const bashCwd = metadata?.bashCwd ? formatCwd(metadata.bashCwd) : undefined

  useWhyDidYouUpdateById(
    'MessageBlock',
    messageId,
    {
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
      timerStartTime,
      textColor,
      timestampColor,
      markdownOptions,
      availableWidth,
      markdownPalette,
      streamingAgents,
      onToggleCollapsed,
      onBuildFast,
      onBuildMax,
      onFeedback,
      onCloseFeedback,
      validationErrors,
      onOpenFeedback,
      metadata,
      isLastMessage,
    },
    {
      logLevel: 'debug',
      enabled: getCliEnv().CODEBUFF_PERF_TEST === 'true',
    },
  )

  const theme = useTheme()
  const resolvedTextColor = textColor ?? theme.foreground

  return (
    <box
      style={{
        flexDirection: 'column',
        width: '100%',
      }}
    >
      {/* User message timestamp with error indicator (non-bash commands) */}
      {isUser && !bashCwd && (
        <box style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
          <text
            attributes={TextAttributes.DIM}
            style={{
              wrapMode: 'none',
              fg: timestampColor,
            }}
          >
            {`[${timestamp}]`}
          </text>

          {validationErrors && validationErrors.length > 0 && (
            <Button
              onClick={() => setShowValidationPopover(!showValidationPopover)}
            >
              <text
                style={{
                  fg: theme.error,
                  wrapMode: 'none',
                }}
              >
                [!]
              </text>
            </Button>
          )}
        </box>
      )}

      {/* Bash command metadata header (timestamp + cwd) - copy button moved inline */}
      {bashCwd && (
        <box style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
          <text
            attributes={TextAttributes.DIM}
            style={{
              wrapMode: 'none',
              fg: timestampColor,
            }}
          >
            {`[${timestamp}]`}
          </text>
          <text
            attributes={TextAttributes.DIM}
            style={{
              wrapMode: 'none',
              fg: theme.muted,
            }}
          >
            •
          </text>
          <text
            attributes={TextAttributes.DIM}
            style={{
              wrapMode: 'word',
              fg: theme.muted,
            }}
          >
            {bashCwd}
          </text>
        </box>
      )}

      {/* Show validation popover below timestamp when expanded */}
      {isUser &&
        !bashCwd &&
        validationErrors &&
        validationErrors.length > 0 &&
        showValidationPopover && (
          <box style={{ paddingTop: 1, paddingBottom: 1 }}>
            <ValidationErrorPopover
              errors={validationErrors}
              onOpenFeedback={onOpenFeedback}
              onClose={() => setShowValidationPopover(false)}
            />
          </box>
        )}

      {blocks ? (
        <box
          style={{
            flexDirection: 'column',
            gap: 0,
            width: '100%',
            paddingTop: 0,
          }}
        >
          <BlocksRenderer
            sourceBlocks={blocks}
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
            isLastMessage={isLastMessage}
            contentToCopy={isUser ? content : undefined}
          />
        </box>
      ) : (
        <UserContentWithCopyButton
          content={content}
          messageId={messageId}
          isLoading={isLoading}
          isComplete={isComplete}
          isUser={isUser}
          textColor={resolvedTextColor}
          codeBlockWidth={markdownOptions.codeBlockWidth}
          palette={markdownOptions.palette}
          showCopyButton={isUser}
        />
      )}
      {/* Show image attachments for user messages */}
      {isUser && attachments && attachments.length > 0 && (
        <MessageAttachments attachments={attachments} />
      )}

      {isAi && (
        <MessageFooter
          messageId={messageId}
          blocks={blocks}
          content={content}
          isLoading={isLoading}
          isComplete={isComplete}
          completionTime={completionTime}
          credits={credits}
          timerStartTime={timerStartTime}
          onFeedback={onFeedback}
          onCloseFeedback={onCloseFeedback}
        />
      )}
    </box>
  )
}

const trimTrailingNewlines = (value: string): string =>
  value.replace(/[\r\n]+$/g, '')

const sanitizePreview = (value: string): string =>
  value.replace(/[#*_`~\[\]()]/g, '').trim()

// Extract all text content from blocks recursively

const isReasoningTextBlock = (
  b: ContentBlock | null | undefined,
): b is TextContentBlock => {
  if (!b || b.type !== 'text') return false
  return b.textType === 'reasoning'
}

const isRenderableTimelineBlock = (
  block: ContentBlock | null | undefined,
): boolean => {
  if (!block) {
    return false
  }

  if (block.type === 'tool') {
    return block.toolName !== 'end_turn'
  }

  switch (block.type) {
    case 'text':
    case 'html':
    case 'agent':
    case 'agent-list':
    case 'plan':
    case 'mode-divider':
    case 'ask-user':
    case 'image':
      return true
    default:
      return false
  }
}

interface AgentBodyProps {
  agentBlock: Extract<ContentBlock, { type: 'agent' }>
  keyPrefix: string
  parentIsStreaming: boolean
  availableWidth: number
  markdownPalette: MarkdownPalette
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  isLastMessage?: boolean
}

const AgentBody = memo(
  ({
    agentBlock,
    keyPrefix,
    parentIsStreaming,
    availableWidth,
    markdownPalette,
    streamingAgents,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
    isLastMessage,
  }: AgentBodyProps): ReactNode[] => {
    const theme = useTheme()
    const nestedBlocks = agentBlock.blocks ?? []
    const nodes: React.ReactNode[] = []

    const getAgentMarkdownOptions = useCallback(
      (indent: number) => {
        const indentationOffset = indent * 2
        return {
          codeBlockWidth: Math.max(10, availableWidth - 12 - indentationOffset),
          palette: {
            ...markdownPalette,
            codeTextFg: theme.foreground,
          },
        }
      },
      [availableWidth, markdownPalette, theme.foreground],
    )

    for (let nestedIdx = 0; nestedIdx < nestedBlocks.length; ) {
      const nestedBlock = nestedBlocks[nestedIdx]

      // Handle reasoning text blocks first
      if (isReasoningTextBlock(nestedBlock)) {
        const start = nestedIdx
        const reasoningBlocks: Extract<ContentBlock, { type: 'text' }>[] = []
        while (nestedIdx < nestedBlocks.length) {
          const block = nestedBlocks[nestedIdx]
          if (!isReasoningTextBlock(block)) break
          reasoningBlocks.push(block)
          nestedIdx++
        }

        nodes.push(
          <ThinkingBlock
            key={reasoningBlocks[0]?.thinkingId ?? `${keyPrefix}-thinking-${start}`}
            blocks={reasoningBlocks}
            onToggleCollapsed={onToggleCollapsed}
            availableWidth={availableWidth}
            isNested={true}
          />,
        )
        continue
      }

      switch ((nestedBlock as ContentBlock).type) {
        case 'text': {
          const textBlock = nestedBlock as unknown as TextContentBlock
          const nestedStatus = textBlock.status
          const isNestedStreamingText =
            parentIsStreaming || nestedStatus === 'running'
          const filteredNestedContent = isNestedStreamingText
            ? trimTrailingNewlines(textBlock.content)
            : textBlock.content.trim()
          const renderKey = `${keyPrefix}-text-${nestedIdx}`
          const markdownOptionsForLevel = getAgentMarkdownOptions(0)
          const marginTop = textBlock.marginTop ?? 0
          const marginBottom = textBlock.marginBottom ?? 0
          const explicitColor = textBlock.color
          const nestedTextColor = explicitColor ?? theme.foreground
          nodes.push(
            <text
              key={renderKey}
              style={{
                wrapMode: 'word',
                fg: nestedTextColor,
                marginTop,
                marginBottom,
              }}
            >
              <ContentWithMarkdown
                content={filteredNestedContent}
                isStreaming={isNestedStreamingText}
                codeBlockWidth={markdownOptionsForLevel.codeBlockWidth}
                palette={markdownOptionsForLevel.palette}
              />
            </text>,
          )
          nestedIdx++
          break
        }

        case 'html': {
          const htmlBlock = nestedBlock as HtmlContentBlock
          const marginTop = htmlBlock.marginTop ?? 0
          const marginBottom = htmlBlock.marginBottom ?? 0
          nodes.push(
            <box
              key={`${keyPrefix}-html-${nestedIdx}`}
              style={{
                flexDirection: 'column',
                gap: 0,
                marginTop,
                marginBottom,
              }}
            >
              {htmlBlock.render({
                textColor: theme.foreground,
                theme,
              })}
            </box>,
          )
          nestedIdx++
          break
        }

        case 'tool': {
          const start = nestedIdx
          const toolGroup: Extract<ContentBlock, { type: 'tool' }>[] = []
          while (nestedIdx < nestedBlocks.length) {
            const block = nestedBlocks[nestedIdx]
            if (!isToolBlock(block)) break
            toolGroup.push(block)
            nestedIdx++
          }

          const groupNodes = toolGroup.map((toolBlock) => (
            <ToolBranch
              key={`${keyPrefix}-tool-${toolBlock.toolCallId}`}
              toolBlock={toolBlock}
              keyPrefix={`${keyPrefix}-tool-${toolBlock.toolCallId}`}
              availableWidth={availableWidth}
              streamingAgents={streamingAgents}
              onToggleCollapsed={onToggleCollapsed}
              markdownPalette={markdownPalette}
            />
          ))

          const nonNullGroupNodes = groupNodes.filter(
            Boolean,
          ) as React.ReactNode[]
          if (nonNullGroupNodes.length > 0) {
            const hasRenderableBefore =
              start > 0 && isRenderableTimelineBlock(nestedBlocks[start - 1])
            let hasRenderableAfter = false
            for (let i = nestedIdx; i < nestedBlocks.length; i++) {
              if (isRenderableTimelineBlock(nestedBlocks[i])) {
                hasRenderableAfter = true
                break
              }
            }
            nodes.push(
              <box
                key={`${keyPrefix}-tool-group-${start}`}
                style={{
                  flexDirection: 'column',
                  gap: 0,
                  marginTop: hasRenderableBefore ? 1 : 0,
                  marginBottom: hasRenderableAfter ? 1 : 0,
                }}
              >
                {nonNullGroupNodes}
              </box>,
            )
          }
          break
        }

        case 'agent': {
          const agentBlock = nestedBlock as AgentContentBlock
          
          // Group consecutive implementor agents and render with ImplementorGroup
          if (isImplementorAgent(agentBlock)) {
            const start = nestedIdx
            const { group: implementors, nextIndex } = groupConsecutiveImplementors(nestedBlocks, nestedIdx)
            nestedIdx = nextIndex

            nodes.push(
              <ImplementorGroup
                key={`${keyPrefix}-implementor-group-${start}`}
                implementors={implementors}
                siblingBlocks={nestedBlocks}
                onToggleCollapsed={onToggleCollapsed}
                availableWidth={availableWidth}
              />,
            )
            break
          }
          
          nodes.push(
            <AgentBranchWrapper
              key={`${keyPrefix}-agent-${nestedIdx}`}
              agentBlock={agentBlock}
              keyPrefix={`${keyPrefix}-agent-${nestedIdx}`}
              availableWidth={availableWidth}
              markdownPalette={markdownPalette}
              streamingAgents={streamingAgents}
              onToggleCollapsed={onToggleCollapsed}
              onBuildFast={onBuildFast}
              onBuildMax={onBuildMax}
              siblingBlocks={nestedBlocks}
              isLastMessage={isLastMessage}
            />,
          )
          nestedIdx++
          break
        }
      }
    }

    return nodes
  },
)

interface AgentBranchWrapperProps {
  agentBlock: Extract<ContentBlock, { type: 'agent' }>
  keyPrefix: string
  availableWidth: number
  markdownPalette: MarkdownPalette
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  siblingBlocks?: ContentBlock[]
  isLastMessage?: boolean
}

const AgentBranchWrapper = memo(
  ({
    agentBlock,
    keyPrefix,
    availableWidth,
    markdownPalette,
    streamingAgents,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
    siblingBlocks,
    isLastMessage,
  }: AgentBranchWrapperProps) => {
    const theme = useTheme()

    if (shouldRenderAsSimpleText(agentBlock.agentType)) {
      const isStreaming =
        agentBlock.status === 'running' ||
        streamingAgents.has(agentBlock.agentId)
      
      // Get base status info, but override if streaming
      const effectiveStatus = isStreaming ? 'running' : agentBlock.status
      const { indicator: statusIndicator, color: statusColor } = getAgentStatusInfo(
        effectiveStatus,
        theme,
      )

      let statusText = 'Selecting best'
      let reason: string | undefined

      // If complete, try to show which implementation was selected
      const isComplete = agentBlock.status === 'complete'
      if (isComplete && siblingBlocks) {
        const blocks = agentBlock.blocks ?? []
        const lastBlock = blocks[blocks.length - 1] as
          | { input: { implementationId: string; reason: string } }
          | undefined
        const implementationId = lastBlock?.input?.implementationId
        if (implementationId) {
          // Convert letter to index: 'A' -> 0, 'B' -> 1, etc.
          const letterIndex = implementationId.charCodeAt(0) - 65
          const implementors = siblingBlocks.filter(
            (b): b is AgentContentBlock => b.type === 'agent' && isImplementorAgent(b),
          )

          const selectedAgent = implementors[letterIndex]
          if (selectedAgent) {
            const index = getImplementorIndex(selectedAgent, siblingBlocks)
            // Just show "Selected Prompt #N" without repeating the prompt text
            statusText = index !== undefined ? `Selected Strategy #${index + 1}` : 'Selected'
            reason = lastBlock?.input?.reason
          }
        }
      }

      return (
        <box
          key={keyPrefix}
          style={{
            flexDirection: 'column',
            gap: 0,
            width: '100%',
            marginTop: 1,
          }}
        >
          <text style={{ wrapMode: 'word' }}>
            <span fg={statusColor}>{statusIndicator}</span>
            <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
              {' '}
              {statusText}
            </span>
          </text>
          {reason && (
            <text
              style={{
                wrapMode: 'word',
                fg: theme.foreground,
                marginLeft: 2,
              }}
            >
              {reason}
            </text>
          )}
        </box>
      )
    }

    const isCollapsed = agentBlock.isCollapsed ?? false
    const isStreaming =
      agentBlock.status === 'running' || streamingAgents.has(agentBlock.agentId)

    const allTextContent =
      agentBlock.blocks
        ?.filter(isTextBlock)
        .map((nested) => nested.content)
        .join('') || ''

    const lines = allTextContent.split('\n').filter((line) => line.trim())
    const firstLine = lines[0] || ''

    const streamingPreview = isStreaming
      ? agentBlock.initialPrompt
        ? sanitizePreview(agentBlock.initialPrompt)
        : `${sanitizePreview(firstLine)}...`
      : ''

    const finishedPreview =
      !isStreaming && isCollapsed && agentBlock.initialPrompt
        ? sanitizePreview(agentBlock.initialPrompt)
        : ''

    const isActive = isStreaming || agentBlock.status === 'running'
    const effectiveStatus = isActive ? 'running' : agentBlock.status
    const { indicator: statusIndicator, label: statusLabel, color: statusColor } = getAgentStatusInfo(
      effectiveStatus,
      theme,
    )

    const onToggle = useCallback(() => {
      onToggleCollapsed(agentBlock.agentId)
    }, [onToggleCollapsed, agentBlock.agentId])

    return (
      <box key={keyPrefix} style={{ flexDirection: 'column', gap: 0 }}>
        <AgentBranchItem
          name={agentBlock.agentName}
          prompt={agentBlock.initialPrompt}
          agentId={agentBlock.agentId}
          isCollapsed={isCollapsed}
          isStreaming={isStreaming}
          streamingPreview={streamingPreview}
          finishedPreview={finishedPreview}
          statusLabel={statusLabel ?? undefined}
          statusColor={statusColor}
          statusIndicator={statusIndicator}
          onToggle={onToggle}
        >
          <AgentBody
            agentBlock={agentBlock}
            keyPrefix={keyPrefix}
            parentIsStreaming={isStreaming}
            availableWidth={availableWidth}
            markdownPalette={markdownPalette}
            streamingAgents={streamingAgents}
            onToggleCollapsed={onToggleCollapsed}
            onBuildFast={onBuildFast}
            onBuildMax={onBuildMax}
            isLastMessage={isLastMessage}
          />
        </AgentBranchItem>
      </box>
    )
  },
)

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

/**
 * Renders user content with an inline copy button.
 * The text flows naturally with word wrapping, and the copy button appears inline after the content.
 */
const UserContentWithCopyButton = memo(
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

    // Render text content with inline copy icon - clicking the icon copies the text
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

/**
 * Renders user text content with an inline copy icon at the end.
 * Clicking the copy icon copies the text to clipboard.
 */
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

/**
 * Renders a text block for user messages with an inline copy icon at the end.
 */
const UserBlockTextWithInlineCopy = memo(
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

interface SingleBlockProps {
  block: ContentBlock
  idx: number
  messageId: string
  blocks?: ContentBlock[]
  isLoading: boolean
  isComplete?: boolean
  isUser: boolean
  textColor: string
  availableWidth: number
  markdownPalette: MarkdownPalette
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  isLastMessage?: boolean
  contentToCopy?: string
}

const SingleBlock = memo(
  ({
    block,
    idx,
    messageId,
    blocks,
    isLoading,
    isComplete,
    isUser,
    textColor,
    availableWidth,
    markdownPalette,
    streamingAgents,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
    isLastMessage,
    contentToCopy,
  }: SingleBlockProps): ReactNode => {
    const theme = useTheme()
    const codeBlockWidth = Math.max(10, availableWidth - 8)

    switch (block.type) {
      case 'text': {
        // Skip raw rendering for reasoning; grouped above into <Thinking>
        if (isReasoningTextBlock(block)) {
          return null
        }
        const textBlock = block as TextContentBlock
        const isStreamingText = isLoading || !isComplete
        const filteredContent = isStreamingText
          ? trimTrailingNewlines(textBlock.content)
          : textBlock.content.trim()
        const renderKey = `${messageId}-text-${idx}`
        const prevBlock = idx > 0 && blocks ? blocks[idx - 1] : null
        const marginTop =
          prevBlock && (prevBlock.type === 'tool' || prevBlock.type === 'agent')
            ? 0
            : textBlock.marginTop ?? 0
        const marginBottom = textBlock.marginBottom ?? 0
        const explicitColor = textBlock.color
        const blockTextColor = explicitColor ?? textColor
        
        // If this block should have an inline copy icon, use the special component
        if (contentToCopy) {
          return (
            <UserBlockTextWithInlineCopy
              key={renderKey}
              content={filteredContent}
              contentToCopy={contentToCopy}
              isStreaming={isStreamingText}
              textColor={blockTextColor}
              codeBlockWidth={codeBlockWidth}
              palette={markdownPalette}
              marginTop={marginTop}
              marginBottom={marginBottom}
            />
          )
        }
        
        return (
          <text
            key={renderKey}
            style={{
              wrapMode: 'word',
              fg: blockTextColor,
              marginTop,
              marginBottom,
            }}
            attributes={isUser ? TextAttributes.ITALIC : undefined}
          >
            <ContentWithMarkdown
              content={filteredContent}
              isStreaming={isStreamingText}
              codeBlockWidth={codeBlockWidth}
              palette={markdownPalette}
            />
          </text>
        )
      }

      case 'plan': {
        return (
          <box key={`${messageId}-plan-${idx}`} style={{ width: '100%' }}>
            <PlanBox
              planContent={block.content}
              availableWidth={availableWidth}
              markdownPalette={markdownPalette}
              onBuildFast={onBuildFast}
              onBuildMax={onBuildMax}
            />
          </box>
        )
      }

      case 'html': {
        const marginTop = block.marginTop ?? 0
        const marginBottom = block.marginBottom ?? 0
        return (
          <box
            key={`${messageId}-html-${idx}`}
            style={{
              flexDirection: 'column',
              gap: 0,
              marginTop,
              marginBottom,
              width: '100%',
            }}
          >
            {block.render({ textColor, theme })}
          </box>
        )
      }

      case 'tool': {
        // Handled in BlocksRenderer grouping logic
        return null
      }

      case 'ask-user': {
        return (
          <AskUserBranch
            key={`${messageId}-ask-user-${idx}`}
            block={block}
            availableWidth={availableWidth}
          />
        )
      }

      case 'image': {
        return (
          <ImageBlock
            key={`${messageId}-image-${idx}`}
            block={block as ImageContentBlock}
            availableWidth={availableWidth}
          />
        )
      }

      case 'agent': {
        return (
          <AgentBranchWrapper
            key={`${messageId}-agent-${block.agentId}`}
            agentBlock={block}
            keyPrefix={`${messageId}-agent-${block.agentId}`}
            availableWidth={availableWidth}
            markdownPalette={markdownPalette}
            streamingAgents={streamingAgents}
            onToggleCollapsed={onToggleCollapsed}
            onBuildFast={onBuildFast}
            onBuildMax={onBuildMax}
            siblingBlocks={blocks}
            isLastMessage={isLastMessage}
          />
        )
      }

      case 'agent-list': {
        return (
          <AgentListBranch
            key={`${messageId}-agent-list-${block.id}`}
            agentListBlock={block}
            keyPrefix={`${messageId}-agent-list-${block.id}`}
            onToggleCollapsed={onToggleCollapsed}
          />
        )
      }

      default:
        return null
    }
  },
)

interface BlocksRendererProps {
  sourceBlocks: ContentBlock[]
  messageId: string
  isLoading: boolean
  isComplete?: boolean
  isUser: boolean
  textColor: string
  availableWidth: number
  markdownPalette: MarkdownPalette
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  isLastMessage?: boolean
  contentToCopy?: string
}

const BlocksRenderer = memo(
  ({
    sourceBlocks,
    messageId,
    isLoading,
    isComplete,
    isUser,
    textColor,
    availableWidth,
    markdownPalette,
    streamingAgents,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
    isLastMessage,
    contentToCopy,
  }: BlocksRendererProps) => {
    const nodes: React.ReactNode[] = []
    
    // Find the index of the last text block for inline copy icon
    const lastTextBlockIndex = contentToCopy
      ? sourceBlocks.reduceRight(
          (acc, block, idx) => (acc === -1 && block.type === 'text' ? idx : acc),
          -1,
        )
      : -1

    for (let i = 0; i < sourceBlocks.length; ) {
      const block = sourceBlocks[i]
      // Handle reasoning text blocks
      if (isReasoningTextBlock(block)) {
        const start = i
        const reasoningBlocks: Extract<ContentBlock, { type: 'text' }>[] = []
        while (i < sourceBlocks.length) {
          const currentBlock = sourceBlocks[i]
          if (!isReasoningTextBlock(currentBlock)) break
          reasoningBlocks.push(currentBlock)
          i++
        }

        nodes.push(
          <ThinkingBlock
            key={reasoningBlocks[0]?.thinkingId ?? `${messageId}-thinking-${start}`}
            blocks={reasoningBlocks}
            onToggleCollapsed={onToggleCollapsed}
            availableWidth={availableWidth}
            isNested={false}
          />,
        )
        continue
      }
      // Handle image blocks
      if (isImageBlock(block)) {
        nodes.push(
          <ImageBlock
            key={`${messageId}-image-${i}`}
            block={block}
            availableWidth={availableWidth}
          />,
        )
        i++
        continue
      }

      if (block.type === 'tool') {
        const start = i
        const group: Extract<ContentBlock, { type: 'tool' }>[] = []
        while (i < sourceBlocks.length) {
          const currentBlock = sourceBlocks[i]
          if (!isToolBlock(currentBlock)) break
          group.push(currentBlock)
          i++
        }

        const groupNodes = group.map((toolBlock) => (
          <ToolBranch
            key={`${messageId}-tool-${toolBlock.toolCallId}`}
            toolBlock={toolBlock}
            keyPrefix={`${messageId}-tool-${toolBlock.toolCallId}`}
            availableWidth={availableWidth}
            streamingAgents={streamingAgents}
            onToggleCollapsed={onToggleCollapsed}
            markdownPalette={markdownPalette}
          />
        ))

        const nonNullGroupNodes = groupNodes.filter(
          Boolean,
        ) as React.ReactNode[]
        if (nonNullGroupNodes.length > 0) {
          const hasRenderableBefore =
            start > 0 && isRenderableTimelineBlock(sourceBlocks[start - 1])
          // Check for any subsequent renderable blocks without allocating a slice
          let hasRenderableAfter = false
          for (let j = i; j < sourceBlocks.length; j++) {
            if (isRenderableTimelineBlock(sourceBlocks[j])) {
              hasRenderableAfter = true
              break
            }
          }
          nodes.push(
            <box
              key={`${messageId}-tool-group-${start}`}
              style={{
                flexDirection: 'column',
                gap: 0,
                marginTop: hasRenderableBefore ? 1 : 0,
                marginBottom: hasRenderableAfter ? 1 : 0,
              }}
            >
              {nonNullGroupNodes}
            </box>,
          )
        }
        continue
      }

      // Group consecutive implementor agents and render with ImplementorGroup
      if (block.type === 'agent' && isImplementorAgent(block)) {
        const start = i
        const { group: implementors, nextIndex } = groupConsecutiveImplementors(sourceBlocks, i)
        i = nextIndex

        nodes.push(
          <ImplementorGroup
            key={`${messageId}-implementor-group-${start}`}
            implementors={implementors}
            siblingBlocks={sourceBlocks}
            onToggleCollapsed={onToggleCollapsed}
            availableWidth={availableWidth}
          />,
        )
        continue
      }

      nodes.push(
        <SingleBlock
          key={`${messageId}-block-${i}`}
          block={block}
          idx={i}
          messageId={messageId}
          blocks={sourceBlocks}
          isLoading={isLoading}
          isComplete={isComplete}
          isUser={isUser}
          textColor={textColor}
          availableWidth={availableWidth}
          markdownPalette={markdownPalette}
          streamingAgents={streamingAgents}
          onToggleCollapsed={onToggleCollapsed}
          onBuildFast={onBuildFast}
          onBuildMax={onBuildMax}
          isLastMessage={isLastMessage}
          contentToCopy={i === lastTextBlockIndex ? contentToCopy : undefined}
        />,
      )
      i++
    }
    return nodes
  },
)
