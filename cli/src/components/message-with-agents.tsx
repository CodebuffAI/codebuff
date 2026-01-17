import { TextAttributes } from '@opentui/core'
import { memo, useCallback, useMemo, type ReactNode } from 'react'
import React from 'react'

import { Button } from './button'
import { ErrorBoundary } from './error-boundary'
import { GridLayout } from './grid-layout'
import { MessageBlock } from './message-block'
import { ModeDivider } from './mode-divider'
import {
  renderMarkdown,
  hasMarkdown,
  type MarkdownPalette,
} from '../utils/markdown-renderer'
import { AGENT_CONTENT_HORIZONTAL_PADDING, MAX_AGENT_DEPTH } from '../utils/layout-helpers'
import { getCliEnv } from '../utils/env'

import type { ChatMessage } from '../types/chat'
import type { ChatTheme } from '../types/theme-system'

interface AgentChildrenGridProps {
  agentChildren: ChatMessage[]
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

const AgentChildrenGrid = memo(
  ({
    agentChildren,
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
  }: AgentChildrenGridProps) => {
    const getItemKey = useCallback((agent: ChatMessage) => agent.id, [])

    const renderAgentChild = useCallback(
      (agent: ChatMessage, _idx: number, columnWidth: number) => (
        <MessageWithAgents
          message={agent}
          depth={depth + 1}
          isLastMessage={false}
          theme={theme}
          markdownPalette={markdownPalette}
          streamingAgents={streamingAgents}
          messageTree={messageTree}
          messages={messages}
          availableWidth={columnWidth}
          setFocusedAgentId={setFocusedAgentId}
          isWaitingForResponse={isWaitingForResponse}
          timerStartTime={timerStartTime}
          onToggleCollapsed={onToggleCollapsed}
          onBuildFast={onBuildFast}
          onBuildMax={onBuildMax}
          onFeedback={onFeedback}
          onCloseFeedback={onCloseFeedback}
        />
      ),
      [
        depth,
        theme,
        markdownPalette,
        streamingAgents,
        messageTree,
        messages,
        setFocusedAgentId,
        isWaitingForResponse,
        timerStartTime,
        onToggleCollapsed,
        onBuildFast,
        onBuildMax,
        onFeedback,
        onCloseFeedback,
      ],
    )

    if (agentChildren.length === 0) return null

    if (depth >= MAX_AGENT_DEPTH) {
      if (getCliEnv().NODE_ENV === 'development') {
        console.warn(
          `[AgentChildrenGrid] Depth limit (${MAX_AGENT_DEPTH}) reached, truncating agent tree`,
        )
      }
      return (
        <text fg={theme.muted} attributes={TextAttributes.ITALIC}>
          {`${agentChildren.length} nested agent${
            agentChildren.length > 1 ? 's' : ''
          } not shown (depth limit)`}
        </text>
      )
    }

    const errorFallback = (
      <text fg={theme.error}>Error rendering agent children</text>
    )

    return (
      <ErrorBoundary fallback={errorFallback} componentName="AgentChildrenGrid">
        <GridLayout
          items={agentChildren}
          availableWidth={availableWidth}
          getItemKey={getItemKey}
          renderItem={renderAgentChild}
        />
      </ErrorBoundary>
    )
  },
)

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

    // Memoize onOpenFeedback to prevent unnecessary re-renders
    const onOpenFeedback = useCallback(
      (options?: {
        category?: string
        footerMessage?: string
        errors?: Array<{ id: string; message: string }>
      }) => {
        onFeedback(message.id, options)
      },
      [onFeedback, message.id],
    )

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
    const textColor = theme.foreground
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
    // Show vertical line for user messages (including bash commands which are now user messages)
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
                  userError={message.userError}
                  onOpenFeedback={onOpenFeedback}
                  attachments={message.attachments}
                  textAttachments={message.textAttachments}
                  metadata={message.metadata}
                  isLastMessage={isLastMessage}
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
                validationErrors={message.validationErrors}
                userError={message.userError}
                onOpenFeedback={onOpenFeedback}
                attachments={message.attachments}
                textAttachments={message.textAttachments}
                metadata={message.metadata}
                isLastMessage={isLastMessage}
              />
            </box>
          )}
        </box>

        {hasAgentChildren && (
          <AgentChildrenGrid
            agentChildren={agentChildren}
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
    // Guard against missing agent info (should not happen for agent variant messages)
    if (!message.agent) {
      return (
        <text fg={theme.error}>
          Error: Missing agent info for agent message
        </text>
      )
    }
    const agentInfo = message.agent

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

    const agentCodeBlockWidth = Math.max(10, availableWidth - AGENT_CONTENT_HORIZONTAL_PADDING)
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

    const handleTitleClick = (): void => {
      onToggleCollapsed(message.id)
      setFocusedAgentId(message.id)
    }

    const handleContentClick = (): void => {
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
          <AgentChildrenGrid
            agentChildren={agentChildren}
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
        )}
      </box>
    )
  },
)
