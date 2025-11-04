import { TextAttributes } from '@opentui/core'
import { useMemo, type ReactNode } from 'react'
import React from 'react'

import { MessageBlock } from '../components/message-block'
import {
  renderMarkdown,
  hasMarkdown,
  type MarkdownPalette,
} from '../utils/markdown-renderer'
import { getDescendantIds, getAncestorIds } from '../utils/message-tree-utils'

import type { ElapsedTimeTracker } from './use-elapsed-time'
import type { ChatMessage } from '../types/chat'
import type { ChatTheme } from '../types/theme-system'

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
  timer: ElapsedTimeTracker
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
    timer,
    setCollapsedAgents,
    setFocusedAgentId,
    registerAgentRef,
    scrollToAgent,
  } = props

  return useMemo(() => {
    const renderAgentMessage = (
      message: ChatMessage,
      depth: number,
      isLastSibling: boolean,
      ancestorBranches: boolean[] = [],
    ): ReactNode => {
      const agentInfo = message.agent!
      const isCollapsed = collapsedAgents.has(message.id)
      const isStreaming = streamingAgents.has(message.id)

      const agentChildren = messageTree.get(message.id) ?? []

      let branchPrefix = ''
      for (let i = 0; i < ancestorBranches.length; i++) {
        branchPrefix += '   '
      }
      const treeBranch = isLastSibling ? '└─ ' : '├─ '
      const fullPrefix = branchPrefix + treeBranch

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

      const agentCodeBlockWidth = Math.max(10, availableWidth - 12)
      const agentPalette: MarkdownPalette = {
        ...markdownPalette,
        inlineCodeFg: theme.foreground,
        codeTextFg: theme.foreground,
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
          }}
        >
          <box
            style={{
              flexDirection: 'row',
              flexShrink: 0,
            }}
          >
            <text style={{ wrapMode: 'none' }}>
              <span fg={theme.success}>{fullPrefix}</span>
            </text>
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
                  backgroundColor: isCollapsed
                    ? theme.muted
                    : theme.success,
                  paddingLeft: 1,
                  paddingRight: 1,
                }}
                onMouseDown={handleTitleClick}
              >
                <text style={{ wrapMode: 'word' }}>
                  <span fg={theme.foreground}>
                    {isCollapsed ? '▸ ' : '▾ '}
                  </span>
                  <span
                    fg={theme.foreground}
                    attributes={TextAttributes.BOLD}
                  >
                    {agentInfo.agentName}
                  </span>
                </text>
              </box>
              <box
                style={{ flexShrink: 1, marginBottom: isCollapsed ? 1 : 0 }}
                onMouseDown={handleContentClick}
              >
                {isStreaming && isCollapsed && streamingPreview && (
                  <text
                    style={{ wrapMode: 'word', fg: theme.foreground }}
                    attributes={TextAttributes.ITALIC}
                  >
                    {streamingPreview}
                  </text>
                )}
                {!isStreaming && isCollapsed && finishedPreview && (
                  <text
                    style={{ wrapMode: 'word', fg: theme.muted }}
                    attributes={TextAttributes.ITALIC}
                  >
                    {finishedPreview}
                  </text>
                )}
                {!isCollapsed && (
                  <text
                    key={`agent-content-${message.id}`}
                    style={{ wrapMode: 'word', fg: theme.foreground }}
                  >
                    {displayContent}
                  </text>
                )}
              </box>
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
              {agentChildren.map((childAgent, idx) => (
                <box key={childAgent.id} style={{ flexShrink: 0 }}>
                  {renderMessageWithAgents(
                    childAgent,
                    depth + 1,
                    idx === agentChildren.length - 1,
                    [...ancestorBranches, !isLastSibling],
                  )}
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
      isLastSibling = false,
      ancestorBranches: boolean[] = [],
      isLastMessage = false,
    ): ReactNode => {
      const isAgent = message.variant === 'agent'

      if (isAgent) {
        return renderAgentMessage(
          message,
          depth,
          isLastSibling,
          ancestorBranches,
        )
      }

      const isAi = message.variant === 'ai'
      const isUser = message.variant === 'user'
      const isError = message.variant === 'error'
      const lineColor = isError ? 'red' : isAi ? theme.aiLine : theme.userLine
      const textColor = isError
        ? theme.foreground
        : isAi
          ? theme.foreground
          : theme.foreground
      const timestampColor = isError
        ? 'red'
        : isAi
          ? theme.muted
          : theme.muted
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
                    backgroundColor: lineColor,
                    marginTop: 0,
                    marginBottom: 0,
                  }}
                />
                <box
                  style={{
                    backgroundColor: theme.background,
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
                    timer={timer}
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
                  backgroundColor: theme.background,
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
                  timer={timer}
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
              {agentChildren.map((agent, idx) => (
                <box key={agent.id} style={{ width: '100%' }}>
                  {renderMessageWithAgents(
                    agent,
                    depth + 1,
                    idx === agentChildren.length - 1,
                  )}
                </box>
              ))}
            </box>
          )}
        </box>
      )
    }

    return topLevelMessages.map((message, idx) => {
      const isLast = idx === topLevelMessages.length - 1
      return renderMessageWithAgents(message, 0, false, [], isLast)
    })
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
