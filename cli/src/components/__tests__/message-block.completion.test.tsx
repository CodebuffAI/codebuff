import React from 'react'

import { describe, test, expect } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { MessageBlock } from '../message-block'
import '../../state/theme-store' // Initialize theme store
import { chatThemes, createMarkdownPalette } from '../../utils/theme-system'
import type { MarkdownPalette } from '../../utils/markdown-renderer'

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
  timerStartTime: null,
  textColor: theme.foreground,
  timestampColor: theme.muted,
  markdownOptions: {
    codeBlockWidth: 72,
    palette,
  },
  availableWidth: 80,
  markdownPalette: basePalette,
  collapsedAgents: new Set<string>(),
  streamingAgents: new Set<string>(),
  onToggleCollapsed: () => {},
}

describe('MessageBlock completion time', () => {
  test('renders completion time and credits when complete', () => {
    const markup = renderToStaticMarkup(
      <MessageBlock
        {...baseProps}
        isComplete={true}
        completionTime="7s"
        credits={3}
      />,
    )

    expect(markup).toContain('7s')
    expect(markup).toContain('3 credits')
  })

  test('omits completion line when not complete', () => {
    const markup = renderToStaticMarkup(
      <MessageBlock
        {...baseProps}
        isComplete={false}
        completionTime="7s"
        credits={3}
      />,
    )

    expect(markup).not.toContain('7s')
    expect(markup).not.toContain('3 credits')
  })
})
