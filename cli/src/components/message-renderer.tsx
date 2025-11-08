import { TextAttributes } from '@opentui/core'
import { memo, useCallback, useMemo, type ReactNode } from 'react'
import React from 'react'

import { MessageBlock } from './message-block'
import { ModeDivider } from './mode-divider'
import {
  renderMarkdown,
  hasMarkdown,
  type MarkdownPalette,
} from '../utils/markdown-renderer'
import { getDescendantIds, getAncestorIds } from '../utils/message-tree-utils'

import type { ChatMessage } from '../types/chat'
import type { ChatTheme } from '../types/theme-system'

interface MessageRendererProps {
  messages: ChatMessage[]
  messageTree: Map<string, ChatMessage[]>
  topLevelMessages: ChatMessage[]
  availableWidth: number
  theme: ChatTheme
  markdownPalette: MarkdownPalette
  collapsedAgents: Set<string>
  streamingAgents: Set<string>
  isWaitingForResponse: boolean
  timerStartTime: number | null
  setCollapsedAgents: React.Dispatch<React.SetStateAction<Set<string>>>
  setFocusedAgentId: React.Dispatch<React.SetStateAction<string | null>>
  userOpenedAgents: Set<string>
  setUserOpenedAgents: React.Dispatch<React.SetStateAction<Set<string>>>
}

export const MessageRenderer = (props: MessageRendererProps): ReactNode => {
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
    timerStartTime,
    setCollapsedAgents,
    setFocusedAgentId,
    setUserOpenedAgents,
  } = props

  const onToggleCollapsed = useCallback(
    (id: string) => {
      const wasCollapsed = collapsedAgents.has(id)
      setCollapsedAgents((prev) => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      })
      setUserOpenedAgents((prev) => {
        const next = new Set(prev)
        if (wasCollapsed) {
          next.add(id)
        } else {
          next.delete(id)
        }
        return next
      })
    },
    [collapsedAgents, setCollapsedAgents, setUserOpenedAgents],
  )

  return (
    <>
      {topLevelMessages.map((message, idx) => {
        const isLast = idx === topLevelMessages.length - 1
        return (
          <MessageWithAgents
            key={message.id}
            message={message}
            depth={0}
            isLastMessage={isLast}
            theme={theme}
            markdownPalette={markdownPalette}
            collapsedAgents={collapsedAgents}
            streamingAgents={streamingAgents}
            messageTree={messageTree}
            messages={messages}
            availableWidth={availableWidth}
            setCollapsedAgents={setCollapsedAgents}
            setUserOpenedAgents={setUserOpenedAgents}
            setFocusedAgentId={setFocusedAgentId}
            isWaitingForResponse={isWaitingForResponse}
            timerStartTime={timerStartTime}
            onToggleCollapsed={onToggleCollapsed}
          />
        )
      })}
    </>
  )
}

interface MessageWithAgentsProps {
  message: ChatMessage
  depth: number
  isLastMessage: boolean
  theme: ChatTheme
  markdownPalette: MarkdownPalette
  collapsedAgents: Set<string>
  streamingAgents: Set<string>
  messageTree: Map<string, ChatMessage[]>
  messages: ChatMessage[]
  availableWidth: number
  setCollapsedAgents: React.Dispatch<React.SetStateAction<Set<string>>>
  setUserOpenedAgents: React.Dispatch<React.SetStateAction<Set<string>>>
  setFocusedAgentId: React.Dispatch<React.SetStateAction<string | null>>
  isWaitingForResponse: boolean
  timerStartTime: number | null
  onToggleCollapsed: (id: string) => void
}

