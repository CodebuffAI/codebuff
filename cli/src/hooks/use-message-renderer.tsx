import { TextAttributes, type BorderCharacters } from '@opentui/core'
import { useMemo, type ReactNode } from 'react'
import React from 'react'

const verticalLineBorderChars: BorderCharacters = {
  topLeft: ' ',
  topRight: ' ',
  bottomLeft: ' ',
  bottomRight: ' ',
  horizontal: ' ',
  vertical: '│',
  topT: ' ',
  bottomT: ' ',
  leftT: ' ',
  rightT: ' ',
  cross: ' ',
}

import { MessageBlock } from '../components/message-block'
import {
  renderMarkdown,
  hasMarkdown,
  type MarkdownPalette,
} from '../utils/markdown-renderer'
import { getDescendantIds, getAncestorIds } from '../utils/message-tree-utils'

import type { ChatMessage } from '../chat'
import type { ChatTheme } from '../utils/theme-system'

interface UseMessageRendererProps {
  messages: ChatMessage[]
  messageTree: Map<string, ChatMessage[]>
  topLevelMessages: ChatMessage[]
  availableWidth: number
  theme: ChatTheme
  markdownPalette: MarkdownPalette
  collapsedAgents: Set<string>
  streamingAgents: Set<string>
  isWaitingForResponse: boolean
  setCollapsedAgents: React.Dispatch<React.SetStateAction<Set<string>>>
  setFocusedAgentId: React.Dispatch<React.SetStateAction<string | null>>
  registerAgentRef: (agentId: string, element: any) => void
  scrollToAgent: (agentId: string, retries?: number) => void
}

