import { describe, test, expect } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../hooks/use-theme'
import { chatThemes, createMarkdownPalette } from '../../utils/theme-system'
import { MessageBlock } from '../message-block'
import { MessageActionsProvider } from '../../contexts/message-actions-context'
import { ChatThemeProvider } from '../../contexts/chat-theme-context'

import type { MarkdownPalette } from '../../utils/markdown-renderer'

const theme = chatThemes.dark

const basePalette = createMarkdownPalette(theme)

const palette: MarkdownPalette = {
  ...basePalette,
  inlineCodeFg: theme.foreground,
  codeTextFg: theme.foreground,
}

const baseProps = {
  messageId: 'ai-stream',
  blocks: undefined,
  content: 'Streaming response...',
  isUser: false,
  isAi: true,
  isComplete: false,
  timestamp: '12:00',
  completionTime: undefined,
  credits: undefined,
  textColor: theme.foreground,
  timestampColor: theme.muted,
  markdownOptions: {
    codeBlockWidth: 72,
    palette,
  },
  streamingAgents: new Set<string>(),
}

const messageActions = {
  onToggleCollapsed: () => {},
  onBuildFast: () => {},
  onBuildMax: () => {},
  onFeedback: () => {},
  onCloseFeedback: () => {},
}

const createThemeContext = (timerStartTime: number | null) => ({
  theme,
  markdownPalette: basePalette,
  availableWidth: 80,
  timerStartTime,
})

const createTimerStartTime = (elapsedSeconds: number): number | null =>
  elapsedSeconds > 0 ? Date.now() - elapsedSeconds * 1000 : null

describe('MessageBlock streaming indicator', () => {
  test('shows elapsed seconds while streaming', () => {
    const markup = renderToStaticMarkup(
      <MessageActionsProvider value={messageActions}>
        <ChatThemeProvider value={createThemeContext(createTimerStartTime(4))}>
          <MessageBlock {...baseProps} isLoading={true} />
        </ChatThemeProvider>
      </MessageActionsProvider>,
    )

    expect(markup).toContain('4s')
  })

  test('hides elapsed seconds when timer has not advanced', () => {
    const markup = renderToStaticMarkup(
      <MessageActionsProvider value={messageActions}>
        <ChatThemeProvider value={createThemeContext(createTimerStartTime(0))}>
          <MessageBlock {...baseProps} isLoading={true} />
        </ChatThemeProvider>
      </MessageActionsProvider>,
    )

    expect(markup).not.toContain('0s')
  })
})
initializeThemeStore()
