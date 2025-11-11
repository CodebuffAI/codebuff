import { pluralize } from '@codebuff/common/util/string'
import { TextAttributes } from '@opentui/core'
import React, { memo, useCallback, useMemo, type ReactNode } from 'react'

import { AgentBranchItem } from './agent-branch-item'
import { ElapsedTimer } from './elapsed-timer'
import { renderToolComponent } from './tools/registry'
import { ToolCallItem } from './tools/tool-call-item'
import { useTheme } from '../hooks/use-theme'
import { getToolDisplayInfo } from '../utils/codebuff-client'
import {
  renderMarkdown,
  renderStreamingMarkdown,
  hasMarkdown,
  type MarkdownPalette,
} from '../utils/markdown-renderer'
import { BORDER_CHARS } from '../utils/ui-constants'
import { BuildModeButtons } from './build-mode-buttons'
import { Thinking } from './thinking'

import type { ContentBlock, TextContentBlock, HtmlContentBlock, AgentContentBlock } from '../types/chat'
import { isTextBlock, isToolBlock, isAgentBlock, isHtmlBlock } from '../types/chat'
import type { ThemeColor } from '../types/theme-system'
import { useWhyDidYouUpdateById } from '../hooks/use-why-did-you-update'

const trimTrailingNewlines = (value: string): string =>
  value.replace(/[\r\n]+$/g, '')

