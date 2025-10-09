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

import type { ContentBlock } from '../chat'
import type { ChatTheme } from '../utils/theme-system'

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
}: MessageBlockProps): ReactNode => {
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
          {blocks.map((block, idx) => {
            if (block.type === 'text') {
              const trimmedContent = block.content.trim()
              const renderedContent = hasMarkdown(trimmedContent)
                ? renderStreamingMarkdown(trimmedContent, markdownOptions)
                : trimmedContent
              const prevBlock = idx > 0 ? blocks[idx - 1] : null
              const marginTop =
                prevBlock && (prevBlock.type === 'tool' || prevBlock.type === 'agent')
                  ? 0
                  : 0
              return (
                <text
                  key={`${messageId}-text-${idx}`}
                  wrap
                  style={{ fg: textColor, marginTop }}
                >
                  {renderedContent}
                </text>
              )
            } else if (block.type === 'tool') {
              const displayInfo = getToolDisplayInfo(block.toolName)
              const isCollapsed = collapsedAgents.has(block.toolCallId)
              const isStreaming = streamingAgents.has(block.toolCallId)

              const inputContent = `\`\`\`json\n${JSON.stringify(block.input, null, 2)}\n\`\`\``
              const codeBlockLang =
                block.toolName === 'run_terminal_command' ? '' : 'yaml'
              const resultContent = block.output
                ? `\n\n**Result:**\n\`\`\`${codeBlockLang}\n${block.output}\n\`\`\``
                : ''
              const fullContent = inputContent + resultContent

              const lines = fullContent.split('\n').filter((line) => line.trim())
              const firstLine = lines[0] || ''
              const lastLine = lines[lines.length - 1] || firstLine

              const streamingPreview = isStreaming
                ? firstLine.replace(/[#*_`~\[\]()]/g, '').trim() + '...'
                : ''

              let finishedPreview = ''
              if (!isStreaming && isCollapsed) {
                if (block.toolName === 'run_terminal_command' && block.output) {
                  const outputLines = block.output
                    .split('\n')
                    .filter((line) => line.trim())
                  const lastThreeLines = outputLines.slice(-3)
                  const hasMoreLines = outputLines.length > 3
                  finishedPreview = hasMoreLines
                    ? '...\n' + lastThreeLines.join('\n')
                    : lastThreeLines.join('\n')
                } else {
                  finishedPreview = lastLine
                    .replace(/[#*_`~\[\]()]/g, '')
                    .trim()
                }
              }

              const agentCodeBlockWidth = Math.max(10, availableWidth - 12)
              const agentPalette: MarkdownPalette = {
                ...markdownPalette,
                inlineCodeFg: theme.agentText,
                codeTextFg: theme.agentText,
              }
              const agentMarkdownOptions = {
                codeBlockWidth: agentCodeBlockWidth,
                palette: agentPalette,
              }
              const displayContent = hasMarkdown(fullContent)
                ? renderMarkdown(fullContent, agentMarkdownOptions)
                : fullContent

              const nextBlock = blocks[idx + 1]
              const isLastBranch = !nextBlock || nextBlock.type === 'text'
              const branchChar = isLastBranch ? '└─ ' : '├─ '

              return (
                <box key={`${messageId}-tool-${block.toolCallId}`}>
                  <BranchItem
                    name={displayInfo.name}
                    content={displayContent}
                    isCollapsed={isCollapsed}
                    isStreaming={isStreaming}
                    branchChar={branchChar}
                    streamingPreview={streamingPreview}
                    finishedPreview={finishedPreview}
                    theme={theme}
                    onToggle={() => onToggleCollapsed(block.toolCallId)}
                  />
                </box>
              )
            } else if (block.type === 'agent') {
              const isCollapsed = collapsedAgents.has(block.agentId)
              const isStreaming = streamingAgents.has(block.agentId)

              const lines = block.content
                .split('\n')
                .filter((line) => line.trim())
              const firstLine = lines[0] || ''
              const lastLine = lines[lines.length - 1] || firstLine

              const streamingPreview = isStreaming
                ? firstLine.replace(/[#*_`~\[\]()]/g, '').trim() + '...'
                : ''

              const finishedPreview =
                !isStreaming && isCollapsed && block.initialPrompt
                  ? block.initialPrompt.replace(/[#*_`~\[\]()]/g, '').trim()
                  : ''

              const agentCodeBlockWidth = Math.max(10, availableWidth - 12)
              const agentPalette: MarkdownPalette = {
                ...markdownPalette,
                inlineCodeFg: theme.agentText,
                codeTextFg: theme.agentText,
              }
              const agentMarkdownOptions = {
                codeBlockWidth: agentCodeBlockWidth,
                palette: agentPalette,
              }
              
              const displayContent = block.content
                ? (hasMarkdown(block.content)
                    ? renderMarkdown(block.content, agentMarkdownOptions)
                    : block.content)
                : ''
              
              const nestedToolBlocks = block.blocks && block.blocks.length > 0 && !isCollapsed
                ? block.blocks.map((nestedBlock, nestedIdx) => {
                    if (nestedBlock.type === 'tool') {
                      const displayInfo = getToolDisplayInfo(nestedBlock.toolName)
                      const isNestedCollapsed = collapsedAgents.has(nestedBlock.toolCallId)
                      const isNestedStreaming = streamingAgents.has(nestedBlock.toolCallId)

                      const inputContent = `\`\`\`json\n${JSON.stringify(nestedBlock.input, null, 2)}\n\`\`\``
                      const codeBlockLang =
                        nestedBlock.toolName === 'run_terminal_command' ? '' : 'yaml'
                      const resultContent = nestedBlock.output
                        ? `\n\n**Result:**\n\`\`\`${codeBlockLang}\n${nestedBlock.output}\n\`\`\``
                        : ''
                      const fullNestedContent = inputContent + resultContent

                      const nestedLines = fullNestedContent.split('\n').filter((line) => line.trim())
                      const firstNestedLine = nestedLines[0] || ''
                      const lastNestedLine = nestedLines[nestedLines.length - 1] || firstNestedLine

                      const nestedStreamingPreview = isNestedStreaming
                        ? firstNestedLine.replace(/[#*_`~\[\]()]/g, '').trim() + '...'
                        : ''

                      let nestedFinishedPreview = ''
                      if (!isNestedStreaming && isNestedCollapsed) {
                        if (nestedBlock.toolName === 'run_terminal_command' && nestedBlock.output) {
                          const outputLines = nestedBlock.output
                            .split('\n')
                            .filter((line) => line.trim())
                          const lastThreeLines = outputLines.slice(-3)
                          const hasMoreLines = outputLines.length > 3
                          nestedFinishedPreview = hasMoreLines
                            ? '...\n' + lastThreeLines.join('\n')
                            : lastThreeLines.join('\n')
                        } else {
                          nestedFinishedPreview = lastNestedLine
                            .replace(/[#*_`~\[\]()]/g, '')
                            .trim()
                        }
                      }

                      const nestedDisplayContent = hasMarkdown(fullNestedContent)
                        ? renderMarkdown(fullNestedContent, agentMarkdownOptions)
                        : fullNestedContent

                      const nextNestedBlock = block.blocks![nestedIdx + 1]
                      const isLastNestedBranch = !nextNestedBlock
                      const nestedBranchChar = isLastNestedBranch ? '  └─ ' : '  ├─ '

                      return (
                        <box key={`${messageId}-agent-${block.agentId}-tool-${nestedBlock.toolCallId}`}>
                          <BranchItem
                            name={displayInfo.name}
                            content={nestedDisplayContent}
                            isCollapsed={isNestedCollapsed}
                            isStreaming={isNestedStreaming}
                            branchChar={nestedBranchChar}
                            streamingPreview={nestedStreamingPreview}
                            finishedPreview={nestedFinishedPreview}
                            theme={theme}
                            onToggle={() => onToggleCollapsed(nestedBlock.toolCallId)}
                          />
                        </box>
                      )
                    }
                    return null
                  })
                : null

              const nextBlock = blocks[idx + 1]
              const isLastBranch = !nextBlock || nextBlock.type === 'text'
              const branchChar = isLastBranch ? '└─ ' : '├─ '

              return (
                <box key={`${messageId}-agent-${block.agentId}`} style={{ flexDirection: 'column', gap: 0 }}>
                  <BranchItem
                    name={block.agentName}
                    content={displayContent}
                    isCollapsed={isCollapsed}
                    isStreaming={isStreaming}
                    branchChar={branchChar}
                    streamingPreview={streamingPreview}
                    finishedPreview={finishedPreview}
                    theme={theme}
                    onToggle={() => onToggleCollapsed(block.agentId)}
                  />
                  {nestedToolBlocks}
                </box>
              )
            }
            return null
          })}
        </box>
      ) : (
        <text key={`message-content-${messageId}`} wrap style={{ fg: textColor }}>
          {isLoading
            ? ''
            : hasMarkdown(content)
              ? renderStreamingMarkdown(content, markdownOptions)
              : content}
        </text>
      )}
      {isAi && isComplete && (completionTime || credits) && (
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
  )
}