const MessageWithAgents = memo(
  ({
    message,
    depth,
    isLastMessage,
    theme,
    markdownPalette,
    collapsedAgents,
    streamingAgents,
    messageTree,
    messages,
    availableWidth,
    setCollapsedAgents,
    setUserOpenedAgents,
    setFocusedAgentId,
    isWaitingForResponse,
    timerStartTime,
    onToggleCollapsed,
  }: MessageWithAgentsProps): ReactNode => {
    const SIDE_GUTTER = 1
    const isAgent = message.variant === 'agent'

    if (isAgent) {
      return (
        <AgentMessage
          message={message}
          depth={depth}
          theme={theme}
          markdownPalette={markdownPalette}
          collapsedAgents={collapsedAgents}
          streamingAgents={streamingAgents}
          messageTree={messageTree}
          messages={messages}
          availableWidth={availableWidth}
          setCollapsedAgents={setCollapsedAgents}
          setUserOpenedAgents={setUserOpenedAgents}
          setFocusedAgentId={setFocusedAgentId}
          isWaitingForResponse={isWaitingForResponse}
          timerStartTime={timerStartTime}
          onToggleCollapsed={onToggleCollapsed}
        />
      )
    }

    const isAi = message.variant === 'ai'
    const isUser = message.variant === 'user'
    const isError = message.variant === 'error'

    if (
      message.blocks &&
      message.blocks.length === 1 &&
      message.blocks[0].type === 'mode-divider'
    ) {
      const dividerBlock = message.blocks[0]
      return (
        <ModeDivider
          key={message.id}
          mode={dividerBlock.mode}
          width={availableWidth}
        />
      )
    }
    const lineColor = isError ? 'red' : isAi ? theme.aiLine : theme.userLine
    const textColor = isError
      ? theme.foreground
      : isAi
        ? theme.foreground
        : theme.foreground
    const timestampColor = isError ? 'red' : isAi ? theme.muted : theme.muted
    const estimatedMessageWidth = availableWidth
    const codeBlockWidth = Math.max(10, estimatedMessageWidth - 8)
    const paletteForMessage: MarkdownPalette = useMemo(
      () => ({
        ...markdownPalette,
        codeTextFg: textColor,
      }),
      [markdownPalette, textColor],
    )
    const markdownOptions = useMemo(
      () => ({ codeBlockWidth, palette: paletteForMessage }),
      [codeBlockWidth, paletteForMessage],
    )

    const isLoading =
      isAi && message.content === '' && !message.blocks && isWaitingForResponse

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
                  paddingLeft: SIDE_GUTTER,
                  paddingRight: SIDE_GUTTER,
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
                  timerStartTime={timerStartTime}
                  textColor={textColor}
                  timestampColor={timestampColor}
                  markdownOptions={markdownOptions}
                  availableWidth={availableWidth}
                  markdownPalette={markdownPalette}
                  collapsedAgents={collapsedAgents}
                  streamingAgents={streamingAgents}
                  onToggleCollapsed={onToggleCollapsed}
                />
              </box>
            </box>
          ) : (
            <box
              style={{
                backgroundColor: theme.background,
                padding: 0,
                paddingLeft: SIDE_GUTTER,
                paddingRight: SIDE_GUTTER,
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
                timerStartTime={timerStartTime}
                textColor={textColor}
                timestampColor={timestampColor}
                markdownOptions={markdownOptions}
                availableWidth={availableWidth}
                markdownPalette={markdownPalette}
                collapsedAgents={collapsedAgents}
                streamingAgents={streamingAgents}
                onToggleCollapsed={onToggleCollapsed}
              />
            </box>
          )}
        </box>

        {hasAgentChildren && (
          <box style={{ flexDirection: 'column', width: '100%', gap: 0 }}>
            {agentChildren.map((agent) => (
              <box key={agent.id} style={{ width: '100%' }}>
                <MessageWithAgents
                  message={agent}
                  depth={depth + 1}
                  isLastMessage={false}
                  theme={theme}
                  markdownPalette={markdownPalette}
                  collapsedAgents={collapsedAgents}
                  streamingAgents={streamingAgents}
                  messageTree={messageTree}
                  messages={messages}
                  availableWidth={availableWidth}
                  setCollapsedAgents={setCollapsedAgents}
                  setUserOpenedAgents={setUserOpenedAgents}
                  setFocusedAgentId={setFocusedAgentId}
                  isWaitingForResponse={isWaitingForResponse}
                  timerStartTime={timerStartTime}
                  onToggleCollapsed={onToggleCollapsed}
                />
              </box>
            ))}
          </box>
        )}
      </box>
    )
  },
)

interface AgentMessageProps {
  message: ChatMessage
  depth: number
  theme: ChatTheme
  markdownPalette: MarkdownPalette
  collapsedAgents: Set<string>
  streamingAgents: Set<string>
  messageTree: Map<string, ChatMessage[]>
  messages: ChatMessage[]
  availableWidth: number
  setCollapsedAgents: React.Dispatch<React.SetStateAction<Set<string>>>
  setUserOpenedAgents: React.Dispatch<React.SetStateAction<Set<string>>>
  setFocusedAgentId: React.Dispatch<React.SetStateAction<string | null>>
  isWaitingForResponse: boolean
  timerStartTime: number | null
  onToggleCollapsed: (id: string) => void
}

const AgentMessage = memo(
  ({
    message,
    depth,
    theme,
    markdownPalette,
    collapsedAgents,
    streamingAgents,
    messageTree,
    messages,
    availableWidth,
    setCollapsedAgents,
    setUserOpenedAgents,
    setFocusedAgentId,
    isWaitingForResponse,
    timerStartTime,
    onToggleCollapsed,
  }: AgentMessageProps): ReactNode => {
    const agentInfo = message.agent!
    const isCollapsed = collapsedAgents.has(message.id)
    const isStreaming = streamingAgents.has(message.id)

    const agentChildren = messageTree.get(message.id) ?? []

    const bulletChar = '• '
    const fullPrefix = bulletChar

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

      const wasCollapsed = collapsedAgents.has(message.id)

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

      setUserOpenedAgents((prev) => {
        const next = new Set(prev)
        if (wasCollapsed) {
          next.add(message.id)
        } else {
          next.delete(message.id)
        }
        return next
      })

      setFocusedAgentId(message.id)
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
    }

    return (
      <box
        key={message.id}
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
                backgroundColor: isCollapsed ? theme.muted : theme.success,
                paddingLeft: 1,
                paddingRight: 1,
              }}
              onMouseDown={handleTitleClick}
            >
              <text style={{ wrapMode: 'word' }}>
                <span fg={theme.foreground}>{isCollapsed ? '▸ ' : '▾ '}</span>
                <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
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
            {agentChildren.map((childAgent) => (
              <box key={childAgent.id} style={{ flexShrink: 0 }}>
                <MessageWithAgents
                  message={childAgent}
                  depth={depth + 1}
                  isLastMessage={false}
                  theme={theme}
                  markdownPalette={markdownPalette}
                  collapsedAgents={collapsedAgents}
                  streamingAgents={streamingAgents}
                  messageTree={messageTree}
                  messages={messages}
                  availableWidth={availableWidth}
                  setCollapsedAgents={setCollapsedAgents}
                  setUserOpenedAgents={setUserOpenedAgents}
                  setFocusedAgentId={setFocusedAgentId}
                  isWaitingForResponse={isWaitingForResponse}
                  timerStartTime={timerStartTime}
                  onToggleCollapsed={onToggleCollapsed}
                />
              </box>
            ))}
          </box>
        )}
      </box>
    )
  },
)
