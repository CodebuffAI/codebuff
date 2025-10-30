import { TextAttributes } from '@opentui/core'
import React, { type ReactNode } from 'react'

import { pluralize } from '@codebuff/common/util/string'

import { BranchItem } from './branch-item'
import { ToolItem, type ToolBranchMeta } from './tool-item'
import { getToolRenderConfig } from './tool-renderer'
import { getToolDisplayInfo } from '../utils/codebuff-client'
import {
  renderMarkdown,
  renderStreamingMarkdown,
  hasMarkdown,
  type MarkdownPalette,
} from '../utils/markdown-renderer'

import type { ContentBlock } from '../chat'
import type { ChatTheme } from '../utils/theme-system'

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
  theme: ChatTheme
  textColor: string
  timestampColor: string
  markdownOptions: { codeBlockWidth: number; palette: MarkdownPalette }
  availableWidth: number
  markdownPalette: MarkdownPalette
  collapsedAgents: Set<string>
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  registerAgentRef: (id: string, element: any) => void
}

export const MessageBlock = ({
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
  theme,
  textColor,
  timestampColor,
  markdownOptions,
  availableWidth,
  markdownPalette,
  collapsedAgents,
  streamingAgents,
  onToggleCollapsed,
  registerAgentRef,
}: MessageBlockProps): ReactNode => {
  const getAgentMarkdownOptions = (indentLevel: number) => {
    const indentationOffset = indentLevel * 2

    return {
      codeBlockWidth: Math.max(10, availableWidth - 12 - indentationOffset),
      palette: {
        ...markdownPalette,
        inlineCodeFg: theme.agentText,
        codeTextFg: theme.agentText,
      },
    }
  }

  const defaultToolBranchMeta: ToolBranchMeta = {
    hasPrevious: false,
    hasNext: false,
  }

  const buildToolBranchMeta = (
    items: Array<ContentBlock | undefined>,
  ): Map<number, ToolBranchMeta> => {
    const toolIndices = items
      .map((block, index) => (block && block.type === 'tool' ? index : -1))
      .filter((index) => index !== -1) as number[]

    const meta = new Map<number, ToolBranchMeta>()
    toolIndices.forEach((blockIndex, position) => {
      meta.set(blockIndex, {
        hasPrevious: position > 0,
        hasNext: position < toolIndices.length - 1,
      })
    })
    return meta
  }

  const renderToolBranch = (
    toolBlock: Extract<ContentBlock, { type: 'tool' }>,
    indentLevel: number,
    keyPrefix: string,
    branchMeta: ToolBranchMeta,
  ): React.ReactNode => {
    if (toolBlock.toolName === 'end_turn') {
      return null
    }

    const displayInfo = getToolDisplayInfo(toolBlock.toolName)
    const isCollapsed = collapsedAgents.has(toolBlock.toolCallId)
    const isStreaming = streamingAgents.has(toolBlock.toolCallId)
    const indentationOffset = indentLevel * 2

    const { titleAccessory, content: customContent, collapsedPreview } =
      getToolRenderConfig(toolBlock, theme, {
        availableWidth,
        indentationOffset,
      })

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

    const streamingPreview = isStreaming
      ? commandPreview ?? `${sanitizePreview(firstLine)}...`
      : ''

    let finishedPreview = ''
    if (!isStreaming && isCollapsed) {
      if (commandPreview) {
        finishedPreview = commandPreview
      } else if (
        toolBlock.toolName === 'run_terminal_command' &&
        toolBlock.output
      ) {
        const outputLines = toolBlock.output
          .split('\n')
          .filter((line) => line.trim())
        const lastThreeLines = outputLines.slice(-3)
        const hasMoreLines = outputLines.length > 3
        finishedPreview = hasMoreLines
          ? '...\n' + lastThreeLines.join('\n')
          : lastThreeLines.join('\n')
      } else {
        finishedPreview = sanitizePreview(lastLine)
      }
    }

    const agentMarkdownOptions = getAgentMarkdownOptions(indentLevel)
    const displayContent =
      customContent ??
      (hasMarkdown(fullContent)
        ? renderMarkdown(fullContent, agentMarkdownOptions)
        : fullContent)

    if (!isStreaming && isCollapsed && collapsedPreview) {
      finishedPreview = collapsedPreview
    }

    return (
      <box
        key={keyPrefix}
        ref={(el: any) => registerAgentRef(toolBlock.toolCallId, el)}
        style={{ flexDirection: 'column', gap: 0, marginLeft: indentationOffset }}
      >
        <ToolItem
          name={displayInfo.name}
          titleAccessory={titleAccessory}
          content={displayContent}
          isCollapsed={isCollapsed}
          isStreaming={isStreaming}
          streamingPreview={streamingPreview}
          finishedPreview={finishedPreview}
          theme={theme}
          titleColor={textColor}
          branchMeta={branchMeta}
          onToggle={() => onToggleCollapsed(toolBlock.toolCallId)}
        />
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
      agentBlock.status === 'running' || streamingAgents.has(agentBlock.agentId)

    const allTextContent =
      agentBlock.blocks
        ?.filter((nested) => nested.type === 'text')
        .map((nested) => (nested as any).content)
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
    const indentationOffset = indentLevel * 2
    const branchWidth = Math.max(1, availableWidth - indentationOffset)
    const isActive = isStreaming || agentBlock.status === 'running'
    const statusLabel = isActive
      ? 'running'
      : agentBlock.status === 'complete'
        ? 'completed'
        : agentBlock.status
    const statusColor = isActive ? theme.statusAccent : theme.agentResponseCount
    const statusIndicator = isActive ? '●' : '✓'

    return (
      <box
        key={keyPrefix}
        ref={(el: any) => registerAgentRef(agentBlock.agentId, el)}
        style={{ flexDirection: 'column', gap: 0, marginLeft: indentationOffset }}
      >
        <BranchItem
          name={agentBlock.agentName}
          content={displayContent}
          prompt={agentBlock.initialPrompt}
          agentId={agentBlock.agentId}
          isCollapsed={isCollapsed}
          isStreaming={isStreaming}
          streamingPreview={streamingPreview}
          finishedPreview={finishedPreview}
          availableWidth={branchWidth}
          statusLabel={statusLabel}
          statusColor={statusColor}
          statusIndicator={statusIndicator}
          theme={theme}
          onToggle={() => onToggleCollapsed(agentBlock.agentId)}
        />
      </box>
    )
  }

  function renderAgentListBranch(
    agentListBlock: Extract<ContentBlock, { type: 'agent-list' }>,
    keyPrefix: string,
  ): React.ReactNode {
    const TRUNCATE_LIMIT = 5
    const isCollapsed = collapsedAgents.has(agentListBlock.id)
    const { agents } = agentListBlock

    const sortedAgents = [...agents].sort((a, b) => {
      const aLabel = (a.displayName || a.id).toLowerCase()
      const bLabel = (b.displayName || b.id).toLowerCase()
      return aLabel.localeCompare(bLabel)
    })

    const agentCount = sortedAgents.length
    const previewAgents = sortedAgents.slice(0, TRUNCATE_LIMIT)
    const remainingCount =
      agentCount > TRUNCATE_LIMIT ? agentCount - TRUNCATE_LIMIT : 0

    const formatIdentifier = (agent: { id: string; displayName: string }) =>
      agent.displayName && agent.displayName !== agent.id
        ? `${agent.displayName} (${agent.id})`
        : agent.displayName || agent.id

    const agentListContent = (
      <box style={{ flexDirection: 'column', gap: 0 }}>
        {sortedAgents.map((agent, idx) => {
          const identifier = formatIdentifier(agent)
          return (
            <text key={`agent-${idx}`} fg={theme.agentText}>
              {`  • ${identifier}`}
            </text>
          )
        })}
      </box>
    )

    const headerText = pluralize(agentCount, 'local agent')
    const previewLines = previewAgents.map(
      (agent) => `  • ${formatIdentifier(agent)}`,
    )
    const finishedPreview = isCollapsed
      ? [
          ...previewLines,
          remainingCount > 0
            ? `  ... ${pluralize(remainingCount, 'more agent')} available`
            : null,
        ]
          .filter(Boolean)
          .join('\n')
      : ''

    return (
      <box
        key={keyPrefix}
        ref={(el: any) => registerAgentRef(agentListBlock.id, el)}
      >
        <BranchItem
          name={headerText}
          content={agentListContent}
          agentId={agentListBlock.id}
          isCollapsed={isCollapsed}
          isStreaming={false}
          streamingPreview=""
          finishedPreview={finishedPreview}
          availableWidth={availableWidth}
          theme={theme}
          onToggle={() => onToggleCollapsed(agentListBlock.id)}
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
    const toolBranchMetaMap = buildToolBranchMeta(nestedBlocks)

    nestedBlocks.forEach((nestedBlock, nestedIdx) => {
      if (nestedBlock.type === 'text') {
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
        const renderedContent = hasMarkdown(rawNestedContent)
          ? isNestedStreamingText
            ? renderStreamingMarkdown(rawNestedContent, markdownOptionsForLevel)
            : renderMarkdown(rawNestedContent, markdownOptionsForLevel)
          : rawNestedContent
        nodes.push(
          <text
            key={renderKey}
            style={{
              fg: theme.agentText,
              marginLeft: Math.max(0, indentLevel * 2),
            }}
          >
            {renderedContent}
          </text>,
        )
      } else if (nestedBlock.type === 'tool') {
        const branchMeta =
          toolBranchMetaMap.get(nestedIdx) ?? defaultToolBranchMeta
        nodes.push(
          renderToolBranch(
            nestedBlock,
            indentLevel,
            `${keyPrefix}-tool-${nestedBlock.toolCallId}`,
            branchMeta,
          ),
        )
      } else if (nestedBlock.type === 'agent') {
        nodes.push(
          renderAgentBranch(
            nestedBlock,
            indentLevel,
            `${keyPrefix}-agent-${nestedIdx}`,
          ),
        )
      }
    })

    return nodes
  }

  const topLevelToolMeta = blocks ? buildToolBranchMeta(blocks) : null

  return (
    <>
      {isUser && (
        <text
          attributes={TextAttributes.DIM}
          style={{
            fg: timestampColor,
            marginTop: 0,
            marginBottom: 0,
            alignSelf: 'flex-start',
            wrapMode: 'none',
          }}
        >
          {`[${timestamp}]`}
        </text>
      )}
      {blocks ? (
        <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
          {blocks.map((block, idx) => {
            if (block.type === 'text') {
              const isStreamingText = isLoading || !isComplete
              const rawContent = isStreamingText
                ? trimTrailingNewlines(block.content)
                : block.content.trim()
              const renderKey = `${messageId}-text-${idx}`
              const renderedContent = hasMarkdown(rawContent)
                ? isStreamingText
                  ? renderStreamingMarkdown(rawContent, markdownOptions)
                  : renderMarkdown(rawContent, markdownOptions)
                : rawContent
              const prevBlock = idx > 0 ? blocks[idx - 1] : null
              const marginTop =
                prevBlock && prevBlock.type === 'text'
                  ? 1
                  : prevBlock && (prevBlock.type === 'tool' || prevBlock.type === 'agent')
                    ? 0
                    : 0
              const blockTextColor = block.color ?? textColor
            return (
              <text key={renderKey} style={{ fg: blockTextColor, marginTop }}>
                {renderedContent}
              </text>
            )
          } else if (block.type === 'tool') {
            const branchMeta =
              topLevelToolMeta?.get(idx) ?? defaultToolBranchMeta
            return renderToolBranch(
              block,
              0,
              `${messageId}-tool-${block.toolCallId}`,
              branchMeta,
            )
          } else if (block.type === 'agent') {
              return renderAgentBranch(
                block,
                0,
                `${messageId}-agent-${block.agentId}`,
              )
            } else if (block.type === 'agent-list') {
              return renderAgentListBranch(
                block,
                `${messageId}-agent-list-${block.id}`,
              )
            }
            return null
          })}
        </box>
      ) : (
        (() => {
          const isStreamingMessage = isLoading || !isComplete
          const normalizedContent = isStreamingMessage
            ? trimTrailingNewlines(content)
            : content.trim()
          const displayContent = hasMarkdown(normalizedContent)
            ? isStreamingMessage
              ? renderStreamingMarkdown(normalizedContent, markdownOptions)
              : renderMarkdown(normalizedContent, markdownOptions)
            : normalizedContent
          return (
            <text
              key={`message-content-${messageId}`}
              style={{ fg: textColor }}
              attributes={isUser ? TextAttributes.ITALIC : undefined}
            >
              {displayContent}
            </text>
          )
        })()
      )}
      {isAi && isComplete && (completionTime || credits) && (
        <text
          attributes={TextAttributes.DIM}
          style={{
            fg: theme.statusSecondary,
            marginTop: 0,
            marginBottom: 0,
            alignSelf: 'flex-start',
            wrapMode: 'none',
          }}
        >
          {completionTime}
          {credits && ` • ${credits} credits`}
        </text>
      )}
    </>
  )
}
