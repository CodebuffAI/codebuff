import { TextAttributes } from '@opentui/core'
import React, { memo, useCallback, useMemo, useRef, type ReactNode } from 'react'

import { AgentBlockGrid } from './agent-block-grid'
import { AgentBranchItem } from './agent-branch-item'
import { ImplementorGroup } from './implementor-row'
import { ToolBlockGroup } from './tool-block-group'
import { ContentWithMarkdown } from './content-with-markdown'
import { ThinkingBlock } from './thinking-block'
import { trimTrailingNewlines, sanitizePreview } from './block-helpers'
import { useTheme } from '../../hooks/use-theme'
import { useChatStore } from '../../state/chat-store'
import { AGENT_CONTENT_HORIZONTAL_PADDING } from '../../utils/layout-helpers'
import { shouldRenderAsSimpleText } from '../../utils/constants'
import { isImplementorAgent, getImplementorIndex } from '../../utils/implementor-helpers'
import { processBlocks, type BlockProcessorHandlers } from '../../utils/block-processor'
import { getAgentStatusInfo } from '../../utils/agent-helpers'
import { extractHtmlBlockMargins } from '../../utils/block-margins'
import { isTextBlock } from '../../types/chat'
import type {
  AgentContentBlock,
  ContentBlock,
  TextContentBlock,
  HtmlContentBlock,
} from '../../types/chat'
import type { MarkdownPalette } from '../../utils/markdown-renderer'

interface AgentBodyProps {
  agentBlock: Extract<ContentBlock, { type: 'agent' }>
  keyPrefix: string
  parentIsStreaming: boolean
  availableWidth: number
  markdownPalette: MarkdownPalette
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  isLastMessage?: boolean
}

/** Props stored in ref for stable handler access in AgentBody */
interface AgentBodyPropsRef {
  keyPrefix: string
  nestedBlocks: ContentBlock[]
  parentIsStreaming: boolean
  availableWidth: number
  markdownPalette: MarkdownPalette
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  isLastMessage?: boolean
  theme: ReturnType<typeof useTheme>
  getAgentMarkdownOptions: (indent: number) => { codeBlockWidth: number; palette: MarkdownPalette }
}

const AgentBody = memo(
  ({
    agentBlock,
    keyPrefix,
    parentIsStreaming,
    availableWidth,
    markdownPalette,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
    isLastMessage,
  }: AgentBodyProps): ReactNode[] => {
    const theme = useTheme()
    const nestedBlocks = agentBlock.blocks ?? []

    const getAgentMarkdownOptions = useCallback(
      (indent: number) => {
        const indentationOffset = indent * 2
        return {
          codeBlockWidth: Math.max(
            10,
            availableWidth - AGENT_CONTENT_HORIZONTAL_PADDING - indentationOffset,
          ),
          palette: {
            ...markdownPalette,
            codeTextFg: theme.foreground,
          },
        }
      },
      [availableWidth, markdownPalette, theme.foreground],
    )

    // Store props in ref for stable handler access (avoids 12+ useMemo dependencies)
    const propsRef = useRef<AgentBodyPropsRef>(null!)
    propsRef.current = {
      keyPrefix,
      nestedBlocks,
      parentIsStreaming,
      availableWidth,
      markdownPalette,
      onToggleCollapsed,
      onBuildFast,
      onBuildMax,
      isLastMessage,
      theme,
      getAgentMarkdownOptions,
    }

    // Handlers are stable (empty deps) and read latest props from ref
    const handlers: BlockProcessorHandlers = useMemo(
      () => ({
        onReasoningGroup: (reasoningBlocks, startIndex) => {
          const p = propsRef.current
          return (
            <ThinkingBlock
              key={reasoningBlocks[0]?.thinkingId ?? `${p.keyPrefix}-thinking-${startIndex}`}
              blocks={reasoningBlocks}
              onToggleCollapsed={p.onToggleCollapsed}
              availableWidth={p.availableWidth}
              isNested={true}
            />
          )
        },

        onToolGroup: (toolBlocks, startIndex, nextIndex) => {
          const p = propsRef.current
          return (
            <ToolBlockGroup
              key={`${p.keyPrefix}-tool-group-${startIndex}`}
              toolBlocks={toolBlocks}
              keyPrefix={p.keyPrefix}
              startIndex={startIndex}
              nextIndex={nextIndex}
              siblingBlocks={p.nestedBlocks}
              availableWidth={p.availableWidth}
              onToggleCollapsed={p.onToggleCollapsed}
              markdownPalette={p.markdownPalette}
            />
          )
        },

        onImplementorGroup: (implementors, startIndex) => {
          const p = propsRef.current
          return (
            <ImplementorGroup
              key={`${p.keyPrefix}-implementor-group-${startIndex}`}
              implementors={implementors}
              siblingBlocks={p.nestedBlocks}
              availableWidth={p.availableWidth}
            />
          )
        },

        onAgentGroup: (agentBlocks, startIndex) => {
          const p = propsRef.current
          return (
            <AgentBlockGrid
              key={`${p.keyPrefix}-agent-grid-${startIndex}`}
              agentBlocks={agentBlocks}
              keyPrefix={`${p.keyPrefix}-agent-grid-${startIndex}`}
              availableWidth={p.availableWidth}
              renderAgentBranch={(innerAgentBlock, prefix, width) => (
                <AgentBranchWrapper
                  agentBlock={innerAgentBlock}
                  keyPrefix={prefix}
                  availableWidth={width}
                  markdownPalette={p.markdownPalette}
                  onToggleCollapsed={p.onToggleCollapsed}
                  onBuildFast={p.onBuildFast}
                  onBuildMax={p.onBuildMax}
                  siblingBlocks={p.nestedBlocks}
                  isLastMessage={p.isLastMessage}
                />
              )}
            />
          )
        },

        onSingleBlock: (block, index) => {
          const p = propsRef.current
          if (block.type === 'text') {
            const textBlock = block as TextContentBlock
            const nestedStatus = textBlock.status
            const isNestedStreamingText = p.parentIsStreaming || nestedStatus === 'running'
            const filteredNestedContent = isNestedStreamingText
              ? trimTrailingNewlines(textBlock.content)
              : textBlock.content.trim()
            const markdownOptionsForLevel = p.getAgentMarkdownOptions(0)
            const marginTop = textBlock.marginTop ?? 0
            const marginBottom = textBlock.marginBottom ?? 0
            const explicitColor = textBlock.color
            const nestedTextColor = explicitColor ?? p.theme.foreground

            return (
              <text
                key={`${p.keyPrefix}-text-${index}`}
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
              </text>
            )
          }

          if (block.type === 'html') {
            const htmlBlock = block as HtmlContentBlock
            const { marginTop, marginBottom } = extractHtmlBlockMargins(htmlBlock)

            return (
              <box
                key={`${p.keyPrefix}-html-${index}`}
                style={{
                  flexDirection: 'column',
                  gap: 0,
                  marginTop,
                  marginBottom,
                }}
              >
                {htmlBlock.render({
                  textColor: p.theme.foreground,
                  theme: p.theme,
                })}
              </box>
            )
          }

          // Fallback for unknown block types
          return null
        },
      }),
      [], // Empty deps - handlers read from propsRef.current
    )

    return processBlocks(nestedBlocks, handlers) as ReactNode[]
  },
)

