import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { enableMapSet } from 'immer'

import { initializeThemeStore } from '../../hooks/use-theme'
import { computeTerminalLayout } from '../../hooks/use-terminal-layout'
import { useChatStore } from '../../state/chat-store'
import { useMessageBlockStore } from '../../state/message-block-store'
import { chatThemes, createMarkdownPalette } from '../../utils/theme-system'

import type { ChatMessage } from '../../types/chat'
import type { MarkdownPalette } from '../../utils/markdown-renderer'

type CapturedButton = {
  text: string
  onClick?: (event?: unknown) => void | Promise<unknown>
}

const capturedButtons: CapturedButton[] = []

const textFromReactNode = (node: React.ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }

  if (Array.isArray(node)) {
    return node.map(textFromReactNode).join('')
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return textFromReactNode(node.props.children)
  }

  return ''
}

mock.module('../button', () => ({
  Button: ({
    children,
    onClick,
    ...rest
  }: {
    children?: React.ReactNode
    onClick?: (event?: unknown) => void | Promise<unknown>
    [key: string]: unknown
  }) => {
    capturedButtons.push({ text: textFromReactNode(children), onClick })

    return React.createElement('box', rest, children)
  },
}))

mock.module('../../hooks/use-terminal-layout', () => ({
  computeTerminalLayout,
  useTerminalLayout: () => computeTerminalLayout(80, 24),
}))

const { MessageWithAgents } = await import('../message-with-agents')

enableMapSet()
initializeThemeStore()

const theme = chatThemes.light
const basePalette: MarkdownPalette = createMarkdownPalette(theme)

// -----------------------------------------------------------------------------
// Helper factory functions for creating test messages
// -----------------------------------------------------------------------------

const createUserMessage = (id: string, content: string): ChatMessage => ({
  id,
  variant: 'user',
  content,
  timestamp: new Date().toISOString(),
})

const createAiMessage = (id: string, content: string): ChatMessage => ({
  id,
  variant: 'ai',
  content,
  timestamp: new Date().toISOString(),
})

const createAgentMessage = (
  id: string,
  content: string,
  agentName: string,
  options: Partial<ChatMessage> = {},
): ChatMessage => ({
  id,
  variant: 'agent',
  content,
  timestamp: new Date().toISOString(),
  agent: {
    agentName,
    agentType: 'test-agent',
    responseCount: 1,
  },
  ...options,
})

const createErrorMessage = (id: string, content: string): ChatMessage => ({
  id,
  variant: 'error',
  content,
  timestamp: new Date().toISOString(),
})

// Creates an agent message without the required agent info (for error testing)
const createMalformedAgentMessage = (
  id: string,
  content: string,
): ChatMessage =>
  ({
    id,
    variant: 'agent',
    content,
    timestamp: new Date().toISOString(),
    // Intentionally missing agent property
  }) as ChatMessage

const createModeDividerMessage = (id: string, mode: string): ChatMessage => ({
  id,
  variant: 'ai',
  content: 'this content should be ignored',
  timestamp: new Date().toISOString(),
  blocks: [
    {
      type: 'mode-divider',
      mode,
    },
  ],
})

const defaultCallbacks = {
  onToggleCollapsed: () => {},
  onBuildFast: () => {},
  onFeedback: () => {},
  onCloseFeedback: () => {},
  onEditMessage: () => {},
  onInsertCommand: () => {},
}

const planCommand = '/mode:execute_plan Build it!'

const initializeStore = (
  overrides: {
    messageTree?: Map<string, ChatMessage[]>
    isWaitingForResponse?: boolean
    timerStartTime?: number | null
    availableWidth?: number
  } = {},
) => {
  useMessageBlockStore.setState({
    context: {
      theme,
      markdownPalette: basePalette,
      messageTree: overrides.messageTree ?? new Map<string, ChatMessage[]>(),
      isWaitingForResponse: overrides.isWaitingForResponse ?? false,
      timerStartTime: overrides.timerStartTime ?? null,
      availableWidth: overrides.availableWidth ?? 80,
    },
    callbacks: defaultCallbacks,
  })
}

beforeEach(() => {
  capturedButtons.length = 0
  initializeStore()
  useChatStore.setState({ streamingAgents: new Set<string>() })
})

afterEach(() => {
  capturedButtons.length = 0
  useMessageBlockStore.getState().reset()
  useChatStore.setState({ streamingAgents: new Set<string>() })
})

