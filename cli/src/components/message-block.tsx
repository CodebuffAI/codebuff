import { TextAttributes } from '@opentui/core'
import React, { memo, useCallback, type ReactNode } from 'react'

import { AgentBranchItem } from './agent-branch-item'
import { ElapsedTimer } from './elapsed-timer'
import { useTheme } from '../hooks/use-theme'
import { useWhyDidYouUpdateById } from '../hooks/use-why-did-you-update'
import { isTextBlock, isToolBlock } from '../types/chat'
import { logger } from '../utils/logger'
import { type MarkdownPalette } from '../utils/markdown-renderer'

import type {
  ContentBlock,
  TextContentBlock,
  HtmlContentBlock,
  AgentContentBlock,
} from '../types/chat'
import type { ThemeColor } from '../types/theme-system'
import { ThinkingBlock } from './blocks/thinking-block'
import { ContentWithMarkdown } from './blocks/content-with-markdown'
import { ToolBranch } from './blocks/tool-branch'
import { PlanBox } from './renderers/plan-box'
import { AgentListBranch } from './blocks/agent-list-branch'

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
  collapsedAgents: Set<string>
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
}

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
    timerStartTime,
    textColor,
    timestampColor,
    markdownOptions,
    availableWidth,
    markdownPalette,
    collapsedAgents,
    autoCollapsedAgents,
    streamingAgents,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
    setCollapsedAgents,
    addAutoCollapsedAgent,
  } = props
  useWhyDidYouUpdateById('MessageBlock', messageId, props, {
    logLevel: 'debug',
    enabled: false,
  })

  const theme = useTheme()
  const resolvedTextColor = textColor ?? theme.foreground

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
      {blocks ? (
        <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
          <BlocksRenderer
            sourceBlocks={blocks}
            messageId={messageId}
            isLoading={isLoading}
            isComplete={isComplete}
            isUser={isUser}
            textColor={resolvedTextColor}
            availableWidth={availableWidth}
            markdownPalette={markdownPalette}
            collapsedAgents={collapsedAgents}
            autoCollapsedAgents={autoCollapsedAgents}
            streamingAgents={streamingAgents}
            onToggleCollapsed={onToggleCollapsed}
            onBuildFast={onBuildFast}
            onBuildMax={onBuildMax}
            setCollapsedAgents={setCollapsedAgents}
            addAutoCollapsedAgent={addAutoCollapsedAgent}
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
          {isLoading && !isComplete && (
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
          )}
          {isComplete && (
            <text
              attributes={TextAttributes.DIM}
              style={{
                wrapMode: 'none',
                fg: theme.secondary,
                marginTop: 0,
                marginBottom: 0,
                alignSelf: 'flex-end',
              }}
            >
              {completionTime}
              {credits && ` • ${credits} credits`}
            </text>
          )}
        </>
      )}
    </>
  )
})

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
  collapsedAgents: Set<string>
  autoCollapsedAgents: Set<string>
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  setCollapsedAgents: (value: (prev: Set<string>) => Set<string>) => void
  addAutoCollapsedAgent: (value: string) => void
}

interface AgentBodyProps {
  agentBlock: Extract<ContentBlock, { type: 'agent' }>
  indentLevel: number
  keyPrefix: string
  parentIsStreaming: boolean
  availableWidth: number
  markdownPalette: MarkdownPalette
  collapsedAgents: Set<string>
  autoCollapsedAgents: Set<string>
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  setCollapsedAgents: (value: (prev: Set<string>) => Set<string>) => void
  addAutoCollapsedAgent: (value: string) => void
}

