import { describe, test, expect } from 'bun:test'

import { setAllBlocksCollapsedState, hasAnyExpandedBlocks } from '../collapse-helpers'

import type {
  ChatMessage,
  ContentBlock,
  ToolContentBlock,
  AgentContentBlock,
  TextContentBlock,
  AgentListContentBlock,
} from '../../types/chat'

// Type helper for accessing isCollapsed/userOpened on any block type
type CollapsibleBlock = ToolContentBlock | AgentContentBlock | TextContentBlock | AgentListContentBlock

// Helper to create minimal test messages
const createMessage = (
  id: string,
  variant: 'ai' | 'user' | 'agent' | 'error' = 'ai',
  blocks?: ContentBlock[],
  metadata?: { isCollapsed?: boolean; userOpened?: boolean },
): ChatMessage => ({
  id,
  variant,
  content: '',
  timestamp: new Date().toISOString(),
  blocks,
  metadata,
})

// Helper to create tool blocks
const createToolBlock = (
  toolCallId: string,
  isCollapsed?: boolean,
  userOpened?: boolean,
): ContentBlock => ({
  type: 'tool',
  toolCallId,
  toolName: 'read_files',
  input: {},
  isCollapsed,
  userOpened,
})

// Helper to create agent blocks
const createAgentBlock = (
  agentId: string,
  isCollapsed?: boolean,
  userOpened?: boolean,
  nestedBlocks?: ContentBlock[],
): ContentBlock => ({
  type: 'agent',
  agentId,
  agentName: 'Test Agent',
  agentType: 'test-agent',
  content: '',
  status: 'complete',
  isCollapsed,
  userOpened,
  blocks: nestedBlocks,
})

// Helper to create thinking/text blocks with thinkingId
const createThinkingBlock = (
  thinkingId: string,
  isCollapsed?: boolean,
  userOpened?: boolean,
): ContentBlock => ({
  type: 'text',
  content: 'thinking content',
  thinkingId,
  isCollapsed,
  userOpened,
})

// Helper to create agent-list blocks
const createAgentListBlock = (
  id: string,
  isCollapsed?: boolean,
  userOpened?: boolean,
): ContentBlock => ({
  type: 'agent-list',
  id,
  agents: [],
  agentsDir: '/test',
  isCollapsed,
  userOpened,
})

// Helper to create plain text blocks (not collapsible)
const createTextBlock = (content: string): ContentBlock => ({
  type: 'text',
  content,
})