export const useMessageRenderer = (
  props: UseMessageRendererProps,
): ReactNode[] => {
  const {
    messages,
    messageTree,
    topLevelMessages,
    availableWidth,
    theme,
    markdownPalette,
    collapsedAgents,
    streamingAgents,
    isWaitingForResponse,
    setCollapsedAgents,
    setFocusedAgentId,
    registerAgentRef,
    scrollToAgent,
  } = props

  return useMemo(() => {
    const renderAgentMessage = (
      message: ChatMessage,
      depth: number,
    ): ReactNode => {
      const agentInfo = message.agent!
      const isCollapsed = collapsedAgents.has(message.id)
      const isStreaming = streamingAgents.has(message.id)
      const toggleColor = isStreaming
        ? theme.statusAccent
        : isCollapsed
          ? theme.agentResponseCount
          : theme.agentPrefix

      const agentChildren = messageTree.get(message.id) ?? []

      const lines = message.content.split('\n').filter((line) => line.trim())
      const firstLine = lines[0] || ''
      const lastLine = lines[lines.length - 1] || firstLine
      const rawDisplayContent = isCollapsed ? lastLine : message.content

      const streamingPreview = isStreaming
        ? firstLine.replace(/[#*_`~\[\]()]/g, '').trim() + '...'
        : ''

      const finishedPreview =
        !isStreaming && isCollapsed
          ? lastLine.replace(/[#*_`~\[\]()]/g, '').trim()
          : ''

      const statusColor = isStreaming
        ? theme.statusAccent
        : theme.agentResponseCount
      const statusLabel = isStreaming ? 'running' : 'completed'
      const statusIndicator = isStreaming ? '●' : '✓'
      const statusText =
        statusIndicator === '✓'
          ? `${statusLabel} ${statusIndicator}`
          : `${statusIndicator} ${statusLabel}`

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
      const displayContent = hasMarkdown(rawDisplayContent)
        ? renderMarkdown(rawDisplayContent, agentMarkdownOptions)
        : rawDisplayContent

      const handleTitleClick = (e: any): void => {
        if (e && e.stopPropagation) {
          e.stopPropagation()
        }

        setCollapsedAgents((prev) => {
          const next = new Set(prev)

          if (next.has(message.id)) {
            next.delete(message.id)
          } else {
            next.add(message.id)
            const descendantIds = getDescendantIds(message.id, messageTree)
            descendantIds.forEach((id) => next.add(id))
          }

          return next
        })

        setFocusedAgentId(message.id)
        scrollToAgent(message.id)
      }

      const handleContentClick = (e: any): void => {
        if (e && e.stopPropagation) {
          e.stopPropagation()
        }

        if (!isCollapsed) {
          return
        }

        const ancestorIds = getAncestorIds(message.id, messages)

        setCollapsedAgents((prev) => {
          const next = new Set(prev)
          ancestorIds.forEach((id) => next.delete(id))
          next.delete(message.id)
          return next
        })

        setFocusedAgentId(message.id)
        scrollToAgent(message.id)
      }

      return (
        <box
          key={message.id}
          ref={(el: any) => registerAgentRef(message.id, el)}
          style={{
            flexDirection: 'column',
            gap: 0,
            flexShrink: 0,
            marginLeft: Math.max(0, depth * 2),
          }}
        >
          <box
            style={{
              flexDirection: 'column',
              gap: 0,
              flexShrink: 1,
              flexGrow: 1,
            }}
          >
            <box
              style={{
                flexDirection: 'row',
                alignSelf: 'flex-start',
                paddingLeft: 1,
                paddingRight: 1,
              }}
              onMouseDown={handleTitleClick}
            >
              <text>
                <span fg={toggleColor}>{isCollapsed ? '▸ ' : '▾ '}</span>
                <span fg={toggleColor} attributes={TextAttributes.BOLD}>
                  {agentInfo.agentName}
                </span>
                <span fg={statusColor} attributes={TextAttributes.DIM}>
                  {` ${statusText}`}
                </span>
              </text>
            </box>
            <box
              style={{ flexShrink: 1, marginBottom: isCollapsed ? 1 : 0 }}
              onMouseDown={handleContentClick}
            >
              {isStreaming && isCollapsed && streamingPreview && (
                <text fg={theme.agentText} attributes={TextAttributes.ITALIC}>
                  {streamingPreview}
                </text>
              )}
              {!isStreaming && isCollapsed && finishedPreview && (
                <text
                  fg={theme.agentResponseCount}
                  attributes={TextAttributes.ITALIC}
                >
                  {finishedPreview}
                </text>
              )}
              {!isCollapsed && (
                <text
                  key={`agent-content-${message.id}`}
                  fg={theme.agentContentText}
                >
                  {displayContent}
                </text>
              )}
            </box>
          </box>
          {agentChildren.length > 0 && (
            <box
              style={{
                flexDirection: 'column',
                gap: 0,
                flexShrink: 0,
              }}
            >
              {agentChildren.map((childAgent) => (
                <box key={childAgent.id} style={{ flexShrink: 0 }}>
                  {renderMessageWithAgents(childAgent, depth + 1)}
                </box>
              ))}
            </box>
          )}
        </box>
      )
    }

    const renderMessageWithAgents = (
      message: ChatMessage,
      depth = 0,
      isLastMessage = false,
    ): ReactNode => {
      const isAgent = message.variant === 'agent'

      if (isAgent) {
        return renderAgentMessage(message, depth)
      }

      const isAi = message.variant === 'ai'
      const isUser = message.variant === 'user'
      const lineColor = isAi ? theme.aiLine : theme.userLine
      const textColor = isAi ? theme.messageAiText : theme.messageUserText
      const timestampColor = isAi ? theme.timestampAi : theme.timestampUser
      const estimatedMessageWidth = availableWidth
      const codeBlockWidth = Math.max(10, estimatedMessageWidth - 8)
      const paletteForMessage: MarkdownPalette = {
        ...markdownPalette,
        inlineCodeFg: textColor,
        codeTextFg: textColor,
      }
      const markdownOptions = { codeBlockWidth, palette: paletteForMessage }

      const isLoading =
        isAi &&
        message.content === '' &&
        !message.blocks &&
        isWaitingForResponse

      const agentChildren = messageTree.get(message.id) ?? []
      const hasAgentChildren = agentChildren.length > 0
      const showVerticalLine = isUser

      // Calculate height for vertical line
      const contentLines = message.content ? message.content.split('\n').length : 1
      const verticalLineHeight = Math.max(1, contentLines + 1) // +1 for timestamp
      const verticalLineText = Array(verticalLineHeight).fill('│').join('\n')

      return (
        <box
          key={message.id}
          style={{
            width: '100%',
            flexDirection: 'column',
            gap: 0,
            marginBottom: isLastMessage ? 0 : 1,
          }}
        >
          <box
            style={{
              width: '100%',
              flexDirection: 'row',
            }}
          >
            {showVerticalLine ? (
              <box
                style={{
                  flexDirection: 'row',
                  gap: 0,
                  alignItems: 'stretch',
                  width: '100%',
                  flexGrow: 1,
                }}
              >
                <box
                  style={{
                    width: 1,
                    flexShrink: 0,
                    flexDirection: 'column',
                  }}
                >
                  <text fg={lineColor}>{verticalLineText}</text>
                </box>
                <box
                  style={{
                    backgroundColor: 'transparent',
                    padding: 0,
                    paddingLeft: 1,
                    paddingRight: 1,
                    paddingTop: 0,
                    paddingBottom: 0,
                    gap: 0,
                    width: '100%',
                    flexGrow: 1,
                    justifyContent: 'center',
                  }}
                >
                  <MessageBlock
                    messageId={message.id}
                    blocks={message.blocks}
                    content={message.content}
                    isUser={isUser}
                    isAi={isAi}
                    isLoading={isLoading}
                    timestamp={message.timestamp}
                    isComplete={message.isComplete}
                    completionTime={message.completionTime}
                    credits={message.credits}
                    theme={theme}
                    textColor={textColor}
                    timestampColor={timestampColor}
                    markdownOptions={markdownOptions}
                    availableWidth={availableWidth}
                    markdownPalette={markdownPalette}
                    collapsedAgents={collapsedAgents}
                    streamingAgents={streamingAgents}
                    onToggleCollapsed={(id: string) => {
                      setCollapsedAgents((prev) => {
                        const next = new Set(prev)
                        if (next.has(id)) {
                          next.delete(id)
                        } else {
                          next.add(id)
                        }
                        return next
                      })
                      scrollToAgent(id)
                    }}
                    registerAgentRef={registerAgentRef}
                  />
                </box>
              </box>
            ) : (
              <box
                style={{
                  backgroundColor: 'transparent',
                  padding: 0,
                  paddingLeft: 0,
                  paddingRight: 0,
                  paddingTop: 0,
                  paddingBottom: 0,
                  gap: 0,
                  width: '100%',
                  flexGrow: 1,
                  justifyContent: 'center',
                }}
              >
                <MessageBlock
                  messageId={message.id}
                  blocks={message.blocks}
                  content={message.content}
                  isUser={isUser}
                  isAi={isAi}
                  isLoading={isLoading}
                  timestamp={message.timestamp}
                  isComplete={message.isComplete}
                  completionTime={message.completionTime}
                  credits={message.credits}
                  theme={theme}
                  textColor={textColor}
                  timestampColor={timestampColor}
                  markdownOptions={markdownOptions}
                  availableWidth={availableWidth}
                  markdownPalette={markdownPalette}
                  collapsedAgents={collapsedAgents}
                  streamingAgents={streamingAgents}
                  onToggleCollapsed={(id: string) => {
                    setCollapsedAgents((prev) => {
                      const next = new Set(prev)
                      if (next.has(id)) {
                        next.delete(id)
                      } else {
                        next.add(id)
                      }
                      return next
                    })
                    scrollToAgent(id)
                  }}
                  registerAgentRef={registerAgentRef}
                />
              </box>
            )}
          </box>

          {hasAgentChildren && (
            <box style={{ flexDirection: 'column', width: '100%', gap: 0 }}>
              {agentChildren.map((agent) => (
                <box key={agent.id} style={{ width: '100%' }}>
                  {renderMessageWithAgents(agent, depth + 1)}
                </box>
              ))}
            </box>
          )}
        </box>
      )
    }

    return topLevelMessages.map((message, idx) =>
      renderMessageWithAgents(message, 0, idx === topLevelMessages.length - 1),
    )
  }, [
    messages,
    messageTree,
    topLevelMessages,
    availableWidth,
    theme,
    markdownPalette,
    collapsedAgents,
    streamingAgents,
    isWaitingForResponse,
    setCollapsedAgents,
    setFocusedAgentId,
    registerAgentRef,
    scrollToAgent,
  ])
}
