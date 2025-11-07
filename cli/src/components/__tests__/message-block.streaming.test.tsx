import React from 'react'

import { describe, test, expect } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { MessageBlock } from '../message-block'
import '../../state/theme-store' // Initialize theme store
import { chatThemes, createMarkdownPalette } from '../../utils/theme-system'

const theme = chatThemes.dark
const markdownPalette = createMarkdownPalette(theme)

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
    palette: markdownPalette,
  },
  availableWidth: 80,
  collapsedAgents: new Set<string>(),
  streamingAgents: new Set<string>(),
  onToggleCollapsed: () => {},
}

const createTimer = (elapsedSeconds: number) => ({
  start: () => {},
  stop: () => {},
  elapsedSeconds,
  startTime: elapsedSeconds > 0 ? Date.now() - elapsedSeconds * 1000 : null,
})

describe('MessageBlock streaming indicator', () => {
  test('shows elapsed seconds while streaming', () => {
    const markup = renderToStaticMarkup(
      <MessageBlock {...baseProps} isLoading={true} timer={createTimer(4)} markdownPalette={markdownPalette} />,
    )

    expect(markup).toContain('4s')
  })

  test('hides elapsed seconds when timer has not advanced', () => {
    const markup = renderToStaticMarkup(
      <MessageBlock {...baseProps} isLoading={true} timer={createTimer(0)} markdownPalette={markdownPalette} />,
    )

    expect(markup).not.toContain('0s')
  })
})
