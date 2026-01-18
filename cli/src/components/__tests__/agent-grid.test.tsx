import { describe, test, expect } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../hooks/use-theme'
import { chatThemes, createMarkdownPalette } from '../../utils/theme-system'
import { MessageBlock } from '../message-block'
import { MessageWithAgents } from '../message-with-agents'

import type { MarkdownPalette } from '../../utils/markdown-renderer'
import type { AgentContentBlock, ContentBlock, ChatMessage } from '../../types/chat'

initializeThemeStore()

const theme = chatThemes.dark
const basePalette = createMarkdownPalette(theme)

const palette: MarkdownPalette = {
  ...basePalette,
  inlineCodeFg: theme.foreground,
  codeTextFg: theme.foreground,
}

const createAgentBlock = (
  agentId: string,
  agentName: string,
  agentType: string,
  status: 'running' | 'complete' | 'failed' = 'complete',
): AgentContentBlock => ({
  type: 'agent',
  agentId,
  agentName,
  agentType,
  content: `Content for ${agentName}`,
  status,
  blocks: [],
})

const createImplementorAgent = (
  agentId: string,
  index: number,
): AgentContentBlock => ({
  type: 'agent',
  agentId,
  agentName: `Implementor ${index}`,
  agentType: 'editor-implementor',
  content: '',
  status: 'complete',
  blocks: [
    {
      type: 'tool',
      toolCallId: `tool-${agentId}`,
      toolName: 'propose_str_replace',
      input: { path: 'file.ts', replacements: [{ old: 'a', new: 'b' }] },
    },
  ],
})

const baseMessageBlockProps = {
  messageId: 'test-message',
  content: '',
  isUser: false,
  isAi: true,
  isLoading: false,
  timestamp: '12:00',
  isComplete: true,
  completionTime: undefined,
  credits: undefined,
  timerStartTime: null,
  textColor: theme.foreground,
  timestampColor: theme.muted,
  markdownOptions: {
    codeBlockWidth: 72,
    palette,
  },
  availableWidth: 120,
  markdownPalette: basePalette,
  collapsedAgents: new Set<string>(),
  autoCollapsedAgents: new Set<string>(),
  streamingAgents: new Set<string>(),
  onToggleCollapsed: () => {},
  onBuildFast: () => {},
  onBuildMax: () => {},
  setCollapsedAgents: () => {},
  addAutoCollapsedAgent: () => {},
}

const createAgentMessage = (
  id: string,
  agentName: string,
  parentId?: string,
): ChatMessage => ({
  id,
  variant: 'agent',
  content: `Agent ${agentName} content`,
  timestamp: '12:00',
  isComplete: true,
  agent: {
    agentName,
    agentType: 'file-picker',
    responseCount: 0,
  },
  parentId,
})

const baseMessageWithAgentsProps = {
  depth: 0,
  isLastMessage: false,
  theme,
  markdownPalette: basePalette,
  streamingAgents: new Set<string>(),
  messages: [] as ChatMessage[],
  availableWidth: 120,
  setFocusedAgentId: () => {},
  isWaitingForResponse: false,
  timerStartTime: null,
  onToggleCollapsed: () => {},
  onBuildFast: () => {},
  onBuildMax: () => {},
  onFeedback: () => {},
  onCloseFeedback: () => {},
}