const sanitizePreview = (value: string): string =>
  value.replace(/[#*_`~\[\]()]/g, '').trim()

const isReasoningTextBlock = (
  b: ContentBlock | null | undefined
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
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
}

interface ContentWithMarkdownProps {
  content: string
  isStreaming: boolean
  codeBlockWidth: number
  palette: MarkdownPalette
}

const ContentWithMarkdown = memo(
  ({
    content,
    isStreaming,
    codeBlockWidth,
    palette,
  }: ContentWithMarkdownProps) => {
    if (!hasMarkdown(content)) {
      return content
    }
    const options = { codeBlockWidth, palette }
    if (isStreaming) {
      return renderStreamingMarkdown(content, options)
    }
    return renderMarkdown(content, options)
  },
)

interface PlanBoxProps {
  planContent: string
  availableWidth: number
  markdownPalette: MarkdownPalette
  onBuildFast: () => void
  onBuildMax: () => void
}

const PlanBox = memo(
  ({
    planContent,
    availableWidth,
    markdownPalette,
    onBuildFast,
    onBuildMax,
  }: PlanBoxProps) => {
    const theme = useTheme()

    return (
      <box
        style={{
          flexDirection: 'column',
          gap: 1,
          width: '100%',
          borderStyle: 'single',
          borderColor: theme.secondary,
          customBorderChars: BORDER_CHARS,
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 0,
          paddingBottom: 1,
        }}
      >
        <text style={{ wrapMode: 'word', fg: theme.foreground }}>
          {renderMarkdown(planContent, {
            codeBlockWidth: Math.max(10, availableWidth - 8),
            palette: markdownPalette,
          })}
        </text>
        <BuildModeButtons
          theme={theme}
          onBuildFast={onBuildFast}
          onBuildMax={onBuildMax}
        />
      </box>
    )
  },
)

interface ThinkingBlockProps {
  blocks: Extract<ContentBlock, { type: 'text' }>[]
  keyPrefix: string
  startIndex: number
  indentLevel: number
  collapsedAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  availableWidth: number
}

const ThinkingBlock = memo(
  ({
    blocks,
    keyPrefix,
    startIndex,
    indentLevel,
    collapsedAgents,
    onToggleCollapsed,
    availableWidth,
  }: ThinkingBlockProps) => {
    const thinkingId = `${keyPrefix}-thinking-${startIndex}`
    const combinedContent = blocks
      .map((b) => b.content)
      .join('')
      .trim()

    const isCollapsed = collapsedAgents.has(thinkingId)
    const marginLeft = Math.max(0, indentLevel * 2)
    const availWidth = Math.max(10, availableWidth - marginLeft - 4)

    const handleToggle = useCallback(() => {
      onToggleCollapsed(thinkingId)
    }, [onToggleCollapsed, thinkingId])

    if (!combinedContent) {
      return null
    }

    return (
      <box style={{ marginLeft }}>
        <Thinking
          content={combinedContent}
          isCollapsed={isCollapsed}
          onToggle={handleToggle}
          availableWidth={availWidth}
        />
      </box>
    )
  },
)

interface ToolBranchProps {
  toolBlock: Extract<ContentBlock, { type: 'tool' }>
  indentLevel: number
  keyPrefix: string
  availableWidth: number
  collapsedAgents: Set<string>
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  markdownPalette: MarkdownPalette
}

const ToolBranch = memo(
  ({
    toolBlock,
    indentLevel,
    keyPrefix,
    availableWidth,
    collapsedAgents,
    streamingAgents,
    onToggleCollapsed,
    markdownPalette,
  }: ToolBranchProps) => {
    const theme = useTheme()

    if (toolBlock.toolName === 'end_turn') {
      return null
    }
    if ('includeToolCall' in toolBlock && toolBlock.includeToolCall === false) {
      return null
    }

    const displayInfo = getToolDisplayInfo(toolBlock.toolName)
    const isCollapsed = collapsedAgents.has(toolBlock.toolCallId)
    const isStreaming = streamingAgents.has(toolBlock.toolCallId)

    const inputContent = `\`\`\`json\n${JSON.stringify(toolBlock.input, null, 2)}\n\`\`\``
    const codeBlockLang =
      toolBlock.toolName === 'run_terminal_command' ? '' : 'yaml'
    const resultContent = toolBlock.output
      ? `\n\n**Result:**\n\`\`\`${codeBlockLang}\n${toolBlock.output}\n\`\`\``
      : ''
    const fullContent = inputContent + resultContent

    const lines = fullContent.split('\n').filter((line) => line.trim())
    const firstLine = lines[0] || ''
    const lastLine = lines[lines.length - 1] || firstLine
    const commandPreview =
      toolBlock.toolName === 'run_terminal_command' &&
      toolBlock.input &&
      typeof toolBlock.input === 'object' &&
      'command' in toolBlock.input &&
      typeof toolBlock.input.command === 'string'
        ? `$ ${toolBlock.input.command.trim()}`
        : null

    const toolRenderConfig =
      renderToolComponent(toolBlock, theme, {
        availableWidth,
        indentationOffset: 0,
        previewPrefix: '',
        labelWidth: 0,
      }) ?? {}

    const streamingPreview = isStreaming
      ? commandPreview ?? `${sanitizePreview(firstLine)}...`
      : ''

    const getToolFinishedPreview = useCallback(
      (commandPrev: string | null, lastLn: string): string => {
        if (commandPrev) {
          return commandPrev
        }

        if (toolBlock.toolName === 'run_terminal_command' && toolBlock.output) {
          const outputLines = toolBlock.output
            .split('\n')
            .filter((line) => line.trim())
          const lastThreeLines = outputLines.slice(-3)
          const hasMoreLines = outputLines.length > 3
          const preview = lastThreeLines.join('\n')
          return hasMoreLines ? `...\n${preview}` : preview
        }

        return sanitizePreview(lastLn)
      },
      [toolBlock],
    )

    const finishedPreview = !isStreaming
      ? toolRenderConfig.collapsedPreview ??
        getToolFinishedPreview(commandPreview, lastLine)
      : ''

    const indentationOffset = indentLevel * 2
    const agentMarkdownOptions = {
      codeBlockWidth: Math.max(10, availableWidth - 12 - indentationOffset),
      palette: {
        ...markdownPalette,
        codeTextFg: theme.foreground,
      },
    }

    const displayContent = (
      <ContentWithMarkdown
        content={fullContent}
        isStreaming={false}
        codeBlockWidth={agentMarkdownOptions.codeBlockWidth}
        palette={agentMarkdownOptions.palette}
      />
    )

    const renderableDisplayContent =
      displayContent === null ||
      displayContent === undefined ||
      displayContent === false ||
      displayContent === '' ? null : (
        <text
          fg={theme.foreground}
          style={{ wrapMode: 'word' }}
          attributes={
            theme.messageTextAttributes && theme.messageTextAttributes !== 0
              ? theme.messageTextAttributes
              : undefined
          }
        >
          {displayContent}
        </text>
      )

    const headerName = displayInfo.name

    const handleToggle = useCallback(() => {
      onToggleCollapsed(toolBlock.toolCallId)
    }, [onToggleCollapsed, toolBlock.toolCallId])

    return (
      <box key={keyPrefix}>
        {toolRenderConfig.content ? (
          toolRenderConfig.content
        ) : (
          <ToolCallItem
            name={headerName}
            content={renderableDisplayContent}
            isCollapsed={isCollapsed}
            isStreaming={isStreaming}
            streamingPreview={streamingPreview}
            finishedPreview={finishedPreview}
            onToggle={handleToggle}
            titleSuffix={toolRenderConfig.path}
          />
        )}
      </box>
    )
  },
)

interface AgentListBranchProps {
  agentListBlock: Extract<ContentBlock, { type: 'agent-list' }>
  keyPrefix: string
  collapsedAgents: Set<string>
  onToggleCollapsed: (id: string) => void
}

const AgentListBranch = memo(
  ({
    agentListBlock,
    keyPrefix,
    collapsedAgents,
    onToggleCollapsed,
  }: AgentListBranchProps) => {
    const theme = useTheme()
    const isCollapsed = collapsedAgents.has(agentListBlock.id)
    const { agents } = agentListBlock

    const sortedAgents = [...agents].sort((a, b) => {
      const displayNameComparison = (a.displayName || '')
        .toLowerCase()
        .localeCompare((b.displayName || '').toLowerCase())

      return (
        displayNameComparison ||
        a.id.toLowerCase().localeCompare(b.id.toLowerCase())
      )
    })

    const agentCount = sortedAgents.length

    const formatIdentifier = useCallback(
      (agent: { id: string; displayName: string }) =>
        agent.displayName && agent.displayName !== agent.id
          ? `${agent.displayName} (${agent.id})`
          : agent.displayName || agent.id,
      [],
    )

    const headerText = pluralize(agentCount, 'local agent')

    const handleToggle = useCallback(() => {
      onToggleCollapsed(agentListBlock.id)
    }, [onToggleCollapsed, agentListBlock.id])

    return (
      <box key={keyPrefix}>
        <ToolCallItem
          name={headerText}
          content={
            <box style={{ flexDirection: 'column', gap: 0 }}>
              {sortedAgents.map((agent, idx) => {
                const identifier = formatIdentifier(agent)
                return (
                  <text
                    key={`agent-${idx}`}
                    style={{ wrapMode: 'word', fg: theme.foreground }}
                  >
                    {`• ${identifier}`}
                  </text>
                )
              })}
            </box>
          }
          isCollapsed={isCollapsed}
          isStreaming={false}
          streamingPreview=""
          finishedPreview=""
          onToggle={handleToggle}
          dense
        />
      </box>
    )
  },
)

interface AgentBodyProps {
  agentBlock: Extract<ContentBlock, { type: 'agent' }>
  indentLevel: number
  keyPrefix: string
  parentIsStreaming: boolean
  availableWidth: number
  markdownPalette: MarkdownPalette
  collapsedAgents: Set<string>
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
    collapsedAgents,
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
            collapsedAgents={collapsedAgents}
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
              start > 0 &&
              isRenderableTimelineBlock(nestedBlocks[start - 1])
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
              streamingAgents={streamingAgents}
              onToggleCollapsed={onToggleCollapsed}
              onBuildFast={onBuildFast}
              onBuildMax={onBuildMax}
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
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
}

const AgentBranchWrapper = memo(
  ({
    agentBlock,
    indentLevel,
    keyPrefix,
    availableWidth,
    markdownPalette,
    collapsedAgents,
    streamingAgents,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
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
    const statusLabel = isActive
      ? 'running'
      : agentBlock.status === 'complete'
        ? 'completed'
        : agentBlock.status
    const statusColor = isActive ? theme.primary : theme.muted
    const statusIndicator = isActive ? '●' : '✓'

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
            collapsedAgents={collapsedAgents}
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
  collapsedAgents: Set<string>
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
    collapsedAgents,
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
            collapsedAgents={collapsedAgents}
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
    collapsedAgents,
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
            collapsedAgents={collapsedAgents}
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
            start > 0 &&
            isRenderableTimelineBlock(sourceBlocks[start - 1])
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
    streamingAgents,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
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