describe('hasAnyExpandedBlocks', () => {
  describe('empty and basic cases', () => {
    test('returns false for empty messages', () => {
      expect(hasAnyExpandedBlocks([])).toBe(false)
    })

    test('returns false for messages with no collapsible content', () => {
      const messages = [
        createMessage('1', 'user'),
        createMessage('2', 'ai', [createTextBlock('hello')]),
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(false)
    })

    test('returns false for messages with no blocks', () => {
      const messages = [createMessage('1', 'ai')]
      expect(hasAnyExpandedBlocks(messages)).toBe(false)
    })
  })

  describe('agent variant messages', () => {
    test('returns true for expanded agent variant message', () => {
      const messages = [createMessage('1', 'agent', undefined, { isCollapsed: false })]
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
    })

    test('returns false for collapsed agent variant message', () => {
      const messages = [createMessage('1', 'agent', undefined, { isCollapsed: true })]
      expect(hasAnyExpandedBlocks(messages)).toBe(false)
    })

    test('returns false for agent variant message with undefined isCollapsed (treated as collapsed)', () => {
      const messages = [createMessage('1', 'agent')]
      expect(hasAnyExpandedBlocks(messages)).toBe(false)
    })
  })

  describe('tool blocks', () => {
    test('returns true when any tool block is expanded', () => {
      const messages = [
        createMessage('1', 'ai', [
          createToolBlock('tool-1', true),
          createToolBlock('tool-2', false),
        ]),
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
    })

    test('returns false when all tool blocks are collapsed', () => {
      const messages = [
        createMessage('1', 'ai', [
          createToolBlock('tool-1', true),
          createToolBlock('tool-2', true),
        ]),
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(false)
    })

    test('returns false when tool block has undefined isCollapsed (treated as collapsed)', () => {
      const messages = [
        createMessage('1', 'ai', [createToolBlock('tool-1')]),
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(false)
    })
  })

  describe('agent blocks', () => {
    test('returns true when agent block is expanded', () => {
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', false)]),
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
    })

    test('returns false when agent block is collapsed', () => {
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', true)]),
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(false)
    })

    test('returns true when nested block within collapsed agent is expanded', () => {
      const nestedBlocks = [createToolBlock('nested-tool', false)] // expanded
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', true, false, nestedBlocks)]), // collapsed parent
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
    })

    test('returns false when agent and all nested blocks are collapsed', () => {
      const nestedBlocks = [createToolBlock('nested-tool', true)] // collapsed
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', true, false, nestedBlocks)]), // collapsed parent
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(false)
    })
  })

  describe('thinking blocks', () => {
    test('returns true when thinking block is expanded', () => {
      const messages = [
        createMessage('1', 'ai', [createThinkingBlock('think-1', false)]),
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
    })

    test('returns false when thinking block is collapsed', () => {
      const messages = [
        createMessage('1', 'ai', [createThinkingBlock('think-1', true)]),
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(false)
    })
  })

  describe('agent-list blocks', () => {
    test('returns true when agent-list block is expanded', () => {
      const messages = [
        createMessage('1', 'ai', [createAgentListBlock('list-1', false)]),
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
    })

    test('returns false when agent-list block is collapsed', () => {
      const messages = [
        createMessage('1', 'ai', [createAgentListBlock('list-1', true)]),
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(false)
    })
  })

  describe('multiple messages', () => {
    test('returns true when any message has expanded content', () => {
      const messages = [
        createMessage('1', 'ai', [createToolBlock('tool-1', true)]),
        createMessage('2', 'ai', [createAgentBlock('agent-1', false)]),
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
    })

    test('returns false when all messages have collapsed content', () => {
      const messages = [
        createMessage('1', 'ai', [createToolBlock('tool-1', true)]),
        createMessage('2', 'ai', [createAgentBlock('agent-1', true)]),
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(false)
    })
  })

  describe('deeply nested blocks', () => {
    test('returns true when deeply nested block is expanded', () => {
      const deepNestedBlocks = [createToolBlock('deep-tool', false)] // expanded
      const nestedAgentBlocks = [createAgentBlock('nested-agent', true, false, deepNestedBlocks)] // collapsed
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', true, false, nestedAgentBlocks)]), // collapsed
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
    })

    test('returns false when all deeply nested blocks are collapsed', () => {
      const deepNestedBlocks = [createToolBlock('deep-tool', true)] // collapsed
      const nestedAgentBlocks = [createAgentBlock('nested-agent', true, false, deepNestedBlocks)] // collapsed
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', true, false, nestedAgentBlocks)]), // collapsed
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(false)
    })
  })
})

describe('setAllBlocksCollapsedState', () => {
  describe('empty and basic cases', () => {
    test('returns empty array for empty messages', () => {
      const result = setAllBlocksCollapsedState([], true)
      expect(result).toEqual([])
    })

    test('returns messages unchanged when no collapsible content', () => {
      const messages = [
        createMessage('1', 'user'),
        createMessage('2', 'ai', [createTextBlock('hello')]),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      expect(result).toEqual(messages)
    })

    test('returns messages unchanged when no blocks', () => {
      const messages = [createMessage('1', 'ai')]
      const result = setAllBlocksCollapsedState(messages, true)
      expect(result).toEqual(messages)
    })
  })

  describe('agent variant messages', () => {
    test('collapses agent variant message', () => {
      const messages = [createMessage('1', 'agent', undefined, { isCollapsed: false })]
      const result = setAllBlocksCollapsedState(messages, true)
      
      expect(result[0]?.metadata?.isCollapsed).toBe(true)
    })

    test('expands agent variant message', () => {
      const messages = [createMessage('1', 'agent', undefined, { isCollapsed: true })]
      const result = setAllBlocksCollapsedState(messages, false)
      
      expect(result[0]?.metadata?.isCollapsed).toBe(false)
      expect(result[0]?.metadata?.userOpened).toBe(true)
    })

    test('does not modify already collapsed agent variant message', () => {
      const messages = [createMessage('1', 'agent', undefined, { isCollapsed: true })]
      const result = setAllBlocksCollapsedState(messages, true)
      
      // Should return same reference when no change needed
      expect(result[0]).toBe(messages[0])
    })

    test('does not modify already expanded agent variant message', () => {
      const messages = [createMessage('1', 'agent', undefined, { isCollapsed: false })]
      const result = setAllBlocksCollapsedState(messages, false)
      
      expect(result[0]).toBe(messages[0])
    })

    test('handles agent variant message with undefined isCollapsed when collapsing', () => {
      const messages = [createMessage('1', 'agent')]
      const result = setAllBlocksCollapsedState(messages, true)
      
      // undefined is treated as collapsed, so no change should be made
      expect(result[0]).toBe(messages[0])
    })

    test('expands agent variant message with undefined isCollapsed', () => {
      const messages = [createMessage('1', 'agent')]
      const result = setAllBlocksCollapsedState(messages, false)
      
      // undefined is treated as collapsed, so expand should work
      expect(result[0]?.metadata?.isCollapsed).toBe(false)
      expect(result[0]?.metadata?.userOpened).toBe(true)
    })
  })

  describe('tool blocks', () => {
    test('collapses all tool blocks', () => {
      const messages = [
        createMessage('1', 'ai', [
          createToolBlock('tool-1', false),
          createToolBlock('tool-2', false),
        ]),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      const blocks = result[0]?.blocks as CollapsibleBlock[]
      expect(blocks[0]?.isCollapsed).toBe(true)
      expect(blocks[1]?.isCollapsed).toBe(true)
    })

    test('expands all tool blocks', () => {
      const messages = [
        createMessage('1', 'ai', [
          createToolBlock('tool-1', true),
          createToolBlock('tool-2', true),
        ]),
      ]
      const result = setAllBlocksCollapsedState(messages, false)
      
      const blocks = result[0]?.blocks as CollapsibleBlock[]
      expect(blocks[0]?.isCollapsed).toBe(false)
      expect(blocks[0]?.userOpened).toBe(true)
      expect(blocks[1]?.isCollapsed).toBe(false)
      expect(blocks[1]?.userOpened).toBe(true)
    })

    test('handles mixed collapsed states', () => {
      const messages = [
        createMessage('1', 'ai', [
          createToolBlock('tool-1', true),
          createToolBlock('tool-2', false),
        ]),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      const blocks = result[0]?.blocks as CollapsibleBlock[]
      expect(blocks[0]?.isCollapsed).toBe(true)
      expect(blocks[1]?.isCollapsed).toBe(true)
    })

    test('expands tool blocks with undefined isCollapsed', () => {
      const messages = [
        createMessage('1', 'ai', [createToolBlock('tool-1')]),
      ]
      const result = setAllBlocksCollapsedState(messages, false)
      
      // undefined is treated as collapsed, so expand should work
      const block = result[0]?.blocks?.[0] as CollapsibleBlock
      expect(block?.isCollapsed).toBe(false)
      expect(block?.userOpened).toBe(true)
    })

    test('does not modify tool block with undefined isCollapsed when collapsing', () => {
      const messages = [
        createMessage('1', 'ai', [createToolBlock('tool-1')]),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      // undefined is treated as collapsed, so no change should be made
      expect(result[0]).toBe(messages[0])
    })
  })

  describe('agent blocks', () => {
    test('collapses agent blocks', () => {
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', false)]),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      const block = result[0]?.blocks?.[0] as CollapsibleBlock
      expect(block?.isCollapsed).toBe(true)
    })

    test('expands agent blocks and sets userOpened', () => {
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', true)]),
      ]
      const result = setAllBlocksCollapsedState(messages, false)
      
      const block = result[0]?.blocks?.[0] as CollapsibleBlock
      expect(block?.isCollapsed).toBe(false)
      expect(block?.userOpened).toBe(true)
    })

    test('handles nested blocks within agent blocks', () => {
      const nestedBlocks = [
        createToolBlock('nested-tool-1', false),
        createToolBlock('nested-tool-2', false),
      ]
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', false, false, nestedBlocks)]),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      const agentBlock = result[0]?.blocks?.[0] as AgentContentBlock
      const nestedBlocksResult = agentBlock?.blocks as CollapsibleBlock[]
      expect(nestedBlocksResult?.[0]?.isCollapsed).toBe(true)
      expect(nestedBlocksResult?.[1]?.isCollapsed).toBe(true)
    })

    test('handles deeply nested agent blocks', () => {
      const deepNestedBlocks = [createToolBlock('deep-tool', false)]
      const nestedAgentBlocks = [createAgentBlock('nested-agent', false, false, deepNestedBlocks)]
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', false, false, nestedAgentBlocks)]),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      const outerAgent = result[0]?.blocks?.[0] as AgentContentBlock
      expect(outerAgent?.isCollapsed).toBe(true)
      
      const innerAgent = outerAgent?.blocks?.[0] as AgentContentBlock
      expect(innerAgent?.isCollapsed).toBe(true)
      
      const deepBlock = innerAgent?.blocks?.[0] as CollapsibleBlock
      expect(deepBlock?.isCollapsed).toBe(true)
    })
  })

  describe('thinking blocks', () => {
    test('collapses thinking blocks', () => {
      const messages = [
        createMessage('1', 'ai', [createThinkingBlock('think-1', false)]),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      const block = result[0]?.blocks?.[0] as CollapsibleBlock
      expect(block?.isCollapsed).toBe(true)
    })

    test('expands thinking blocks and sets userOpened', () => {
      const messages = [
        createMessage('1', 'ai', [createThinkingBlock('think-1', true)]),
      ]
      const result = setAllBlocksCollapsedState(messages, false)
      
      const block = result[0]?.blocks?.[0] as CollapsibleBlock
      expect(block?.isCollapsed).toBe(false)
      expect(block?.userOpened).toBe(true)
    })

    test('does not collapse text blocks without thinkingId', () => {
      const messages = [
        createMessage('1', 'ai', [createTextBlock('regular text')]),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      // Should return same reference since no change
      expect(result[0]).toBe(messages[0])
    })
  })

  describe('agent-list blocks', () => {
    test('collapses agent-list blocks', () => {
      const messages = [
        createMessage('1', 'ai', [createAgentListBlock('list-1', false)]),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      const block = result[0]?.blocks?.[0] as CollapsibleBlock
      expect(block?.isCollapsed).toBe(true)
    })

    test('expands agent-list blocks and sets userOpened', () => {
      const messages = [
        createMessage('1', 'ai', [createAgentListBlock('list-1', true)]),
      ]
      const result = setAllBlocksCollapsedState(messages, false)
      
      const block = result[0]?.blocks?.[0] as CollapsibleBlock
      expect(block?.isCollapsed).toBe(false)
      expect(block?.userOpened).toBe(true)
    })
  })

  describe('mixed block types', () => {
    test('collapses all block types together', () => {
      const messages = [
        createMessage('1', 'ai', [
          createToolBlock('tool-1', false),
          createAgentBlock('agent-1', false),
          createThinkingBlock('think-1', false),
          createAgentListBlock('list-1', false),
          createTextBlock('regular text'),
        ]),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      const blocks = result[0]?.blocks as CollapsibleBlock[]
      expect(blocks[0]?.isCollapsed).toBe(true) // tool
      expect(blocks[1]?.isCollapsed).toBe(true) // agent
      expect(blocks[2]?.isCollapsed).toBe(true) // thinking
      expect(blocks[3]?.isCollapsed).toBe(true) // agent-list
      expect((blocks[4] as TextContentBlock)?.isCollapsed).toBeUndefined() // text (not collapsible)
    })

    test('expands all block types together', () => {
      const messages = [
        createMessage('1', 'ai', [
          createToolBlock('tool-1', true),
          createAgentBlock('agent-1', true),
          createThinkingBlock('think-1', true),
          createAgentListBlock('list-1', true),
        ]),
      ]
      const result = setAllBlocksCollapsedState(messages, false)
      
      const blocks = result[0]?.blocks as CollapsibleBlock[]
      expect(blocks[0]?.isCollapsed).toBe(false)
      expect(blocks[0]?.userOpened).toBe(true)
      expect(blocks[1]?.isCollapsed).toBe(false)
      expect(blocks[1]?.userOpened).toBe(true)
      expect(blocks[2]?.isCollapsed).toBe(false)
      expect(blocks[2]?.userOpened).toBe(true)
      expect(blocks[3]?.isCollapsed).toBe(false)
      expect(blocks[3]?.userOpened).toBe(true)
    })
  })

  describe('multiple messages', () => {
    test('collapses blocks across multiple messages', () => {
      const messages = [
        createMessage('1', 'ai', [createToolBlock('tool-1', false)]),
        createMessage('2', 'ai', [createAgentBlock('agent-1', false)]),
        createMessage('3', 'agent', undefined, { isCollapsed: false }),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      expect((result[0]?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(true)
      expect((result[1]?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(true)
      expect(result[2]?.metadata?.isCollapsed).toBe(true)
    })

    test('expands blocks across multiple messages', () => {
      const messages = [
        createMessage('1', 'ai', [createToolBlock('tool-1', true)]),
        createMessage('2', 'ai', [createAgentBlock('agent-1', true)]),
        createMessage('3', 'agent', undefined, { isCollapsed: true }),
      ]
      const result = setAllBlocksCollapsedState(messages, false)
      
      expect((result[0]?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(false)
      expect((result[1]?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(false)
      expect(result[2]?.metadata?.isCollapsed).toBe(false)
    })

    test('only modifies messages with collapsible content', () => {
      const messages = [
        createMessage('1', 'user'),
        createMessage('2', 'ai', [createToolBlock('tool-1', false)]),
        createMessage('3', 'ai', [createTextBlock('regular text')]),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      // User message unchanged
      expect(result[0]).toBe(messages[0])
      // Tool block message changed
      expect(result[1]).not.toBe(messages[1])
      expect((result[1]?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(true)
      // Text-only message unchanged
      expect(result[2]).toBe(messages[2])
    })
  })

  describe('userOpened behavior', () => {
    test('sets userOpened to true when expanding', () => {
      const messages = [
        createMessage('1', 'ai', [createToolBlock('tool-1', true, false)]),
      ]
      const result = setAllBlocksCollapsedState(messages, false)
      
      const block = result[0]?.blocks?.[0] as CollapsibleBlock
      expect(block?.userOpened).toBe(true)
    })

    test('preserves existing userOpened when collapsing', () => {
      const messages = [
        createMessage('1', 'ai', [createToolBlock('tool-1', false, true)]),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      const block = result[0]?.blocks?.[0] as CollapsibleBlock
      expect(block?.userOpened).toBe(true)
    })

    test('handles undefined userOpened when collapsing', () => {
      const messages = [
        createMessage('1', 'ai', [createToolBlock('tool-1', false)]),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      const block = result[0]?.blocks?.[0] as CollapsibleBlock
      expect(block?.userOpened).toBeUndefined()
    })
  })

  describe('reference preservation (optimization)', () => {
    test('preserves message reference when no changes needed', () => {
      const messages = [
        createMessage('1', 'ai', [createToolBlock('tool-1', true)]),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      expect(result[0]).toBe(messages[0])
    })

    test('preserves blocks array reference when no nested changes', () => {
      const messages = [
        createMessage('1', 'ai', [createTextBlock('no change needed')]),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      expect(result[0]?.blocks).toBe(messages[0]?.blocks)
    })
  })

  describe('edge cases', () => {
    test('handles undefined blocks in agent block', () => {
      const agentBlock = createAgentBlock('agent-1', false)
      delete (agentBlock as { blocks?: ContentBlock[] }).blocks
      
      const messages = [createMessage('1', 'ai', [agentBlock])]
      const result = setAllBlocksCollapsedState(messages, true)
      
      expect((result[0]?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(true)
    })

    test('handles empty blocks array', () => {
      const messages = [createMessage('1', 'ai', [])]
      const result = setAllBlocksCollapsedState(messages, true)
      
      expect(result[0]).toBe(messages[0])
    })

    test('handles message with undefined metadata for agent variant when collapsing', () => {
      const message = createMessage('1', 'agent')
      delete message.metadata
      
      const result = setAllBlocksCollapsedState([message], true)
      
      // undefined metadata is treated as collapsed, so no change should be made
      expect(result[0]).toBe(message)
    })

    test('handles message with undefined metadata for agent variant when expanding', () => {
      const message = createMessage('1', 'agent')
      delete message.metadata
      
      const result = setAllBlocksCollapsedState([message], false)
      
      // undefined metadata is treated as collapsed, so expand should work
      expect(result[0]?.metadata?.isCollapsed).toBe(false)
      expect(result[0]?.metadata?.userOpened).toBe(true)
    })
  })
})

describe('toggle-all edge cases', () => {
  describe('nested agent blocks with mixed collapsed states', () => {
    test('hasAnyExpandedBlocks: collapsed parent with expanded child returns true', () => {
      const nestedBlocks = [createToolBlock('tool-1', false)] // expanded
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', true, false, nestedBlocks)]), // collapsed parent
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
    })

    test('hasAnyExpandedBlocks: expanded parent with collapsed child returns true', () => {
      const nestedBlocks = [createToolBlock('tool-1', true)] // collapsed
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', false, false, nestedBlocks)]), // expanded parent
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
    })

    test('hasAnyExpandedBlocks: expanded parent with expanded child returns true', () => {
      const nestedBlocks = [createToolBlock('tool-1', false)] // expanded
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', false, false, nestedBlocks)]), // expanded parent
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
    })

    test('hasAnyExpandedBlocks: collapsed parent with collapsed child returns false', () => {
      const nestedBlocks = [createToolBlock('tool-1', true)] // collapsed
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', true, false, nestedBlocks)]), // collapsed parent
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(false)
    })

    test('hasAnyExpandedBlocks: collapsed parent with mixed nested states returns true', () => {
      const nestedBlocks = [
        createToolBlock('tool-1', true), // collapsed
        createToolBlock('tool-2', false), // expanded
        createToolBlock('tool-3', true), // collapsed
      ]
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', true, false, nestedBlocks)]),
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
    })

    test('setAllBlocksCollapsedState: collapses both parent and nested blocks', () => {
      const nestedBlocks = [
        createToolBlock('tool-1', false), // expanded
        createThinkingBlock('think-1', false), // expanded
      ]
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', false, false, nestedBlocks)]), // expanded parent
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      const agentBlock = result[0]?.blocks?.[0] as AgentContentBlock
      expect(agentBlock?.isCollapsed).toBe(true)
      expect((agentBlock?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(true)
      expect((agentBlock?.blocks?.[1] as CollapsibleBlock)?.isCollapsed).toBe(true)
    })

    test('setAllBlocksCollapsedState: expands both parent and nested blocks', () => {
      const nestedBlocks = [
        createToolBlock('tool-1', true), // collapsed
        createThinkingBlock('think-1', true), // collapsed
      ]
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', true, false, nestedBlocks)]), // collapsed parent
      ]
      const result = setAllBlocksCollapsedState(messages, false)
      
      const agentBlock = result[0]?.blocks?.[0] as AgentContentBlock
      expect(agentBlock?.isCollapsed).toBe(false)
      expect(agentBlock?.userOpened).toBe(true)
      expect((agentBlock?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(false)
      expect((agentBlock?.blocks?.[0] as CollapsibleBlock)?.userOpened).toBe(true)
      expect((agentBlock?.blocks?.[1] as CollapsibleBlock)?.isCollapsed).toBe(false)
      expect((agentBlock?.blocks?.[1] as CollapsibleBlock)?.userOpened).toBe(true)
    })
  })

  describe('deeply nested structures (3+ levels)', () => {
    test('hasAnyExpandedBlocks: finds expanded block at level 3', () => {
      const level3Blocks = [createToolBlock('deep-tool', false)] // expanded at level 3
      const level2Blocks = [createAgentBlock('level2-agent', true, false, level3Blocks)] // collapsed at level 2
      const level1Blocks = [createAgentBlock('level1-agent', true, false, level2Blocks)] // collapsed at level 1
      const messages = [createMessage('1', 'ai', level1Blocks)]
      
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
    })

    test('hasAnyExpandedBlocks: all collapsed at 3 levels returns false', () => {
      const level3Blocks = [createToolBlock('deep-tool', true)] // collapsed at level 3
      const level2Blocks = [createAgentBlock('level2-agent', true, false, level3Blocks)] // collapsed at level 2
      const level1Blocks = [createAgentBlock('level1-agent', true, false, level2Blocks)] // collapsed at level 1
      const messages = [createMessage('1', 'ai', level1Blocks)]
      
      expect(hasAnyExpandedBlocks(messages)).toBe(false)
    })

    test('setAllBlocksCollapsedState: collapses all 3 levels', () => {
      const level3Blocks = [createToolBlock('deep-tool', false)] // expanded
      const level2Blocks = [createAgentBlock('level2-agent', false, false, level3Blocks)] // expanded
      const level1Blocks = [createAgentBlock('level1-agent', false, false, level2Blocks)] // expanded
      const messages = [createMessage('1', 'ai', level1Blocks)]
      
      const result = setAllBlocksCollapsedState(messages, true)
      
      const level1 = result[0]?.blocks?.[0] as AgentContentBlock
      expect(level1?.isCollapsed).toBe(true)
      
      const level2 = level1?.blocks?.[0] as AgentContentBlock
      expect(level2?.isCollapsed).toBe(true)
      
      const level3 = level2?.blocks?.[0] as CollapsibleBlock
      expect(level3?.isCollapsed).toBe(true)
    })

    test('setAllBlocksCollapsedState: expands all 3 levels with undefined states', () => {
      // All undefined (treated as collapsed)
      const level3Blocks = [createToolBlock('deep-tool')]
      const level2Blocks = [createAgentBlock('level2-agent', undefined, undefined, level3Blocks)]
      const level1Blocks = [createAgentBlock('level1-agent', undefined, undefined, level2Blocks)]
      const messages = [createMessage('1', 'ai', level1Blocks)]
      
      const result = setAllBlocksCollapsedState(messages, false)
      
      const level1 = result[0]?.blocks?.[0] as AgentContentBlock
      expect(level1?.isCollapsed).toBe(false)
      expect(level1?.userOpened).toBe(true)
      
      const level2 = level1?.blocks?.[0] as AgentContentBlock
      expect(level2?.isCollapsed).toBe(false)
      expect(level2?.userOpened).toBe(true)
      
      const level3 = level2?.blocks?.[0] as CollapsibleBlock
      expect(level3?.isCollapsed).toBe(false)
      expect(level3?.userOpened).toBe(true)
    })
  })

  describe('mixed collapsible and non-collapsible blocks', () => {
    test('hasAnyExpandedBlocks: ignores non-collapsible text blocks when checking', () => {
      const nestedBlocks = [
        createTextBlock('regular text'), // not collapsible
        createToolBlock('tool-1', true), // collapsed
      ]
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', true, false, nestedBlocks)]),
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(false)
    })

    test('hasAnyExpandedBlocks: finds expanded block among non-collapsible blocks', () => {
      const nestedBlocks = [
        createTextBlock('regular text 1'), // not collapsible
        createToolBlock('tool-1', false), // expanded
        createTextBlock('regular text 2'), // not collapsible
      ]
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', true, false, nestedBlocks)]),
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
    })

    test('setAllBlocksCollapsedState: preserves non-collapsible blocks in nested structure', () => {
      const nestedBlocks = [
        createTextBlock('regular text'),
        createToolBlock('tool-1', false),
      ]
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', false, false, nestedBlocks)]),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      const agentBlock = result[0]?.blocks?.[0] as AgentContentBlock
      expect(agentBlock?.blocks?.[0]?.type).toBe('text')
      expect((agentBlock?.blocks?.[0] as TextContentBlock)?.content).toBe('regular text')
      expect((agentBlock?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBeUndefined()
      expect((agentBlock?.blocks?.[1] as CollapsibleBlock)?.isCollapsed).toBe(true)
    })
  })

  describe('agent variant messages with blocks', () => {
    test('hasAnyExpandedBlocks: checks both message-level and block-level collapsed state', () => {
      const messages = [
        createMessage('1', 'agent', [createToolBlock('tool-1', false)], { isCollapsed: true }),
      ]
      // Even though message-level is collapsed, block-level is expanded
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
    })

    test('hasAnyExpandedBlocks: message-level expanded is detected', () => {
      const messages = [
        createMessage('1', 'agent', [createToolBlock('tool-1', true)], { isCollapsed: false }),
      ]
      // Message-level is expanded even though block-level is collapsed
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
    })

    test('hasAnyExpandedBlocks: both collapsed returns false', () => {
      const messages = [
        createMessage('1', 'agent', [createToolBlock('tool-1', true)], { isCollapsed: true }),
      ]
      expect(hasAnyExpandedBlocks(messages)).toBe(false)
    })

    test('setAllBlocksCollapsedState: collapses both message-level and block-level', () => {
      const messages = [
        createMessage('1', 'agent', [createToolBlock('tool-1', false)], { isCollapsed: false }),
      ]
      const result = setAllBlocksCollapsedState(messages, true)
      
      expect(result[0]?.metadata?.isCollapsed).toBe(true)
      expect((result[0]?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(true)
    })

    test('setAllBlocksCollapsedState: expands both message-level and block-level', () => {
      const messages = [
        createMessage('1', 'agent', [createToolBlock('tool-1', true)], { isCollapsed: true }),
      ]
      const result = setAllBlocksCollapsedState(messages, false)
      
      expect(result[0]?.metadata?.isCollapsed).toBe(false)
      expect(result[0]?.metadata?.userOpened).toBe(true)
      expect((result[0]?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(false)
      expect((result[0]?.blocks?.[0] as CollapsibleBlock)?.userOpened).toBe(true)
    })
  })

  describe('toggle-all workflow (hasAnyExpandedBlocks + setAllBlocksCollapsedState)', () => {
    test('toggle: when any expanded, collapse all', () => {
      const messages = [
        createMessage('1', 'ai', [
          createToolBlock('tool-1', true), // collapsed
          createToolBlock('tool-2', false), // expanded
        ]),
      ]
      
      // First: check if any are expanded
      const hasExpanded = hasAnyExpandedBlocks(messages)
      expect(hasExpanded).toBe(true)
      
      // Then: collapse all (since some are expanded)
      const result = setAllBlocksCollapsedState(messages, true)
      
      // Verify all are now collapsed
      expect(hasAnyExpandedBlocks(result)).toBe(false)
      expect((result[0]?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(true)
      expect((result[0]?.blocks?.[1] as CollapsibleBlock)?.isCollapsed).toBe(true)
    })

    test('toggle: when all collapsed, expand all', () => {
      const messages = [
        createMessage('1', 'ai', [
          createToolBlock('tool-1', true), // collapsed
          createToolBlock('tool-2', true), // collapsed
        ]),
      ]
      
      // First: check if any are expanded
      const hasExpanded = hasAnyExpandedBlocks(messages)
      expect(hasExpanded).toBe(false)
      
      // Then: expand all (since none are expanded)
      const result = setAllBlocksCollapsedState(messages, false)
      
      // Verify all are now expanded
      expect(hasAnyExpandedBlocks(result)).toBe(true)
      expect((result[0]?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(false)
      expect((result[0]?.blocks?.[1] as CollapsibleBlock)?.isCollapsed).toBe(false)
    })

    test('toggle: fresh session with undefined states expands all', () => {
      // Simulates first Ctrl+T on fresh session
      const messages = [
        createMessage('1', 'ai', [
          createToolBlock('tool-1'), // undefined = collapsed
          createAgentBlock('agent-1'), // undefined = collapsed
        ]),
      ]
      
      // Check if any expanded (should be false since undefined = collapsed)
      const hasExpanded = hasAnyExpandedBlocks(messages)
      expect(hasExpanded).toBe(false)
      
      // Expand all since none are expanded
      const result = setAllBlocksCollapsedState(messages, false)
      
      // Verify all are now expanded
      expect(hasAnyExpandedBlocks(result)).toBe(true)
    })

    test('toggle: double-toggle returns to expanded state', () => {
      const messages = [
        createMessage('1', 'ai', [createToolBlock('tool-1', false)]), // expanded
      ]
      
      // First toggle: collapse (since one is expanded)
      const afterFirstToggle = setAllBlocksCollapsedState(messages, true)
      expect(hasAnyExpandedBlocks(afterFirstToggle)).toBe(false)
      
      // Second toggle: expand (since all are collapsed)
      const afterSecondToggle = setAllBlocksCollapsedState(afterFirstToggle, false)
      expect(hasAnyExpandedBlocks(afterSecondToggle)).toBe(true)
    })

    test('toggle: complex nested structure toggle workflow', () => {
      const level2Blocks = [
        createToolBlock('nested-tool-1', false), // expanded
        createToolBlock('nested-tool-2', true), // collapsed
      ]
      const messages = [
        createMessage('1', 'ai', [
          createAgentBlock('agent-1', true, false, level2Blocks), // collapsed parent, mixed children
          createToolBlock('tool-1', true), // collapsed
        ]),
        createMessage('2', 'agent', undefined, { isCollapsed: true }), // collapsed agent variant
      ]
      
      // Any expanded? Yes (nested-tool-1 is expanded)
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
      
      // First toggle: collapse all
      const afterCollapse = setAllBlocksCollapsedState(messages, true)
      expect(hasAnyExpandedBlocks(afterCollapse)).toBe(false)
      
      // Verify all are collapsed including nested
      const agentBlock = afterCollapse[0]?.blocks?.[0] as AgentContentBlock
      expect((agentBlock?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(true)
      expect((agentBlock?.blocks?.[1] as CollapsibleBlock)?.isCollapsed).toBe(true)
      
      // Second toggle: expand all
      const afterExpand = setAllBlocksCollapsedState(afterCollapse, false)
      expect(hasAnyExpandedBlocks(afterExpand)).toBe(true)
      
      // Verify all are expanded including nested
      const expandedAgentBlock = afterExpand[0]?.blocks?.[0] as AgentContentBlock
      expect(expandedAgentBlock?.isCollapsed).toBe(false)
      expect((expandedAgentBlock?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(false)
      expect((expandedAgentBlock?.blocks?.[1] as CollapsibleBlock)?.isCollapsed).toBe(false)
      expect((afterExpand[0]?.blocks?.[1] as CollapsibleBlock)?.isCollapsed).toBe(false)
      expect(afterExpand[1]?.metadata?.isCollapsed).toBe(false)
    })
  })

  describe('empty and edge case nested structures', () => {
    test('agent block with empty nested blocks array', () => {
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('agent-1', false, false, [])]),
      ]
      
      expect(hasAnyExpandedBlocks(messages)).toBe(true) // parent is expanded
      
      const result = setAllBlocksCollapsedState(messages, true)
      expect((result[0]?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(true)
    })

    test('multiple agent blocks at same level with mixed states', () => {
      const messages = [
        createMessage('1', 'ai', [
          createAgentBlock('agent-1', true, false, [createToolBlock('tool-1', true)]),
          createAgentBlock('agent-2', false, false, [createToolBlock('tool-2', true)]),
          createAgentBlock('agent-3', true, false, [createToolBlock('tool-3', false)]),
        ]),
      ]
      
      // agent-2 is expanded, tool-3 is expanded
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
      
      const result = setAllBlocksCollapsedState(messages, true)
      
      // All should be collapsed now
      expect((result[0]?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(true)
      expect((result[0]?.blocks?.[1] as CollapsibleBlock)?.isCollapsed).toBe(true)
      expect((result[0]?.blocks?.[2] as CollapsibleBlock)?.isCollapsed).toBe(true)
      
      const agent1 = result[0]?.blocks?.[0] as AgentContentBlock
      const agent2 = result[0]?.blocks?.[1] as AgentContentBlock
      const agent3 = result[0]?.blocks?.[2] as AgentContentBlock
      expect((agent1?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(true)
      expect((agent2?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(true)
      expect((agent3?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(true)
    })

    test('nested agent blocks with all types of collapsible blocks', () => {
      const deepBlocks = [
        createToolBlock('deep-tool', false),
        createThinkingBlock('deep-think', false),
        createAgentListBlock('deep-list', false),
      ]
      const messages = [
        createMessage('1', 'ai', [createAgentBlock('outer-agent', false, false, deepBlocks)]),
      ]
      
      expect(hasAnyExpandedBlocks(messages)).toBe(true)
      
      const result = setAllBlocksCollapsedState(messages, true)
      
      const outerAgent = result[0]?.blocks?.[0] as AgentContentBlock
      expect(outerAgent?.isCollapsed).toBe(true)
      expect((outerAgent?.blocks?.[0] as CollapsibleBlock)?.isCollapsed).toBe(true)
      expect((outerAgent?.blocks?.[1] as CollapsibleBlock)?.isCollapsed).toBe(true)
      expect((outerAgent?.blocks?.[2] as CollapsibleBlock)?.isCollapsed).toBe(true)
    })
  })
})