describe('AgentBlockGrid (via MessageBlock)', () => {
  describe('single agent rendering', () => {
    test('renders a single agent without header', () => {
      const blocks: ContentBlock[] = [
        createAgentBlock('agent-1', 'File Picker', 'file-picker'),
      ]

      const markup = renderToStaticMarkup(
        <MessageBlock {...baseMessageBlockProps} blocks={blocks} />,
      )

      expect(markup).toContain('File Picker')
      // Single agent should not show "1 agent completed" header
      expect(markup).not.toContain('1 agent')
    })
  })

  describe('multiple agents rendering', () => {
    test('renders multiple agents without footer label', () => {
      const blocks: ContentBlock[] = [
        createAgentBlock('agent-1', 'File Picker', 'file-picker'),
        createAgentBlock('agent-2', 'Code Searcher', 'code-searcher'),
        createAgentBlock('agent-3', 'Commander', 'commander'),
      ]

      const markup = renderToStaticMarkup(
        <MessageBlock {...baseMessageBlockProps} blocks={blocks} />,
      )

      expect(markup).toContain('File Picker')
      expect(markup).toContain('Code Searcher')
      expect(markup).toContain('Commander')
      // Footer label was removed as redundant
      expect(markup).not.toContain('agents completed')
    })

    test('renders running agents without footer label', () => {
      const blocks: ContentBlock[] = [
        createAgentBlock('agent-1', 'File Picker', 'file-picker', 'running'),
        createAgentBlock('agent-2', 'Code Searcher', 'code-searcher', 'running'),
      ]

      const markup = renderToStaticMarkup(
        <MessageBlock {...baseMessageBlockProps} blocks={blocks} />,
      )

      expect(markup).toContain('File Picker')
      expect(markup).toContain('Code Searcher')
      // Footer label was removed as redundant
      expect(markup).not.toContain('agents running')
    })
  })

  describe('implementor agents (should use ImplementorGroup instead)', () => {
    test('renders implementor agents separately from regular agents', () => {
      const blocks: ContentBlock[] = [
        createAgentBlock('agent-1', 'File Picker', 'file-picker'),
        createImplementorAgent('impl-1', 1),
        createImplementorAgent('impl-2', 2),
      ]

      const markup = renderToStaticMarkup(
        <MessageBlock {...baseMessageBlockProps} blocks={blocks} />,
      )

      // Regular agent should be rendered
      expect(markup).toContain('File Picker')
      // Implementor agents should be grouped separately and show model names
      // ImplementorGroup renders "Sonnet #1", "Sonnet #2" etc. for editor-implementor agents
      expect(markup).toContain('Sonnet')
    })
  })

  describe('mixed block types', () => {
    test('renders agents interspersed with text blocks', () => {
      const blocks: ContentBlock[] = [
        { type: 'text', content: 'Before agents' },
        createAgentBlock('agent-1', 'File Picker', 'file-picker'),
        createAgentBlock('agent-2', 'Code Searcher', 'code-searcher'),
        { type: 'text', content: 'After agents' },
      ]

      const markup = renderToStaticMarkup(
        <MessageBlock {...baseMessageBlockProps} blocks={blocks} />,
      )

      expect(markup).toContain('Before agents')
      expect(markup).toContain('File Picker')
      expect(markup).toContain('Code Searcher')
      expect(markup).toContain('After agents')
    })

    test('groups only consecutive non-implementor agents', () => {
      const blocks: ContentBlock[] = [
        createAgentBlock('agent-1', 'File Picker 1', 'file-picker'),
        createAgentBlock('agent-2', 'File Picker 2', 'file-picker'),
        { type: 'text', content: 'Separator' },
        createAgentBlock('agent-3', 'Commander', 'commander'),
      ]

      const markup = renderToStaticMarkup(
        <MessageBlock {...baseMessageBlockProps} blocks={blocks} />,
      )

      expect(markup).toContain('File Picker 1')
      expect(markup).toContain('File Picker 2')
      expect(markup).toContain('Separator')
      expect(markup).toContain('Commander')
    })
  })

  describe('empty and edge cases', () => {
    test('handles empty blocks array', () => {
      const markup = renderToStaticMarkup(
        <MessageBlock {...baseMessageBlockProps} blocks={[]} />,
      )

      // Should render without errors
      expect(markup).toBeDefined()
    })

    test('handles blocks with no agents', () => {
      const blocks: ContentBlock[] = [
        { type: 'text', content: 'Just text' },
      ]

      const markup = renderToStaticMarkup(
        <MessageBlock {...baseMessageBlockProps} blocks={blocks} />,
      )

      expect(markup).toContain('Just text')
      expect(markup).not.toContain('agent')
    })
  })
})

