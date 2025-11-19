import { TextAttributes } from '@opentui/core'
import React, { memo, type ReactNode } from 'react'

import { ThinkingBlock } from './thinking-block'
import { ContentWithMarkdown } from './content-with-markdown'
import { ToolBranch } from './tool-branch'
import { AgentBranchWrapper } from './agent-body'
import { AgentListBranch } from './agent-list-branch'
import { useTheme } from '../../hooks/use-theme'
import { isToolBlock } from '../../types/chat'

import type { ContentBlock, TextContentBlock } from '../../types/chat'
import type { MarkdownPalette } from '../../utils/markdown-renderer'

const trimTrailingNewlines = (value: string): string =>
  value.replace(/[\r\n]+$/g, '')

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

export interface SingleBlockProps {
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
        // Plan rendering remains in message-block via PlanBox; this block
        // is left here for completeness but actual PlanBox wiring is
        // handled at the message level.
        return null
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

export interface BlocksRendererProps {
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

export const BlocksRenderer = memo(
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
