import { describe, test, expect } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../hooks/use-theme'
import { chatThemes, createMarkdownPalette } from '../../utils/theme-system'
import { MessageBlock } from '../message-block'

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
  autoCollapsedAgents: new Set<string>(),
  streamingAgents: new Set<string>(),
  onToggleCollapsed: () => {},
  onBuildFast: () => {},
  onBuildMax: () => {},
  onBuildFree: () => {},
  setCollapsedAgents: () => {},
  addAutoCollapsedAgent: () => {},
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

  test('pluralizes credit label correctly', () => {
    const singularMarkup = renderToStaticMarkup(
      <MessageBlock
        {...baseProps}
        isComplete={true}
        completionTime="7s"
        credits={1}
      />,
    )
    expect(singularMarkup).toContain('1 credit')

    const pluralMarkup = renderToStaticMarkup(
      <MessageBlock
        {...baseProps}
        isComplete={true}
        completionTime="7s"
        credits={4}
      />,
    )
    expect(pluralMarkup).toContain('4 credits')
  })
})