describe('AgentChildrenGrid (via MessageWithAgents)', () => {
  describe('single child agent', () => {
    test('renders a single child agent', () => {
      const parentMessage: ChatMessage = {
        id: 'parent-1',
        variant: 'ai',
        content: 'Parent message',
        timestamp: '12:00',
        isComplete: true,
      }

      const childAgent = createAgentMessage('child-1', 'Child Agent', 'parent-1')

      const messageTree = new Map<string, ChatMessage[]>([
        ['parent-1', [childAgent]],
      ])

      const markup = renderToStaticMarkup(
        <MessageWithAgents
          {...baseMessageWithAgentsProps}
          message={parentMessage}
          messageTree={messageTree}
          messages={[parentMessage, childAgent]}
        />,
      )

      expect(markup).toContain('Child Agent')
    })
  })

  describe('multiple child agents', () => {
    test('renders multiple child agents', () => {
      const parentMessage: ChatMessage = {
        id: 'parent-1',
        variant: 'ai',
        content: 'Parent message',
        timestamp: '12:00',
        isComplete: true,
      }

      const children = [
        createAgentMessage('child-1', 'Agent One', 'parent-1'),
        createAgentMessage('child-2', 'Agent Two', 'parent-1'),
        createAgentMessage('child-3', 'Agent Three', 'parent-1'),
      ]

      const messageTree = new Map<string, ChatMessage[]>([
        ['parent-1', children],
      ])

      const markup = renderToStaticMarkup(
        <MessageWithAgents
          {...baseMessageWithAgentsProps}
          message={parentMessage}
          messageTree={messageTree}
          messages={[parentMessage, ...children]}
        />,
      )

      expect(markup).toContain('Agent One')
      expect(markup).toContain('Agent Two')
      expect(markup).toContain('Agent Three')
    })
  })

  describe('nested agent hierarchy', () => {
    test('renders nested child agents', () => {
      const parentMessage: ChatMessage = {
        id: 'parent-1',
        variant: 'ai',
        content: 'Parent message',
        timestamp: '12:00',
        isComplete: true,
      }

      const child1 = createAgentMessage('child-1', 'Level 1 Agent', 'parent-1')
      const grandchild = createAgentMessage('grandchild-1', 'Level 2 Agent', 'child-1')

      const messageTree = new Map<string, ChatMessage[]>([
        ['parent-1', [child1]],
        ['child-1', [grandchild]],
      ])

      const markup = renderToStaticMarkup(
        <MessageWithAgents
          {...baseMessageWithAgentsProps}
          message={parentMessage}
          messageTree={messageTree}
          messages={[parentMessage, child1, grandchild]}
        />,
      )

      expect(markup).toContain('Level 1 Agent')
      expect(markup).toContain('Level 2 Agent')
    })
  })

  describe('depth limiting', () => {
    test('respects MAX_AGENT_DEPTH limit', () => {
      // Create a deeply nested hierarchy (11 levels)
      const messages: ChatMessage[] = []
      const messageTree = new Map<string, ChatMessage[]>()

      const rootMessage: ChatMessage = {
        id: 'root',
        variant: 'ai',
        content: 'Root',
        timestamp: '12:00',
        isComplete: true,
      }
      messages.push(rootMessage)

      let parentId = 'root'
      for (let i = 1; i <= 12; i++) {
        const agent = createAgentMessage(`agent-${i}`, `Agent Level ${i}`, parentId)
        messages.push(agent)
        messageTree.set(parentId, [agent])
        parentId = agent.id
      }

      const markup = renderToStaticMarkup(
        <MessageWithAgents
          {...baseMessageWithAgentsProps}
          message={rootMessage}
          messageTree={messageTree}
          messages={messages}
        />,
      )

      // Should render agents up to MAX_AGENT_DEPTH (10)
      expect(markup).toContain('Agent Level 1')
      expect(markup).toContain('Agent Level 9')
      // Agent Level 11 and 12 should be cut off by depth limit
      expect(markup).not.toContain('Agent Level 11')
      expect(markup).not.toContain('Agent Level 12')
    })
  })

  describe('empty children', () => {
    test('handles message with no children', () => {
      const message: ChatMessage = {
        id: 'msg-1',
        variant: 'ai',
        content: 'No children',
        timestamp: '12:00',
        isComplete: true,
      }

      const messageTree = new Map<string, ChatMessage[]>()

      const markup = renderToStaticMarkup(
        <MessageWithAgents
          {...baseMessageWithAgentsProps}
          message={message}
          messageTree={messageTree}
          messages={[message]}
        />,
      )

      expect(markup).toContain('No children')
    })

    test('handles empty children array in messageTree', () => {
      const message: ChatMessage = {
        id: 'msg-1',
        variant: 'ai',
        content: 'Empty children',
        timestamp: '12:00',
        isComplete: true,
      }

      const messageTree = new Map<string, ChatMessage[]>([
        ['msg-1', []],
      ])

      const markup = renderToStaticMarkup(
        <MessageWithAgents
          {...baseMessageWithAgentsProps}
          message={message}
          messageTree={messageTree}
          messages={[message]}
        />,
      )

      expect(markup).toContain('Empty children')
    })
  })

  describe('streaming agents', () => {
    test('passes streaming state to child agents', () => {
      const parentMessage: ChatMessage = {
        id: 'parent-1',
        variant: 'ai',
        content: 'Parent',
        timestamp: '12:00',
        isComplete: true,
      }

      const streamingChild: ChatMessage = {
        id: 'streaming-agent',
        variant: 'agent',
        content: 'Processing...',
        timestamp: '12:00',
        isComplete: false,
        agent: {
          agentName: 'Streaming Agent',
          agentType: 'file-picker',
          responseCount: 0,
        },
        parentId: 'parent-1',
      }

      const messageTree = new Map<string, ChatMessage[]>([
        ['parent-1', [streamingChild]],
      ])

      const markup = renderToStaticMarkup(
        <MessageWithAgents
          {...baseMessageWithAgentsProps}
          message={parentMessage}
          messageTree={messageTree}
          messages={[parentMessage, streamingChild]}
          streamingAgents={new Set(['streaming-agent'])}
        />,
      )

      expect(markup).toContain('Streaming Agent')
    })
  })
})

