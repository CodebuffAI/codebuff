import React from 'react'

import { describe, test, expect } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { MessageBlock } from '../message-block'
import '../../state/theme-store' // Initialize theme store
import { chatThemes } from '../../utils/theme-system'

const theme = chatThemes.dark

// No custom markdown palette; rely on defaults

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
      <MessageBlock
        {...baseProps}
        isLoading={true}
        timer={createTimer(4)}
      />,
    )

    expect(markup).toContain('4s')
  })

  test('hides elapsed seconds when timer has not advanced', () => {
    const markup = renderToStaticMarkup(
      <MessageBlock
        {...baseProps}
        isLoading={true}
        timer={createTimer(0)}
      />,
    )

    expect(markup).not.toContain('0s')
  })
})