const AgentBody = memo(
  ({
    agentBlock,
    indentLevel,
    keyPrefix,
    parentIsStreaming,
    availableWidth,
    markdownPalette,
    collapsedAgents,
    autoCollapsedAgents,
    streamingAgents,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
    setCollapsedAgents,
    addAutoCollapsedAgent,
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

        logger.info({}, `asdf agentbody ${keyPrefix}-thinking-${start}`)
        nodes.push(
          <ThinkingBlock
            key={`${keyPrefix}-thinking-${start}`}
            blocks={reasoningBlocks}
            keyPrefix={keyPrefix}
            startIndex={start}
            indentLevel={indentLevel}
            collapsedAgents={collapsedAgents}
            setCollapsedAgents={setCollapsedAgents}
            autoCollapsedAgents={autoCollapsedAgents}
            addAutoCollapsedAgent={addAutoCollapsedAgent}
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
              collapsedAgents={collapsedAgents}
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
              collapsedAgents={collapsedAgents}
              autoCollapsedAgents={autoCollapsedAgents}
              streamingAgents={streamingAgents}
              onToggleCollapsed={onToggleCollapsed}
              onBuildFast={onBuildFast}
              onBuildMax={onBuildMax}
              setCollapsedAgents={setCollapsedAgents}
              addAutoCollapsedAgent={addAutoCollapsedAgent}
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
  collapsedAgents: Set<string>
  autoCollapsedAgents: Set<string>
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  setCollapsedAgents: (value: (prev: Set<string>) => Set<string>) => void
  addAutoCollapsedAgent: (value: string) => void
}

const AgentBranchWrapper = memo(
  ({
    agentBlock,
    indentLevel,
    keyPrefix,
    availableWidth,
    markdownPalette,
    collapsedAgents,
    autoCollapsedAgents,
    streamingAgents,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
    setCollapsedAgents,
    addAutoCollapsedAgent,
  }: AgentBranchWrapperProps) => {
    const theme = useTheme()
    const isCollapsed = collapsedAgents.has(agentBlock.agentId)
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

    // Create a status message for editor-best-of-n agent
    const nParameterMessage =
      agentBlock.params?.n !== undefined &&
      agentBlock.agentType.includes('editor-best-of-n')
        ? `Generating ${agentBlock.params.n} implementations...`
        : undefined

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
            collapsedAgents={collapsedAgents}
            autoCollapsedAgents={autoCollapsedAgents}
            streamingAgents={streamingAgents}
            onToggleCollapsed={onToggleCollapsed}
            onBuildFast={onBuildFast}
            onBuildMax={onBuildMax}
            setCollapsedAgents={setCollapsedAgents}
            addAutoCollapsedAgent={addAutoCollapsedAgent}
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
  collapsedAgents: Set<string>
  autoCollapsedAgents: Set<string>
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  setCollapsedAgents: (value: (prev: Set<string>) => Set<string>) => void
  addAutoCollapsedAgent: (value: string) => void
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
    collapsedAgents,
    autoCollapsedAgents,
    streamingAgents,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
    setCollapsedAgents,
    addAutoCollapsedAgent,
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
            collapsedAgents={collapsedAgents}
            autoCollapsedAgents={autoCollapsedAgents}
            streamingAgents={streamingAgents}
            onToggleCollapsed={onToggleCollapsed}
            onBuildFast={onBuildFast}
            onBuildMax={onBuildMax}
            setCollapsedAgents={setCollapsedAgents}
            addAutoCollapsedAgent={addAutoCollapsedAgent}
          />
        )
      }

      case 'agent-list': {
        return (
          <AgentListBranch
            key={`${messageId}-agent-list-${block.id}`}
            agentListBlock={block}
            keyPrefix={`${messageId}-agent-list-${block.id}`}
            collapsedAgents={collapsedAgents}
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
  collapsedAgents: Set<string>
  autoCollapsedAgents: Set<string>
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  setCollapsedAgents: (value: (prev: Set<string>) => Set<string>) => void
  addAutoCollapsedAgent: (value: string) => void
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
    collapsedAgents,
    autoCollapsedAgents,
    streamingAgents,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
    setCollapsedAgents,
    addAutoCollapsedAgent,
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
            collapsedAgents={collapsedAgents}
            setCollapsedAgents={setCollapsedAgents}
            autoCollapsedAgents={autoCollapsedAgents}
            addAutoCollapsedAgent={addAutoCollapsedAgent}
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
            collapsedAgents={collapsedAgents}
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
          collapsedAgents={collapsedAgents}
          autoCollapsedAgents={autoCollapsedAgents}
          streamingAgents={streamingAgents}
          onToggleCollapsed={onToggleCollapsed}
          onBuildFast={onBuildFast}
          onBuildMax={onBuildMax}
          setCollapsedAgents={setCollapsedAgents}
          addAutoCollapsedAgent={addAutoCollapsedAgent}
        />,
      )
      i++
    }
    return nodes
  },
)