const baseMessageWithAgentsProps = {
  depth: 0,
  isLastMessage: false,
  availableWidth: 80,
}

// =============================================================================
// MessageBlockStore Tests - store behavior, not JS built-ins
// =============================================================================

describe('MessageBlockStore', () => {
  describe('setContext', () => {
    test('performs partial merge, preserving unspecified values', () => {
      // Set initial state with specific values
      initializeStore({
        isWaitingForResponse: true,
        timerStartTime: 12345,
        availableWidth: 100,
      })

      // Update only one value
      useMessageBlockStore.getState().setContext({
        isWaitingForResponse: false,
      })

      const state = useMessageBlockStore.getState()
      // Updated value should change
      expect(state.context.isWaitingForResponse).toBe(false)
      // Other values should be preserved
      expect(state.context.timerStartTime).toBe(12345)
      expect(state.context.availableWidth).toBe(100)
      expect(state.context.theme).toBe(theme)
    })

    test('updates messageTree without affecting other context values', () => {
      const child1 = createAgentMessage('child-1', 'Content 1', 'Agent One')
      const child2 = createAgentMessage('child-2', 'Content 2', 'Agent Two')
      const newTree = new Map<string, ChatMessage[]>([
        ['parent-1', [child1, child2]],
      ])

      useMessageBlockStore.getState().setContext({
        messageTree: newTree,
      })

      const state = useMessageBlockStore.getState()
      expect(state.context.messageTree).toBe(newTree)
      expect(state.context.messageTree?.get('parent-1')).toHaveLength(2)
      // Theme should be unchanged
      expect(state.context.theme).toBe(theme)
    })

    test('can update multiple context values at once', () => {
      useMessageBlockStore.getState().setContext({
        isWaitingForResponse: true,
        timerStartTime: 99999,
        availableWidth: 200,
      })

      const state = useMessageBlockStore.getState()
      expect(state.context.isWaitingForResponse).toBe(true)
      expect(state.context.timerStartTime).toBe(99999)
      expect(state.context.availableWidth).toBe(200)
    })
  })

  describe('setCallbacks', () => {
    test('replaces entire callbacks object', () => {
      const mockToggle = () => {}
      const mockBuildFast = () => {}
      const mockFeedback = () => {}
      const mockCloseFeedback = () => {}
      const mockInsertCommand = () => {}

      useMessageBlockStore.getState().setCallbacks({
        onToggleCollapsed: mockToggle,
        onBuildFast: mockBuildFast,
        onFeedback: mockFeedback,
        onCloseFeedback: mockCloseFeedback,
        onEditMessage: () => {},
        onInsertCommand: mockInsertCommand,
      })

      const state = useMessageBlockStore.getState()
      expect(state.callbacks.onToggleCollapsed).toBe(mockToggle)
      expect(state.callbacks.onBuildFast).toBe(mockBuildFast)
      expect(state.callbacks.onFeedback).toBe(mockFeedback)
      expect(state.callbacks.onCloseFeedback).toBe(mockCloseFeedback)
      expect(state.callbacks.onInsertCommand).toBe(mockInsertCommand)
    })

    test('onInsertCommand callback receives the command string', () => {
      let insertedCommand: string | undefined
      const mockInsertCommand = (command: string) => {
        insertedCommand = command
      }

      useMessageBlockStore.getState().setCallbacks({
        ...defaultCallbacks,
        onInsertCommand: mockInsertCommand,
      })

      const storedCallback =
        useMessageBlockStore.getState().callbacks.onInsertCommand
      storedCallback('/mode:execute_plan Build it!')

      expect(insertedCommand).toBe('/mode:execute_plan Build it!')
    })

    test('callbacks are independent from context', () => {
      const originalTheme = useMessageBlockStore.getState().context.theme

      useMessageBlockStore.getState().setCallbacks({
        ...defaultCallbacks,
        onToggleCollapsed: () => console.log('new toggle'),
      })

      // Context should be unchanged
      expect(useMessageBlockStore.getState().context.theme).toBe(originalTheme)
    })
  })

  describe('reset', () => {
    test('restores context to initial state', () => {
      // Modify state significantly
      useMessageBlockStore.getState().setContext({
        isWaitingForResponse: true,
        timerStartTime: 12345,
        availableWidth: 200,
        messageTree: new Map([['key', [createAgentMessage('a', 'b', 'c')]]]),
      })

      useMessageBlockStore.getState().reset()

      const state = useMessageBlockStore.getState()
      expect(state.context.theme).toBeNull()
      expect(state.context.isWaitingForResponse).toBe(false)
      expect(state.context.timerStartTime).toBeNull()
      expect(state.context.availableWidth).toBe(80)
    })

    test('restores callbacks to noop functions', () => {
      const mockFn = () => console.log('test')
      useMessageBlockStore.getState().setCallbacks({
        onToggleCollapsed: mockFn,
        onBuildFast: mockFn,
        onFeedback: mockFn,
        onCloseFeedback: mockFn,
        onEditMessage: () => {},
        onInsertCommand: () => {},
      })

      useMessageBlockStore.getState().reset()

      const state = useMessageBlockStore.getState()
      // Callbacks should be noop functions (not undefined)
      expect(typeof state.callbacks.onToggleCollapsed).toBe('function')
      expect(typeof state.callbacks.onBuildFast).toBe('function')
      expect(typeof state.callbacks.onInsertCommand).toBe('function')
      // They should not throw when called
      expect(() => state.callbacks.onToggleCollapsed('test-id')).not.toThrow()
      expect(() =>
        state.callbacks.onInsertCommand('test-command'),
      ).not.toThrow()
    })
  })
})

