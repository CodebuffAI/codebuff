import { pluralize } from '@codebuff/common/util/string'
import { TextAttributes } from '@opentui/core'
import React, { memo, useCallback, useMemo, useState, type ReactNode } from 'react'

import { AgentBranchItem } from './agent-branch-item'
import { Button } from './button'
import { CopyIconButton } from './copy-icon-button'
import { ElapsedTimer } from './elapsed-timer'
import { FeedbackIconButton } from './feedback-icon-button'
import { ValidationErrorPopover } from './validation-error-popover'
import { useTheme } from '../hooks/use-theme'
import { useWhyDidYouUpdateById } from '../hooks/use-why-did-you-update'
import {
  useFeedbackStore,
  selectIsFeedbackOpenForMessage,
  selectHasSubmittedFeedback,
  selectMessageFeedbackCategory,
} from '../state/feedback-store'
import { isTextBlock, isToolBlock } from '../types/chat'
import { shouldRenderAsSimpleText } from '../utils/constants'
import {
  isImplementorAgent,
  getImplementorDisplayName,
  getImplementorIndex,
} from '../utils/implementor-helpers'
import { type MarkdownPalette } from '../utils/markdown-renderer'
import { AgentListBranch } from './blocks/agent-list-branch'
import { ContentWithMarkdown } from './blocks/content-with-markdown'
import { ThinkingBlock } from './blocks/thinking-block'
import { ToolBranch } from './blocks/tool-branch'
import { PlanBox } from './renderers/plan-box'

import type {
  ContentBlock,
  TextContentBlock,
  HtmlContentBlock,
  AgentContentBlock,
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
}

