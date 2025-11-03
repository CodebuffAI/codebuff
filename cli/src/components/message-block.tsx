import { pluralize } from '@codebuff/common/util/string'
import { TextAttributes } from '@opentui/core'
import React, { type ReactNode } from 'react'

import { BranchItem } from './branch-item'
import { getToolDisplayInfo } from '../utils/codebuff-client'
import {
  renderMarkdown,
  renderStreamingMarkdown,
  hasMarkdown,
  type MarkdownPalette,
} from '../utils/markdown-renderer'

import type { ElapsedTimeTracker } from '../hooks/use-elapsed-time'
import type { ContentBlock } from '../types/chat'
import type { ChatTheme } from '../types/theme-system'

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
  timer: ElapsedTimeTracker
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
  timer,
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
  // Get elapsed time from timer for streaming AI messages
  const elapsedSeconds = timer.elapsedSeconds
  const computeBranchChar = (indentLevel: number, isLastBranch: boolean) =>
    `${'  '.repeat(indentLevel)}${isLastBranch ? '└─ ' : '├─ '}`

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

  const hasBranchAfter = (
    sourceBlocks: ContentBlock[] | undefined,
    currentIndex: number,
  ): boolean =>
    !!sourceBlocks
      ?.slice(currentIndex + 1)
      .some(
        (candidate) => candidate.type === 'tool' || candidate.type === 'agent',
      )

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

  const renderToolBranch = (
    toolBlock: Extract<ContentBlock, { type: 'tool' }>,
    indentLevel: number,
    isLastBranch: boolean,
    keyPrefix: string,
  ): React.ReactNode => {
    if (toolBlock.toolName === 'end_turn') {
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

    const streamingPreview = isStreaming
      ? commandPreview ?? `${sanitizePreview(firstLine)}...`
      : ''

    const finishedPreview =
      !isStreaming && isCollapsed
        ? getToolFinishedPreview(toolBlock, commandPreview, lastLine)
        : ''

    const agentMarkdownOptions = getAgentMarkdownOptions(indentLevel)
    const displayContent = renderContentWithMarkdown(
      fullContent,
      false,
      agentMarkdownOptions,
    )

    const branchChar = computeBranchChar(indentLevel, isLastBranch)

    return (
      <box
        key={keyPrefix}
        ref={(el: any) => registerAgentRef(toolBlock.toolCallId, el)}
      >
        <BranchItem
          name={displayInfo.name}
          content={displayContent}
          agentId={toolBlock.agentId}
          isCollapsed={isCollapsed}
          isStreaming={isStreaming}
          branchChar={branchChar}
          streamingPreview={streamingPreview}
          finishedPreview={finishedPreview}
          theme={theme}
          onToggle={() => onToggleCollapsed(toolBlock.toolCallId)}
        />
      </box>
    )
  }

  function renderAgentBranch(
    agentBlock: Extract<ContentBlock, { type: 'agent' }>,
    indentLevel: number,
    isLastBranch: boolean,
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

    const branchChar = computeBranchChar(indentLevel, isLastBranch)
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

    return (
      <box
        key={keyPrefix}
        ref={(el: any) => registerAgentRef(agentBlock.agentId, el)}
        style={{ flexDirection: 'column', gap: 0 }}
      >
        <BranchItem
          name={agentBlock.agentName}
          content={displayContent}
          prompt={agentBlock.initialPrompt}
          agentId={agentBlock.agentId}
          isCollapsed={isCollapsed}
          isStreaming={isStreaming}
          branchChar={branchChar}
          streamingPreview={streamingPreview}
          finishedPreview={finishedPreview}
          theme={theme}
          onToggle={() => onToggleCollapsed(agentBlock.agentId)}
        />
      </box>
    )
  }

  function renderAgentListBranch(
    agentListBlock: Extract<ContentBlock, { type: 'agent-list' }>,
    isLastBranch: boolean,
    keyPrefix: string,
  ): React.ReactNode {
    const TRUNCATE_LIMIT = 5
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
    const previewAgents = sortedAgents.slice(0, TRUNCATE_LIMIT)
    const remainingCount =
      agentCount > TRUNCATE_LIMIT ? agentCount - TRUNCATE_LIMIT : 0

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
        <text key={`agent-${idx}`} wrap fg={theme.agentText}>
          {`  • ${identifier}`}
        </text>
      )
    }

    const agentListContent = (
      <box style={{ flexDirection: 'column', gap: 0 }}>
        {sortedAgents.map(renderAgentListItem)}
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
          branchChar=""
          streamingPreview=""
          finishedPreview={finishedPreview}
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

    nestedBlocks.forEach((nestedBlock, nestedIdx) => {
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
          const marginBottom = nestedBlock.marginBottom ?? 0
          nodes.push(
            <text
              key={renderKey}
              wrap
              style={{
                fg: theme.agentText,
                marginLeft: Math.max(0, indentLevel * 2),
                marginBottom,
              }}
            >
              {renderedContent}
            </text>,
          )
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
              {nestedBlock.render({ textColor: theme.agentText, theme })}
            </box>,
          )
          break
        }

        case 'tool': {
          const isLastBranch = !hasBranchAfter(nestedBlocks, nestedIdx)
          nodes.push(
            renderToolBranch(
              nestedBlock,
              indentLevel,
              isLastBranch,
              `${keyPrefix}-tool-${nestedBlock.toolCallId}`,
            ),
          )
          break
        }

        case 'agent': {
          const isLastBranch = !hasBranchAfter(nestedBlocks, nestedIdx)
          nodes.push(
            renderAgentBranch(
              nestedBlock,
              indentLevel,
              isLastBranch,
              `${keyPrefix}-agent-${nestedIdx}`,
            ),
          )
          break
        }
      }
    })

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
      <text key={`message-content-${messageId}`} wrap style={{ fg: textColor }}>
        {displayContent}
      </text>
    )
  }

  const renderBlock = (block: ContentBlock, idx: number) => {
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
          prevBlock && (prevBlock.type === 'tool' || prevBlock.type === 'agent')
            ? 0
            : block.marginTop ?? 0
        const marginBottom = block.marginBottom ?? 0
        return (
          <text
            key={renderKey}
            wrap
            style={{ fg: textColor, marginTop, marginBottom }}
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
            {block.render({ textColor, theme })}
          </box>
        )
      }

      case 'tool': {
        const isLastBranch = !hasBranchAfter(blocks, idx)
        return renderToolBranch(
          block,
          0,
          isLastBranch,
          `${messageId}-tool-${block.toolCallId}`,
        )
      }

      case 'agent': {
        const isLastBranch = !hasBranchAfter(blocks, idx)
        return renderAgentBranch(
          block,
          0,
          isLastBranch,
          `${messageId}-agent-${block.agentId}`,
        )
      }

      case 'agent-list': {
        const isLastBranch = !hasBranchAfter(blocks, idx)
        return renderAgentListBranch(
          block,
          isLastBranch,
          `${messageId}-agent-list-${block.id}`,
        )
      }

      default:
        return null
    }
  }

  return (
    <>
      {isUser && (
        <text
          wrap={false}
          attributes={TextAttributes.DIM}
          style={{
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
          {blocks.map(renderBlock)}
        </box>
      ) : (
        renderSimpleContent()
      )}
      {isAi && (
        <>
          {/* Show elapsed time while streaming */}
          {isLoading && !isComplete && elapsedSeconds > 0 && (
            <text
              wrap={false}
              attributes={TextAttributes.DIM}
              style={{
                fg: theme.statusSecondary,
                marginTop: 0,
                marginBottom: 0,
                alignSelf: 'flex-start',
              }}
            >
              {elapsedSeconds}s
            </text>
          )}
          {/* Show completion time and credits when complete */}
          {isComplete && (
            <text
              wrap={false}
              attributes={TextAttributes.DIM}
              style={{
                fg: theme.statusSecondary,
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
}
