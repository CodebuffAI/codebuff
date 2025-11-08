import { pluralize } from '@codebuff/common/util/string'
import { TextAttributes } from '@opentui/core'
import React, { memo, type ReactNode } from 'react'

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

import type { ContentBlock } from '../types/chat'
import type { ThemeColor } from '../types/theme-system'

const trimTrailingNewlines = (value: string): string =>
  value.replace(/[\r\n]+$/g, '')

const sanitizePreview = (value: string): string =>
  value.replace(/[#*_`~\[\]()]/g, '').trim()

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
}

export const MessageBlock = memo(
  ({
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
  }: MessageBlockProps): ReactNode => {
    const theme = useTheme()
    const resolvedTextColor = textColor ?? theme.foreground

    const renderContentWithMarkdown = (
      rawContent: string,
      isStreaming: boolean,
      options: { codeBlockWidth: number; palette: MarkdownPalette },
    ): ReactNode => {
      if (!hasMarkdown(rawContent)) {
        return rawContent
      }
      if (isStreaming) {
        return renderStreamingMarkdown(rawContent, options)
      }
      return renderMarkdown(rawContent, options)
    }

    const getToolFinishedPreview = (
      toolBlock: Extract<ContentBlock, { type: 'tool' }>,
      commandPreview: string | null,
      lastLine: string,
    ): string => {
      if (commandPreview) {
        return commandPreview
      }

      if (toolBlock.toolName === 'run_terminal_command' && toolBlock.output) {
        const outputLines = toolBlock.output
          .split('\n')
          .filter((line) => line.trim())
        const lastThreeLines = outputLines.slice(-3)
        const hasMoreLines = outputLines.length > 3
        return hasMoreLines
          ? '...\n' + lastThreeLines.join('\n')
          : lastThreeLines.join('\n')
      }

      return sanitizePreview(lastLine)
    }

    const getAgentMarkdownOptions = (indentLevel: number) => {
      const indentationOffset = indentLevel * 2

      return {
        codeBlockWidth: Math.max(10, availableWidth - 12 - indentationOffset),
        palette: {
          ...markdownPalette,
          codeTextFg: theme.foreground,
        },
      }
    }

    const renderToolBranch = (
      toolBlock: Extract<ContentBlock, { type: 'tool' }>,
      indentLevel: number,
      keyPrefix: string,
    ): React.ReactNode => {
      if (toolBlock.toolName === 'end_turn') {
        return null
      }
      if (
        'includeToolCall' in toolBlock &&
        toolBlock.includeToolCall === false
      ) {
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
        typeof (toolBlock.input as any).command === 'string'
          ? `$ ${(toolBlock.input as any).command.trim()}`
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
      const finishedPreview = !isStreaming
        ? toolRenderConfig.collapsedPreview ??
          getToolFinishedPreview(toolBlock, commandPreview, lastLine)
        : ''
      const agentMarkdownOptions = getAgentMarkdownOptions(indentLevel)
      const displayContent = renderContentWithMarkdown(
        fullContent,
        false,
        agentMarkdownOptions,
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
              onToggle={() => onToggleCollapsed(toolBlock.toolCallId)}
              titleSuffix={toolRenderConfig.path}
            />
          )}
        </box>
      )
    }

    function renderAgentBranch(
      agentBlock: Extract<ContentBlock, { type: 'agent' }>,
      indentLevel: number,
      keyPrefix: string,
    ): React.ReactNode {
      const isCollapsed = collapsedAgents.has(agentBlock.agentId)
      const isStreaming =
        agentBlock.status === 'running' ||
        streamingAgents.has(agentBlock.agentId)

      const allTextContent =
        agentBlock.blocks
          ?.filter((nested) => nested.type === 'text')
          .map((nested) => (nested as any).content)
          .join('') || ''
      const lines = allTextContent.split('\n').filter((line) => line.trim())
      const firstLine = lines[0] || ''

      let streamingPreview = ''
      if (isStreaming) {
        streamingPreview = agentBlock.initialPrompt
          ? sanitizePreview(agentBlock.initialPrompt)
          : `${sanitizePreview(firstLine)}...`
      }

      const finishedPreview =
        !isStreaming && isCollapsed && agentBlock.initialPrompt
          ? sanitizePreview(agentBlock.initialPrompt)
          : ''

      const childNodes = renderAgentBody(
        agentBlock,
        indentLevel + 1,
        keyPrefix,
        isStreaming,
      )

      const displayContent =
        childNodes.length > 0 ? (
          <box style={{ flexDirection: 'column', gap: 0 }}>{childNodes}</box>
        ) : null
      const isActive = isStreaming || agentBlock.status === 'running'
      const statusLabel = isActive
        ? 'running'
        : agentBlock.status === 'complete'
          ? 'completed'
          : agentBlock.status
      const statusColor = isActive ? theme.primary : theme.muted
      const statusIndicator = isActive ? '●' : '✓'

      return (
        <box key={keyPrefix} style={{ flexDirection: 'column', gap: 0 }}>
          <AgentBranchItem
            name={agentBlock.agentName}
            content={displayContent}
            prompt={agentBlock.initialPrompt}
            agentId={agentBlock.agentId}
            isCollapsed={isCollapsed}
            isStreaming={isStreaming}
            streamingPreview={streamingPreview}
            finishedPreview={finishedPreview}
            statusLabel={statusLabel ?? undefined}
            statusColor={statusColor}
            statusIndicator={statusIndicator}
            onToggle={() => onToggleCollapsed(agentBlock.agentId)}
          />
        </box>
      )
    }

    function renderAgentListBranch(
      agentListBlock: Extract<ContentBlock, { type: 'agent-list' }>,
      keyPrefix: string,
    ): React.ReactNode {
      const isCollapsed = collapsedAgents.has(agentListBlock.id)
      const { agents } = agentListBlock

      const sortedAgents = [...agents].sort((a, b) => {
        // Sort by displayName first (empty string if missing), then by ID as tiebreaker
        const displayNameComparison = (a.displayName || '')
          .toLowerCase()
          .localeCompare((b.displayName || '').toLowerCase())

        return (
          displayNameComparison ||
          a.id.toLowerCase().localeCompare(b.id.toLowerCase())
        )
      })

      const agentCount = sortedAgents.length

      const formatIdentifier = (agent: { id: string; displayName: string }) =>
        agent.displayName && agent.displayName !== agent.id
          ? `${agent.displayName} (${agent.id})`
          : agent.displayName || agent.id

      const renderAgentListItem = (
        agent: { id: string; displayName: string },
        idx: number,
      ) => {
        const identifier = formatIdentifier(agent)
        return (
          <text
            key={`agent-${idx}`}
            style={{ wrapMode: 'word', fg: theme.foreground }}
          >
            {`• ${identifier}`}
          </text>
        )
      }

      const agentListContent = (
        <box style={{ flexDirection: 'column', gap: 0 }}>
          {sortedAgents.map(renderAgentListItem)}
        </box>
      )

      const headerText = pluralize(agentCount, 'local agent')
      return (
        <box key={keyPrefix}>
          <ToolCallItem
            name={headerText}
            content={agentListContent}
            isCollapsed={isCollapsed}
            isStreaming={false}
            streamingPreview=""
            finishedPreview=""
            onToggle={() => onToggleCollapsed(agentListBlock.id)}
            dense
          />
        </box>
      )
    }

    function renderAgentBody(
      agentBlock: Extract<ContentBlock, { type: 'agent' }>,
      indentLevel: number,
      keyPrefix: string,
      parentIsStreaming: boolean,
    ): React.ReactNode[] {
      const nestedBlocks = agentBlock.blocks ?? []
      const nodes: React.ReactNode[] = []

      for (let nestedIdx = 0; nestedIdx < nestedBlocks.length; ) {
        const nestedBlock = nestedBlocks[nestedIdx]
        switch (nestedBlock.type) {
          case 'text': {
            const nestedStatus =
              typeof (nestedBlock as any).status === 'string'
                ? (nestedBlock as any).status
                : undefined
            const isNestedStreamingText =
              parentIsStreaming || nestedStatus === 'running'
            const rawNestedContent = isNestedStreamingText
              ? trimTrailingNewlines(nestedBlock.content)
              : nestedBlock.content.trim()
            const renderKey = `${keyPrefix}-text-${nestedIdx}`
            const markdownOptionsForLevel = getAgentMarkdownOptions(indentLevel)
            const renderedContent = renderContentWithMarkdown(
              rawNestedContent,
              isNestedStreamingText,
              markdownOptionsForLevel,
            )
            const marginTop = nestedBlock.marginTop ?? 0
            const marginBottom = nestedBlock.marginBottom ?? 0
            const explicitColor =
              typeof (nestedBlock as any).color === 'string'
                ? ((nestedBlock as any).color as string)
                : undefined
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
                {renderedContent}
              </text>,
            )
            nestedIdx++
            break
          }

          case 'html': {
            const marginTop = nestedBlock.marginTop ?? 0
            const marginBottom = nestedBlock.marginBottom ?? 0
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
                {nestedBlock.render({
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
            while (
              nestedIdx < nestedBlocks.length &&
              nestedBlocks[nestedIdx].type === 'tool'
            ) {
              toolGroup.push(nestedBlocks[nestedIdx] as any)
              nestedIdx++
            }

            const groupNodes = toolGroup.map((toolBlock, idxInGroup) => {
              return renderToolBranch(
                toolBlock,
                indentLevel,
                `${keyPrefix}-tool-${toolBlock.toolCallId}`,
              )
            })

            const nonNullGroupNodes = groupNodes.filter(
              Boolean,
            ) as React.ReactNode[]
            if (nonNullGroupNodes.length > 0) {
              const isRenderableBlock = (b: ContentBlock): boolean => {
                if (b.type === 'tool') {
                  return (b as any).toolName !== 'end_turn'
                }
                switch (b.type) {
                  case 'text':
                  case 'html':
                  case 'agent':
                  case 'agent-list':
                    return true
                  default:
                    return false
                }
              }

              // Check for any subsequent renderable blocks without allocating a slice
              let hasRenderableAfter = false
              for (let i = nestedIdx; i < nestedBlocks.length; i++) {
                if (isRenderableBlock(nestedBlocks[i] as any)) {
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
                    // Avoid double spacing with the agent header, which already
                    // adds bottom padding. Only add top margin if this group is
                    // not the first rendered child.
                    marginTop: nodes.length === 0 ? 0 : 1,
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
            nodes.push(
              renderAgentBranch(
                nestedBlock,
                indentLevel,
                `${keyPrefix}-agent-${nestedIdx}`,
              ),
            )
            nestedIdx++
            break
          }
        }
      }

      return nodes
    }

    const renderSimpleContent = () => {
      const isStreamingMessage = isLoading || !isComplete
      const normalizedContent = isStreamingMessage
        ? trimTrailingNewlines(content)
        : content.trim()
      const displayContent = renderContentWithMarkdown(
        normalizedContent,
        isStreamingMessage,
        markdownOptions,
      )
      return (
        <text
          key={`message-content-${messageId}`}
          style={{ wrapMode: 'word', fg: resolvedTextColor }}
        >
          {displayContent}
        </text>
      )
    }

    const renderSingleBlock = (block: ContentBlock, idx: number) => {
      switch (block.type) {
        case 'text': {
          const isStreamingText = isLoading || !isComplete
          const rawContent = isStreamingText
            ? trimTrailingNewlines(block.content)
            : block.content.trim()
          const renderKey = `${messageId}-text-${idx}`
          const renderedContent = renderContentWithMarkdown(
            rawContent,
            isStreamingText,
            markdownOptions,
          )
          const prevBlock = idx > 0 && blocks ? blocks[idx - 1] : null
          const marginTop =
            prevBlock &&
            (prevBlock.type === 'tool' || prevBlock.type === 'agent')
              ? 0
              : block.marginTop ?? 0
          const marginBottom = block.marginBottom ?? 0
          const explicitColor =
            typeof (block as any).color === 'string'
              ? ((block as any).color as string)
              : undefined
          const blockTextColor = explicitColor ?? resolvedTextColor
          return (
            <text
              key={renderKey}
              style={{
                wrapMode: 'word',
                fg: blockTextColor,
                marginTop,
                marginBottom,
              }}
            >
              {renderedContent}
            </text>
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
              {block.render({ textColor: resolvedTextColor, theme })}
            </box>
          )
        }

        case 'tool': {
          // Handled in renderBlocks grouping logic
          return null
        }

        case 'agent': {
          return renderAgentBranch(
            block,
            0,
            `${messageId}-agent-${block.agentId}`,
          )
        }

        case 'agent-list': {
          return renderAgentListBranch(
            block,
            `${messageId}-agent-list-${block.id}`,
          )
        }

        default:
          return null
      }
    }

    const renderBlocks = (sourceBlocks: ContentBlock[]) => {
      const nodes: React.ReactNode[] = []
      for (let i = 0; i < sourceBlocks.length; ) {
        const block = sourceBlocks[i]
        if (block.type === 'tool') {
          const start = i
          const group: Extract<ContentBlock, { type: 'tool' }>[] = []
          while (i < sourceBlocks.length && sourceBlocks[i].type === 'tool') {
            group.push(sourceBlocks[i] as any)
            i++
          }

          const groupNodes = group.map((toolBlock, idxInGroup) => {
            return renderToolBranch(
              toolBlock,
              0,
              `${messageId}-tool-${toolBlock.toolCallId}`,
            )
          })

          const nonNullGroupNodes = groupNodes.filter(
            Boolean,
          ) as React.ReactNode[]
          if (nonNullGroupNodes.length > 0) {
            // Check for any subsequent renderable blocks without allocating a slice
            let hasRenderableAfter = false
            for (let j = i; j < sourceBlocks.length; j++) {
              const b = sourceBlocks[j] as any
              if (b.type === 'tool') {
                if ((b as any).toolName !== 'end_turn') {
                  hasRenderableAfter = true
                  break
                }
              } else if (
                b.type === 'text' ||
                b.type === 'html' ||
                b.type === 'agent' ||
                b.type === 'agent-list'
              ) {
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
                  marginTop: 1,
                  marginBottom: hasRenderableAfter ? 1 : 0,
                }}
              >
                {nonNullGroupNodes}
              </box>,
            )
          }
          continue
        }

        nodes.push(renderSingleBlock(block, i))
        i++
      }
      return nodes
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
        {blocks ? (
          <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
            {renderBlocks(blocks)}
          </box>
        ) : (
          renderSimpleContent()
        )}
        {isAi && (
          <>
            {/* Show elapsed time while streaming */}
            {isLoading && !isComplete && (
              <text
                attributes={TextAttributes.DIM}
                style={{
                  wrapMode: 'none',
                  marginTop: 0,
                  marginBottom: 0,
                  alignSelf: 'flex-start',
                }}
              >
                <ElapsedTimer
                  startTime={timerStartTime}
                  attributes={TextAttributes.DIM}
                />
              </text>
            )}
            {/* Show completion time and credits when complete */}
            {isComplete && (
              <text
                attributes={TextAttributes.DIM}
                style={{
                  wrapMode: 'none',
                  fg: theme.secondary,
                  marginTop: 0,
                  marginBottom: 0,
                  alignSelf: 'flex-start',
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
  },
)
