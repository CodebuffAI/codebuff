import { TextAttributes } from '@opentui/core'
import React, { memo, useCallback, type ReactNode } from 'react'

import { AgentBranchItem } from '../agent-branch-item'
import { ThinkingBlock } from './thinking-block'
import { ContentWithMarkdown } from './content-with-markdown'
import { ToolBranch } from './tool-branch'
import { AgentListBranch } from './agent-list-branch'
import { useTheme } from '../../hooks/use-theme'
import { isTextBlock, isToolBlock } from '../../types/chat'

import type {
  ContentBlock,
  TextContentBlock,
  HtmlContentBlock,
  AgentContentBlock,
} from '../../types/chat'
import type { ThemeColor } from '../../types/theme-system'
import type { MarkdownPalette } from '../../utils/markdown-renderer'

const trimTrailingNewlines = (value: string): string =>
  value.replace(/[\r\n]+$/g, '')

const sanitizePreview = (value: string): string =>
  value.replace(/[#*_`~\[\]()]/g, '').trim()

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

export interface AgentBodyProps {
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

export const AgentBody = memo(
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
          const nestedTextColor: ThemeColor = explicitColor ?? theme.foreground
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
            />,
          )
          nestedIdx++
          break
        }

        case 'agent-list': {
          nodes.push(
            <AgentListBranch
              key={`${keyPrefix}-agent-list-${nestedIdx}`}
              agentListBlock={nestedBlock as any}
              keyPrefix={`${keyPrefix}-agent-list-${nestedIdx}`}
              onToggleCollapsed={onToggleCollapsed}
            />,
          )
          nestedIdx++
          break
        }

        default: {
          nestedIdx++
          break
        }
      }
    }

    return nodes
  },
)

export interface AgentBranchWrapperProps {
  agentBlock: Extract<ContentBlock, { type: 'agent' }>
  indentLevel: number
  keyPrefix: string
  availableWidth: number
  markdownPalette: MarkdownPalette
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
}

export const AgentBranchWrapper = memo(
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
  }: AgentBranchWrapperProps) => {
    const theme = useTheme()
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

    const nParameterMessage =
      agentBlock.params?.n !== undefined &&
      (agentBlock.agentType.includes('editor-best-of-n')
        ? `Generating ${agentBlock.params.n} implementations...`
        : agentBlock.agentType.includes('thinker-best-of-n')
          ? `Generating ${agentBlock.params.n} deep thoughts...`
          : undefined)

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
          {nParameterMessage && (
            <text
              style={{
                wrapMode: 'word',
                fg: theme.muted,
                marginBottom: 1,
              }}
              attributes={TextAttributes.ITALIC}
            >
              {nParameterMessage}
            </text>
          )}
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