import { BORDER_CHARS } from '../utils/ui-constants'

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
}) => {
  const [showValidationPopover, setShowValidationPopover] = useState(false)
  const [isErrorButtonHovered, setIsErrorButtonHovered] = useState(false)
  
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
    },
    {
      logLevel: 'debug',
      enabled: false,
    },
  )

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

  const resolvedTextColor = textColor ?? theme.foreground
  const shouldShowLoadingTimer = isAi && isLoading && !isComplete
  const shouldShowCompletionFooter = isAi && isComplete
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
    
    // Add copy button first if there's content to copy
    const hasContent = (blocks && blocks.length > 0) || (content && content.trim().length > 0)
    if (hasContent) {
      footerItems.push({
        key: 'copy',
        node: <CopyIconButton blocks={blocks} content={content} />,
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

  return (
    <box
      style={{
        flexDirection: 'column',
        width: '100%',
      }}
    >
      {/* User message timestamp with error indicator button */}
      {isUser && (
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
              onMouseOver={() => setIsErrorButtonHovered(true)}
              onMouseOut={() => setIsErrorButtonHovered(false)}
            >
              <text
                style={{
                  fg: 'red',
                  wrapMode: 'none',
                }}
              >
                [!]
              </text>
            </Button>
          )}
        </box>
      )}
      
      {/* Show validation popover below timestamp when expanded */}
      {isUser && validationErrors && validationErrors.length > 0 && showValidationPopover && (
        <box style={{ paddingTop: 1, paddingBottom: 1 }}>
          <ValidationErrorPopover
            errors={validationErrors}
            onOpenFeedback={onOpenFeedback}
            onClose={() => setShowValidationPopover(false)}
          />
        </box>
      )}
      
      {blocks ? (
        <box style={{ flexDirection: 'column', gap: 0, width: '100%', paddingTop: 0 }}>
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
          />
        </box>
      ) : (
        <SimpleContent
          content={content}
          messageId={messageId}
          isLoading={isLoading}
          isComplete={isComplete}
          isUser={isUser}
          textColor={resolvedTextColor}
          codeBlockWidth={markdownOptions.codeBlockWidth}
          palette={markdownOptions.palette}
        />
      )}
      {isAi && (
        <>
          {renderLoadingTimer()}
          {renderCompletionFooter()}
        </>
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

  return (
    b.textType === 'reasoning' ||
    (b.color !== undefined &&
      typeof b.color === 'string' &&
      (b.color.toLowerCase() === 'grey' || b.color.toLowerCase() === 'gray'))
  )
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
      return true
    default:
      return false
  }
}

interface AgentBodyProps {
  agentBlock: Extract<ContentBlock, { type: 'agent' }>
  indentLevel: number
  keyPrefix: string
  parentIsStreaming: boolean
  availableWidth: number
  markdownPalette: MarkdownPalette
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
}

const AgentBody = memo(
  ({
    agentBlock,
    indentLevel,
    keyPrefix,
    parentIsStreaming,
    availableWidth,
    markdownPalette,
    streamingAgents,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
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
            key={`${keyPrefix}-thinking-${start}`}
            blocks={reasoningBlocks}
            keyPrefix={keyPrefix}
            startIndex={start}
            indentLevel={indentLevel}
            onToggleCollapsed={onToggleCollapsed}
            availableWidth={availableWidth}
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
          const markdownOptionsForLevel = getAgentMarkdownOptions(indentLevel)
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
                marginLeft: Math.max(0, indentLevel * 2),
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
              indentLevel={indentLevel}
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
          nodes.push(
            <AgentBranchWrapper
              key={`${keyPrefix}-agent-${nestedIdx}`}
              agentBlock={agentBlock}
              indentLevel={indentLevel}
              keyPrefix={`${keyPrefix}-agent-${nestedIdx}`}
              availableWidth={availableWidth}
              markdownPalette={markdownPalette}
              streamingAgents={streamingAgents}
              onToggleCollapsed={onToggleCollapsed}
              onBuildFast={onBuildFast}
              onBuildMax={onBuildMax}
              siblingBlocks={nestedBlocks}
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
  indentLevel: number
  keyPrefix: string
  availableWidth: number
  markdownPalette: MarkdownPalette
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  siblingBlocks?: ContentBlock[]
}

const AgentBranchWrapper = memo(
  ({
    agentBlock,
    indentLevel,
    keyPrefix,
    availableWidth,
    markdownPalette,
    streamingAgents,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
    siblingBlocks,
  }: AgentBranchWrapperProps) => {
    const theme = useTheme()

    if (shouldRenderAsSimpleText(agentBlock.agentType)) {
      const isStreaming =
        agentBlock.status === 'running' ||
        streamingAgents.has(agentBlock.agentId)
      const isComplete = agentBlock.status === 'complete'
      const statusIndicator = isStreaming ? '●' : isComplete ? '✓' : '○'
      const statusColor = isStreaming
        ? theme.primary
        : isComplete
          ? theme.foreground
          : theme.muted

      let statusText = 'Selecting best'
      let reason: string | undefined

      // If complete, try to show which implementation was selected
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
            (b) => b.type === 'agent' && isImplementorAgent(b.agentType),
          ) as AgentContentBlock[]

          const selectedAgent = implementors[letterIndex]
          if (selectedAgent) {
            const index = getImplementorIndex(
              selectedAgent.agentId,
              selectedAgent.agentType,
              siblingBlocks,
            )
            const name = getImplementorDisplayName(
              selectedAgent.agentType,
              index,
            )
            statusText = `Selected ${name}`
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

    // Render implementor agents as simple tool calls
    if (isImplementorAgent(agentBlock.agentType)) {
      const isStreaming =
        agentBlock.status === 'running' ||
        streamingAgents.has(agentBlock.agentId)
      const isComplete = agentBlock.status === 'complete'
      const isFailed = agentBlock.status === 'failed'
      const implementorIndex = siblingBlocks
        ? getImplementorIndex(
            agentBlock.agentId,
            agentBlock.agentType,
            siblingBlocks,
          )
        : undefined
      const displayName = getImplementorDisplayName(
        agentBlock.agentType,
        implementorIndex,
      )
      const statusIndicator = isStreaming
        ? '●'
        : isFailed
          ? '✗'
          : isComplete
            ? '✓'
            : '○'
      const statusColor = isStreaming
        ? theme.primary
        : isFailed
          ? 'red'
          : isComplete
            ? theme.foreground
            : theme.muted

      return (
        <box
          key={keyPrefix}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <text style={{ wrapMode: 'word' }}>
            <span fg={statusColor}>{statusIndicator}</span>
            <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
              {' '}
              {displayName}
            </span>
          </text>
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
    const isFailed = agentBlock.status === 'failed'
    const statusLabel = isActive
      ? 'running'
      : agentBlock.status === 'complete'
        ? 'completed'
        : isFailed
          ? 'failed'
          : agentBlock.status
    const statusColor = isActive
      ? theme.primary
      : isFailed
        ? 'red'
        : theme.muted
    const statusIndicator = isActive ? '●' : isFailed ? '✗' : '✓'

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
            indentLevel={indentLevel + 1}
            keyPrefix={keyPrefix}
            parentIsStreaming={isStreaming}
            availableWidth={availableWidth}
            markdownPalette={markdownPalette}
            streamingAgents={streamingAgents}
            onToggleCollapsed={onToggleCollapsed}
            onBuildFast={onBuildFast}
            onBuildMax={onBuildMax}
          />
        </AgentBranchItem>
      </box>
    )
  },
)

interface SimpleContentProps {
  content: string
  messageId: string
  isLoading: boolean
  isComplete?: boolean
  isUser: boolean
  textColor: string
  codeBlockWidth: number
  palette: MarkdownPalette
}

const SimpleContent = memo(
  ({
    content,
    messageId,
    isLoading,
    isComplete,
    isUser,
    textColor,
    codeBlockWidth,
    palette,
  }: SimpleContentProps) => {
    const isStreamingMessage = isLoading || !isComplete
    const normalizedContent = isStreamingMessage
      ? trimTrailingNewlines(content)
      : content.trim()

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

      case 'agent': {
        return (
          <AgentBranchWrapper
            key={`${messageId}-agent-${block.agentId}`}
            agentBlock={block}
            indentLevel={0}
            keyPrefix={`${messageId}-agent-${block.agentId}`}
            availableWidth={availableWidth}
            markdownPalette={markdownPalette}
            streamingAgents={streamingAgents}
            onToggleCollapsed={onToggleCollapsed}
            onBuildFast={onBuildFast}
            onBuildMax={onBuildMax}
            siblingBlocks={blocks}
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
  }: BlocksRendererProps) => {
    const nodes: React.ReactNode[] = []

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
            key={`${messageId}-thinking-${start}`}
            blocks={reasoningBlocks}
            keyPrefix={messageId}
            startIndex={start}
            indentLevel={0}
            onToggleCollapsed={onToggleCollapsed}
            availableWidth={availableWidth}
          />,
        )
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
            indentLevel={0}
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
        />,
      )
      i++
    }
    return nodes
  },
)
