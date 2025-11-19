import { describe, test, expect } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../hooks/use-theme'
import { chatThemes, createMarkdownPalette } from '../../utils/theme-system'
import { MessageBlock } from '../message-block'
import { MessageActionsProvider } from '../../contexts/message-actions-context'
import { ChatThemeProvider } from '../../contexts/chat-theme-context'

import type { MarkdownPalette } from '../../utils/markdown-renderer'

initializeThemeStore()

const theme = chatThemes.dark

const basePalette = createMarkdownPalette(theme)

const palette: MarkdownPalette = {
  ...basePalette,
  inlineCodeFg: theme.foreground,
  codeTextFg: theme.foreground,
}

const baseProps = {
  messageId: 'ai-1',
  blocks: undefined,
  content: 'Hello there',
  isUser: false,
  isAi: true,
  isLoading: false,
  timestamp: '12:00',
  isComplete: false,
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

const themeContext = {
  theme,
  markdownPalette: basePalette,
  availableWidth: 80,
  timerStartTime: null,
}

describe('MessageBlock completion time', () => {
  test('renders completion time and credits when complete', () => {
    const markup = renderToStaticMarkup(
      <MessageActionsProvider value={messageActions}>
        <ChatThemeProvider value={themeContext}>
          <MessageBlock
            {...baseProps}
            isComplete={true}
            completionTime="7s"
            credits={3}
          />
        </ChatThemeProvider>
      </MessageActionsProvider>,
    )

    expect(markup).toContain('7s')
    expect(markup).toContain('3 credits')
  })

  test('omits completion line when not complete', () => {
    const markup = renderToStaticMarkup(
      <MessageActionsProvider value={messageActions}>
        <ChatThemeProvider value={themeContext}>
          <MessageBlock
            {...baseProps}
            isComplete={false}
            completionTime="7s"
            credits={3}
          />
        </ChatThemeProvider>
      </MessageActionsProvider>,
    )

    expect(markup).not.toContain('7s')
    expect(markup).not.toContain('3 credits')
  })

  test('pluralizes credit label correctly', () => {
    const singularMarkup = renderToStaticMarkup(
      <MessageActionsProvider value={messageActions}>
        <ChatThemeProvider value={themeContext}>
          <MessageBlock
            {...baseProps}
            isComplete={true}
            completionTime="7s"
            credits={1}
          />
        </ChatThemeProvider>
      </MessageActionsProvider>,
    )
    expect(singularMarkup).toContain('1 credit')

    const pluralMarkup = renderToStaticMarkup(
      <MessageActionsProvider value={messageActions}>
        <ChatThemeProvider value={themeContext}>
          <MessageBlock
            {...baseProps}
            isComplete={true}
            completionTime="7s"
            credits={4}
          />
        </ChatThemeProvider>
      </MessageActionsProvider>,
    )
    expect(pluralMarkup).toContain('4 credits')
  })
})