// =============================================================================
// MessageWithAgents Component Tests - behavior across variants
// =============================================================================

describe('MessageWithAgents', () => {
  describe('message variant rendering', () => {
    test('renders user message content', () => {
      const message = createUserMessage('user-1', 'Hello from user')

      const markup = renderToStaticMarkup(
        <MessageWithAgents {...baseMessageWithAgentsProps} message={message} />,
      )

      expect(markup).toContain('Hello from user')
    })

    test('renders AI message content', () => {
      const message = createAiMessage('ai-1', 'Hello from AI')

      const markup = renderToStaticMarkup(
        <MessageWithAgents {...baseMessageWithAgentsProps} message={message} />,
      )

      expect(markup).toContain('Hello from AI')
    })

    test('renders error message content', () => {
      const message = createErrorMessage('error-1', 'An error occurred')

      const markup = renderToStaticMarkup(
        <MessageWithAgents {...baseMessageWithAgentsProps} message={message} />,
      )

      expect(markup).toContain('An error occurred')
    })

    test('renders agent message with agent name displayed', () => {
      const message = createAgentMessage(
        'agent-1',
        'Agent response',
        'Code Searcher',
      )

      const markup = renderToStaticMarkup(
        <MessageWithAgents {...baseMessageWithAgentsProps} message={message} />,
      )

      expect(markup).toContain('Code Searcher')
      expect(markup).toContain('Agent response')
    })

    test('handles message with markdown content', () => {
      const message = createAiMessage('ai-md', '**Bold** and *italic*')

      const markup = renderToStaticMarkup(
        <MessageWithAgents {...baseMessageWithAgentsProps} message={message} />,
      )

      // Content should be present (markdown rendering may transform it)
      expect(markup).toContain('Bold')
      expect(markup).toContain('italic')
    })

    test('handles empty content without crashing', () => {
      const message = createAiMessage('ai-empty', '')

      const markup = renderToStaticMarkup(
        <MessageWithAgents {...baseMessageWithAgentsProps} message={message} />,
      )

      expect(markup).toBeDefined()
    })
  })

  describe('long user message collapse behavior', () => {
    // A user message with more than MAX_COLLAPSED_LINES (3) lines should be
    // rendered collapsed-by-default with a "Show more" toggle.
    const longUserContent = Array.from(
      { length: 10 },
      (_, i) => `Line ${i + 1}`,
    ).join('\n')

    test('renders a "Show more" toggle for a long complete user message', () => {
      const message: ChatMessage = {
        ...createUserMessage('user-long', longUserContent),
        isComplete: true,
      }

      const markup = renderToStaticMarkup(
        <MessageWithAgents {...baseMessageWithAgentsProps} message={message} />,
      )

      expect(markup).toContain('Show more')
      // Collapsed preview shows only the first few lines plus the truncation marker.
      expect(markup).toContain('Line 1')
      expect(markup).toContain('Line 2')
      expect(markup).toContain('Line 3')
      // Lines beyond the threshold are hidden while collapsed.
      expect(markup).not.toContain('Line 10')
    })

    test('does not collapse a short user message', () => {
      const message: ChatMessage = {
        ...createUserMessage('user-short', 'just one line'),
        isComplete: true,
      }

      const markup = renderToStaticMarkup(
        <MessageWithAgents {...baseMessageWithAgentsProps} message={message} />,
      )

      expect(markup).not.toContain('Show more')
      expect(markup).not.toContain('Show less')
      expect(markup).toContain('just one line')
    })

    test('does not collapse a long AI message (collapse is user-only)', () => {
      const message: ChatMessage = {
        ...createAiMessage('ai-long', longUserContent),
        isComplete: true,
      }

      const markup = renderToStaticMarkup(
        <MessageWithAgents {...baseMessageWithAgentsProps} message={message} />,
      )

      expect(markup).not.toContain('Show more')
      expect(markup).toContain('Line 10')
    })

    test('does not collapse an incomplete (streaming) long user message', () => {
      // An incomplete user message (isComplete: false) is still streaming and
      // should not be collapsed.
      const message: ChatMessage = {
        ...createUserMessage('user-incomplete', longUserContent),
        isComplete: false,
      }

      const markup = renderToStaticMarkup(
        <MessageWithAgents
          {...baseMessageWithAgentsProps}
          message={message}
          isLastMessage={true}
        />,
      )

      // While incomplete, all lines render and no toggle appears.
      expect(markup).not.toContain('Show more')
      expect(markup).toContain('Line 10')
    })
  })

  describe('mode divider block rendering', () => {
    test('renders ModeDivider when message contains only a mode-divider block and ignores content', () => {
      const message = createModeDividerMessage('mode-1', 'Edit Mode')

      const markup = renderToStaticMarkup(
        <MessageWithAgents {...baseMessageWithAgentsProps} message={message} />,
      )

      // Mode text should appear
      expect(markup).toContain('Edit Mode')
      // Original message content should not be rendered
      expect(markup).not.toContain('this content should be ignored')
    })
  })

  describe('error handling', () => {
    test('shows error message when agent message is missing agent info', () => {
      const malformedMessage = createMalformedAgentMessage(
        'bad-agent',
        'This should fail',
      )

      const markup = renderToStaticMarkup(
        <MessageWithAgents
          {...baseMessageWithAgentsProps}
          message={malformedMessage}
        />,
      )

      expect(markup).toContain('Error')
      expect(markup).toContain('Missing agent info')
    })
  })

  describe('collapsed vs expanded agent state', () => {
    test('renders collapsed agent with preview and collapsed indicator', () => {
      const collapsedMessage = createAgentMessage(
        'collapsed-agent',
        'This is the full content\nwith multiple lines\nand the last line is shown',
        'Collapsed Agent',
        {
          metadata: { isCollapsed: true },
        },
      )

      const markup = renderToStaticMarkup(
        <MessageWithAgents
          {...baseMessageWithAgentsProps}
          message={collapsedMessage}
        />,
      )

      expect(markup).toContain('Collapsed Agent')
      // When collapsed, should show the collapsed indicator
      expect(markup).toContain('▸')
      // Preview should be the last line
      expect(markup).toContain('and the last line is shown')
      // First line of full content should not be present as a full block
      expect(markup).not.toContain('This is the full content')
    })

    test('renders expanded agent with full content and expanded indicator', () => {
      const expandedMessage = createAgentMessage(
        'expanded-agent',
        'Full expanded content here',
        'Expanded Agent',
        {
          metadata: { isCollapsed: false },
        },
      )

      const markup = renderToStaticMarkup(
        <MessageWithAgents
          {...baseMessageWithAgentsProps}
          message={expandedMessage}
        />,
      )

      expect(markup).toContain('Expanded Agent')
      expect(markup).toContain('Full expanded content here')
      // When expanded, should show the expanded indicator
      expect(markup).toContain('▾')
    })
  })
})

