import { TextAttributes } from '@opentui/core'
import { memo, useMemo, type ReactNode } from 'react'
import React from 'react'

import { MessageBlock } from './message-block'
import { ModeDivider } from './mode-divider'
import { Button } from './button'
import {
  renderMarkdown,
  hasMarkdown,
  type MarkdownPalette,
} from '../utils/markdown-renderer'

import type { ChatMessage } from '../types/chat'
import type { ChatTheme } from '../types/theme-system'

interface MessageWithAgentsProps {
  message: ChatMessage
  depth: number
  isLastMessage: boolean
  theme: ChatTheme
  markdownPalette: MarkdownPalette
  streamingAgents: Set<string>
  messageTree: Map<string, ChatMessage[]>
  messages: ChatMessage[]
  availableWidth: number
  setFocusedAgentId: React.Dispatch<React.SetStateAction<string | null>>
  isWaitingForResponse: boolean
  timerStartTime: number | null
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  onFeedback: (
    messageId: string,
    options?: {
      category?: string
      footerMessage?: string
      errors?: Array<{ id: string; message: string }>
    },
  ) => void
  onCloseFeedback: () => void
}

export const MessageWithAgents = memo(
  ({
    message,
    depth,
    isLastMessage,
    theme,
    markdownPalette,
    streamingAgents,
    messageTree,
    messages,
    availableWidth,
    setFocusedAgentId,
    isWaitingForResponse,
    timerStartTime,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
    onFeedback,
    onCloseFeedback,
  }: MessageWithAgentsProps): ReactNode => {
    const SIDE_GUTTER = 1
    const isAgent = message.variant === 'agent'

    const contentBoxStyle = useMemo(
      () => ({
        backgroundColor: theme.background,
        padding: 0,
        paddingLeft: SIDE_GUTTER,
        paddingRight: SIDE_GUTTER,
        paddingTop: 0,
        paddingBottom: 0,
        gap: 0,
        width: '100%' as const,
        flexGrow: 1,
        justifyContent: 'center' as const,
      }),
      [theme.background],
    )

    if (isAgent) {
      return (
        <AgentMessage
          message={message}
          depth={depth}
          theme={theme}
          markdownPalette={markdownPalette}
          streamingAgents={streamingAgents}
          messageTree={messageTree}
          messages={messages}
          availableWidth={availableWidth}
          setFocusedAgentId={setFocusedAgentId}
          isWaitingForResponse={isWaitingForResponse}
          timerStartTime={timerStartTime}
          onToggleCollapsed={onToggleCollapsed}
          onBuildFast={onBuildFast}
          onBuildMax={onBuildMax}
          onFeedback={onFeedback}
          onCloseFeedback={onCloseFeedback}
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
          paddingBottom: isLastMessage ? 0 : 1,
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
              <box style={contentBoxStyle}>
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
                  streamingAgents={streamingAgents}
                  onToggleCollapsed={onToggleCollapsed}
                  onBuildFast={onBuildFast}
                  onBuildMax={onBuildMax}
                  onFeedback={onFeedback}
                  onCloseFeedback={onCloseFeedback}
                  validationErrors={message.validationErrors}
                  onOpenFeedback={
                    onFeedback
                      ? (options) => onFeedback(message.id, options)
                      : undefined
                  }
                />
              </box>
            </box>
          ) : (
            <box style={contentBoxStyle}>
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
                streamingAgents={streamingAgents}
                onToggleCollapsed={onToggleCollapsed}
                onBuildFast={onBuildFast}
                onBuildMax={onBuildMax}
                onFeedback={onFeedback}
                onCloseFeedback={onCloseFeedback}
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
                  streamingAgents={streamingAgents}
                  messageTree={messageTree}
                  messages={messages}
                  availableWidth={availableWidth}
                  setFocusedAgentId={setFocusedAgentId}
                  isWaitingForResponse={isWaitingForResponse}
                  timerStartTime={timerStartTime}
                  onToggleCollapsed={onToggleCollapsed}
                  onBuildFast={onBuildFast}
                  onBuildMax={onBuildMax}
                  onFeedback={onFeedback}
                  onCloseFeedback={onCloseFeedback}
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
  streamingAgents: Set<string>
  messageTree: Map<string, ChatMessage[]>
  messages: ChatMessage[]
  availableWidth: number
  setFocusedAgentId: React.Dispatch<React.SetStateAction<string | null>>
  isWaitingForResponse: boolean
  timerStartTime: number | null
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  onFeedback: (
    messageId: string,
    options?: {
      category?: string
      footerMessage?: string
      errors?: Array<{ id: string; message: string }>
    },
  ) => void
  onCloseFeedback: () => void
}

const AgentMessage = memo(
  ({
    message,
    depth,
    theme,
    markdownPalette,
    streamingAgents,
    messageTree,
    messages,
    availableWidth,
    setFocusedAgentId,
    isWaitingForResponse,
    timerStartTime,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
    onFeedback,
    onCloseFeedback,
  }: AgentMessageProps): ReactNode => {
    const agentInfo = message.agent!

    // Get or initialize collapse state from message metadata
    const isCollapsed = message.metadata?.isCollapsed ?? false
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

      onToggleCollapsed(message.id)
      setFocusedAgentId(message.id)
    }

    const handleContentClick = (e: any): void => {
      if (e && e.stopPropagation) {
        e.stopPropagation()
      }

      if (!isCollapsed) {
        return
      }

      onToggleCollapsed(message.id)
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
            <Button
              style={{
                flexDirection: 'row',
                alignSelf: 'flex-start',
                backgroundColor: isCollapsed ? theme.muted : theme.success,
                paddingLeft: 1,
                paddingRight: 1,
              }}
              onClick={handleTitleClick}
            >
              <text style={{ wrapMode: 'word' }}>
                <span fg={theme.foreground}>{isCollapsed ? '▸ ' : '▾ '}</span>
                <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
                  {agentInfo.agentName}
                </span>
              </text>
            </Button>
            <Button
              style={{ flexShrink: 1, paddingBottom: isCollapsed ? 1 : 0 }}
              onClick={handleContentClick}
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
            </Button>
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
                  streamingAgents={streamingAgents}
                  messageTree={messageTree}
                  messages={messages}
                  availableWidth={availableWidth}
                  setFocusedAgentId={setFocusedAgentId}
                  isWaitingForResponse={isWaitingForResponse}
                  timerStartTime={timerStartTime}
                onToggleCollapsed={onToggleCollapsed}
                onBuildFast={onBuildFast}
                onBuildMax={onBuildMax}
                onFeedback={onFeedback}
                onCloseFeedback={onCloseFeedback}
              />
              </box>
            ))}
          </box>
        )}
      </box>
    )
  },
)