describe('Grid layout width handling', () => {
  test('renders with narrow width (single column)', () => {
    const blocks: ContentBlock[] = [
      createAgentBlock('agent-1', 'Agent 1', 'file-picker'),
      createAgentBlock('agent-2', 'Agent 2', 'code-searcher'),
    ]

    // Width below SM_THRESHOLD (60) should force single column
    const markup = renderToStaticMarkup(
      <MessageBlock {...baseMessageBlockProps} blocks={blocks} availableWidth={50} />,
    )

    expect(markup).toContain('Agent 1')
    expect(markup).toContain('Agent 2')
  })

  test('renders with medium width (up to 2 columns)', () => {
    const blocks: ContentBlock[] = [
      createAgentBlock('agent-1', 'Agent 1', 'file-picker'),
      createAgentBlock('agent-2', 'Agent 2', 'code-searcher'),
    ]

    // Width between MD_THRESHOLD (100) should allow 2 columns
    const markup = renderToStaticMarkup(
      <MessageBlock {...baseMessageBlockProps} blocks={blocks} availableWidth={100} />,
    )

    expect(markup).toContain('Agent 1')
    expect(markup).toContain('Agent 2')
  })

  test('renders with wide width (up to 3 columns)', () => {
    const blocks: ContentBlock[] = [
      createAgentBlock('agent-1', 'Agent 1', 'file-picker'),
      createAgentBlock('agent-2', 'Agent 2', 'code-searcher'),
      createAgentBlock('agent-3', 'Agent 3', 'commander'),
    ]

    // Width above LG_THRESHOLD (140) should allow 3 columns
    const markup = renderToStaticMarkup(
      <MessageBlock {...baseMessageBlockProps} blocks={blocks} availableWidth={160} />,
    )

    expect(markup).toContain('Agent 1')
    expect(markup).toContain('Agent 2')
    expect(markup).toContain('Agent 3')
  })
})