// =============================================================================
// Callback Integration Tests
// =============================================================================

describe('callback invocation', () => {
  test('callbacks are retrievable from store and callable', () => {
    let toggleCalledWith: string | undefined
    const mockToggle = (id: string) => {
      toggleCalledWith = id
    }

    useMessageBlockStore.getState().setCallbacks({
      ...defaultCallbacks,
      onToggleCollapsed: mockToggle,
    })

    // Verify callback is stored and retrievable
    const storedCallback =
      useMessageBlockStore.getState().callbacks.onToggleCollapsed
    storedCallback('test-message-id')

    expect(toggleCalledWith).toBe('test-message-id')
  })

  test('onFeedback callback receives messageId and options', () => {
    let feedbackMessageId: string | undefined
    let feedbackOptions: object | undefined
    const mockFeedback = (messageId: string, options?: object) => {
      feedbackMessageId = messageId
      feedbackOptions = options
    }

    useMessageBlockStore.getState().setCallbacks({
      ...defaultCallbacks,
      onFeedback: mockFeedback,
    })

    const storedCallback = useMessageBlockStore.getState().callbacks.onFeedback
    storedCallback('msg-123', { category: 'app_bug' })

    expect(feedbackMessageId).toBe('msg-123')
    expect(feedbackOptions).toEqual({ category: 'app_bug' })
  })

  test('plan command button invokes onInsertCommand through MessageWithAgents', () => {
    let insertedCommand: string | undefined
    const onInsertCommand = (command: string) => {
      insertedCommand = command
    }
    const message: ChatMessage = {
      ...createAiMessage('ai-plan', ''),
      blocks: [
        {
          type: 'plan',
          content: 'Plan body',
          metadata: {
            executeCommand: planCommand,
          },
        },
      ],
    }

    initializeStore()
    useMessageBlockStore.getState().setCallbacks({
      ...defaultCallbacks,
      onInsertCommand,
    })

    // renderToStaticMarkup reads Zustand's server snapshot, so mirror the test
    // callback there before rendering and restore both snapshots before asserting.
    const initialCallbacks = useMessageBlockStore.getInitialState().callbacks
    const previousInitialInsertCommand = initialCallbacks.onInsertCommand
    const previousLiveInsertCommand =
      useMessageBlockStore.getState().callbacks.onInsertCommand
    initialCallbacks.onInsertCommand = onInsertCommand

    try {
      renderToStaticMarkup(
        <MessageWithAgents {...baseMessageWithAgentsProps} message={message} />,
      )

      const commandButton = capturedButtons.find(
        (button) =>
          button.text === planCommand && typeof button.onClick === 'function',
      )
      expect(commandButton).toBeDefined()

      commandButton?.onClick?.()
    } finally {
      initialCallbacks.onInsertCommand = previousInitialInsertCommand
      useMessageBlockStore.getState().setCallbacks({
        ...useMessageBlockStore.getState().callbacks,
        onInsertCommand: previousLiveInsertCommand,
      })
    }

    expect(insertedCommand).toBe(planCommand)
  })
})