export interface AgentBranchWrapperProps {
  agentBlock: Extract<ContentBlock, { type: 'agent' }>
  keyPrefix: string
  availableWidth: number
  markdownPalette: MarkdownPalette
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  siblingBlocks?: ContentBlock[]
  isLastMessage?: boolean
}

export const AgentBranchWrapper = memo(
  ({
    agentBlock,
    keyPrefix,
    availableWidth,
    markdownPalette,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
    siblingBlocks,
    isLastMessage,
  }: AgentBranchWrapperProps) => {
    const theme = useTheme()
    // Derive streaming boolean for this specific agent to avoid re-renders when other agents change
    const agentIsStreaming = useChatStore((state) => state.streamingAgents.has(agentBlock.agentId))

    if (shouldRenderAsSimpleText(agentBlock.agentType)) {
      const isStreaming = agentBlock.status === 'running' || agentIsStreaming

      const effectiveStatus = isStreaming ? 'running' : agentBlock.status
      const { indicator: statusIndicator, color: statusColor } =
        getAgentStatusInfo(effectiveStatus, theme)

      let statusText = 'Selecting best'
      let reason: string | undefined

      const isComplete = agentBlock.status === 'complete'
      if (isComplete && siblingBlocks) {
        const blocks = agentBlock.blocks ?? []
        const lastBlock = blocks[blocks.length - 1] as
          | { input: { implementationId: string; reason: string } }
          | undefined
        const implementationId = lastBlock?.input?.implementationId
        if (implementationId) {
          const letterIndex = implementationId.charCodeAt(0) - 65
          const implementors = siblingBlocks.filter(
            (b): b is AgentContentBlock =>
              b.type === 'agent' && isImplementorAgent(b),
          )

          const selectedAgent = implementors[letterIndex]
          if (selectedAgent) {
            const index = getImplementorIndex(selectedAgent, siblingBlocks)
            statusText =
              index !== undefined
                ? `Selected Strategy #${index + 1}`
                : 'Selected'
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
    const isStreaming = agentBlock.status === 'running' || agentIsStreaming

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
    const { indicator: statusIndicator, label: statusLabel, color: statusColor } =
      getAgentStatusInfo(isActive ? 'running' : agentBlock.status, theme)

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