// =============================================================================
// Layout and visual structure tests
// =============================================================================

describe('layout handling', () => {
  test('renders correctly across different terminal widths', () => {
    const widths = [20, 80, 120, 300]

    for (const width of widths) {
      const message = createAiMessage(
        `width-${width}`,
        `Content at width ${width}`,
      )
      const markup = renderToStaticMarkup(
        <MessageWithAgents
          message={message}
          depth={0}
          isLastMessage={false}
          availableWidth={width}
        />,
      )
      expect(markup.replace(/\n/g, '')).toContain(`Content at width ${width}`)
    }
  })

  test('renders correctly with isLastMessage true and false', () => {
    const message = createAiMessage('last-msg-test', 'Test content')

    const lastMarkup = renderToStaticMarkup(
      <MessageWithAgents
        message={message}
        depth={0}
        isLastMessage={true}
        availableWidth={80}
      />,
    )

    const notLastMarkup = renderToStaticMarkup(
      <MessageWithAgents
        message={message}
        depth={0}
        isLastMessage={false}
        availableWidth={80}
      />,
    )

    expect(lastMarkup).toContain('Test content')
    expect(notLastMarkup).toContain('Test content')
  })
})

describe('vertical line for user messages', () => {
  test('renders vertical line box for user messages only', () => {
    const userMessage = createUserMessage('user-line', 'User content')
    const aiMessage = createAiMessage('ai-no-line', 'AI content')

    const userMarkup = renderToStaticMarkup(
      <MessageWithAgents
        message={userMessage}
        depth={0}
        isLastMessage={false}
        availableWidth={80}
      />,
    )

    const aiMarkup = renderToStaticMarkup(
      <MessageWithAgents
        message={aiMessage}
        depth={0}
        isLastMessage={false}
        availableWidth={80}
      />,
    )

    // Vertical line uses style={{ width: 1, backgroundColor: lineColor }}
    // which becomes width:1px in the style string.
    expect(userMarkup).toContain('width:1px')
    expect(aiMarkup).not.toContain('width:1px')
  })
})
