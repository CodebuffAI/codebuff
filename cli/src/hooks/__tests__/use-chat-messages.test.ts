import { describe, test, expect } from 'bun:test'

import { updateBlockById, toggleBlockCollapse } from '../../utils/block-tree-utils'

import type { ChatMessage, ContentBlock } from '../../types/chat'

/**
 * Tests for useChatMessages hook logic.
 *
 * Since React Testing Library's renderHook() is unreliable with Bun + React 19
 * (per cli/knowledge.md), we test the hook's logic by:
 *
 * 1. Testing the transformation functions the hook uses (agent message collapse)
 * 2. Testing integration with block-tree-utils (updateBlockById, toggleBlockCollapse)
 * 3. Testing pagination computation logic
 *
 * Note: The block tree utilities are also tested in
 * cli/src/utils/__tests__/block-tree-utils.test.ts
 */

// ============================================================================
// Test Helpers
// ============================================================================

/** Creates a minimal agent message for testing */
const createAgentMessage = (
  id: string,
  options: {
    isCollapsed?: boolean
    userOpened?: boolean
    parentId?: string
    blocks?: ContentBlock[]
  } = {},
): ChatMessage => ({
  id,
  variant: 'agent',
  content: '',
  timestamp: new Date().toISOString(),
  parentId: options.parentId,
  blocks: options.blocks,
  metadata: {
    isCollapsed: options.isCollapsed,
    userOpened: options.userOpened,
  },
})

/** Creates a minimal user message for testing */
const createUserMessage = (
  id: string,
  options: { parentId?: string } = {},
): ChatMessage => ({
  id,
  variant: 'user',
  timestamp: new Date().toISOString(),
  content: 'test message',
  parentId: options.parentId,
})

/** Creates an agent block for testing nested collapse */
const createAgentBlock = (
  agentId: string,
  options: { isCollapsed?: boolean; blocks?: ContentBlock[] } = {},
): ContentBlock => ({
  type: 'agent',
  agentId,
  agentType: 'test',
  agentName: 'Test Agent',
  content: '',
  status: 'complete',
  blocks: options.blocks ?? [],
  isCollapsed: options.isCollapsed,
})

// ============================================================================
// Hook Logic Simulation
// ============================================================================

/**
 * Applies the collapse toggle transformation from useChatMessages.handleCollapseToggle.
 * This mirrors the actual implementation to test the transformation logic.
 *
 * Uses the actual updateBlockById and toggleBlockCollapse utilities from
 * block-tree-utils.ts to ensure integration behavior is tested.
 */
function applyCollapseToggle(
  messages: ChatMessage[],
  id: string,
): ChatMessage[] {
  return messages.map((message) => {
    // Handle agent variant messages (top-level collapse)
    if (message.variant === 'agent' && message.id === id) {
      const wasCollapsed = message.metadata?.isCollapsed ?? false
      return {
        ...message,
        metadata: {
          ...message.metadata,
          isCollapsed: !wasCollapsed,
          userOpened: wasCollapsed,
        },
      }
    }

    // Handle blocks within messages (nested collapse)
    if (!message.blocks) return message

    const updatedBlocks = updateBlockById(
      message.blocks,
      id,
      toggleBlockCollapse,
    )

    if (updatedBlocks === message.blocks) return message

    return {
      ...message,
      blocks: updatedBlocks,
    }
  })
}

/**
 * Simulates the pagination logic from useChatMessages.
 */
const MESSAGE_BATCH_SIZE = 15

function computeVisibleMessages<T>(
  topLevelMessages: T[],
  visibleCount: number,
): T[] {
  if (topLevelMessages.length <= visibleCount) {
    return topLevelMessages
  }
  return topLevelMessages.slice(-visibleCount)
}

function computeHiddenCount(totalCount: number, visibleCount: number): number {
  return Math.max(0, totalCount - visibleCount)
}

// ============================================================================
// Tests: Agent Message Collapse (Pure Function)
// ============================================================================

describe('useChatMessages - agent message collapse', () => {
  describe('expanding collapsed agent messages', () => {
    test('sets isCollapsed to false when was true', () => {
      const messages = [createAgentMessage('agent-1', { isCollapsed: true })]
      const result = applyCollapseToggle(messages, 'agent-1')

      expect(result[0].metadata?.isCollapsed).toBe(false)
    })

    test('sets userOpened to true when expanding', () => {
      const messages = [createAgentMessage('agent-1', { isCollapsed: true })]
      const result = applyCollapseToggle(messages, 'agent-1')

      expect(result[0].metadata?.userOpened).toBe(true)
    })

    test('preserves other metadata when expanding', () => {
      const messages: ChatMessage[] = [{
        ...createAgentMessage('agent-1', { isCollapsed: true }),
        metadata: {
          isCollapsed: true,
          customField: 'preserved',
        } as ChatMessage['metadata'],
      }]
      const result = applyCollapseToggle(messages, 'agent-1')

      expect((result[0].metadata as Record<string, unknown>)?.customField).toBe('preserved')
    })
  })

  describe('collapsing expanded agent messages', () => {
    test('sets isCollapsed to true when was false', () => {
      const messages = [createAgentMessage('agent-1', { isCollapsed: false })]
      const result = applyCollapseToggle(messages, 'agent-1')

      expect(result[0].metadata?.isCollapsed).toBe(true)
    })

    test('sets userOpened to false when collapsing', () => {
      const messages = [createAgentMessage('agent-1', { isCollapsed: false })]
      const result = applyCollapseToggle(messages, 'agent-1')

      expect(result[0].metadata?.userOpened).toBe(false)
    })
  })

  describe('default state handling', () => {
    test('treats undefined isCollapsed as false (expanded)', () => {
      const messages = [createAgentMessage('agent-1')]
      const result = applyCollapseToggle(messages, 'agent-1')

      expect(result[0].metadata?.isCollapsed).toBe(true)
      expect(result[0].metadata?.userOpened).toBe(false)
    })

    test('handles message with no metadata', () => {
      const messages: ChatMessage[] = [{
        id: 'agent-1',
        variant: 'agent',
        content: '',
        timestamp: new Date().toISOString(),
      }]
      const result = applyCollapseToggle(messages, 'agent-1')

      expect(result[0].metadata?.isCollapsed).toBe(true)
    })
  })

  describe('non-agent messages', () => {
    test('returns user message unchanged when targeting it', () => {
      const messages = [createUserMessage('user-1')]
      const result = applyCollapseToggle(messages, 'user-1')

      // User messages don't have collapse logic, should be unchanged
      expect(result[0]).toEqual(messages[0])
    })

    test('only toggles the targeted message', () => {
      const messages = [
        createAgentMessage('agent-1', { isCollapsed: false }),
        createAgentMessage('agent-2', { isCollapsed: false }),
      ]
      const result = applyCollapseToggle(messages, 'agent-1')

      expect(result[0].metadata?.isCollapsed).toBe(true)
      expect(result[1].metadata?.isCollapsed).toBe(false) // Unchanged
    })
  })

  describe('immutability', () => {
    test('does not mutate original messages array', () => {
      const messages = [createAgentMessage('agent-1', { isCollapsed: true })]
      const originalCollapsed = messages[0].metadata?.isCollapsed

      applyCollapseToggle(messages, 'agent-1')

      expect(messages[0].metadata?.isCollapsed).toBe(originalCollapsed)
    })

    test('creates new message object for changed message', () => {
      const messages = [createAgentMessage('agent-1', { isCollapsed: true })]
      const result = applyCollapseToggle(messages, 'agent-1')

      expect(result[0]).not.toBe(messages[0])
    })

    test('preserves reference for unchanged messages', () => {
      const messages = [
        createAgentMessage('agent-1', { isCollapsed: false }),
        createAgentMessage('agent-2', { isCollapsed: false }),
      ]
      const result = applyCollapseToggle(messages, 'agent-1')

      expect(result[1]).toBe(messages[1]) // agent-2 unchanged
    })
  })

  describe('toggle cycle', () => {
    test('collapse then expand preserves correct state transitions', () => {
      let messages = [createAgentMessage('agent-1', { isCollapsed: false })]

      // Collapse it
      messages = applyCollapseToggle(messages, 'agent-1')
      expect(messages[0].metadata?.isCollapsed).toBe(true)
      expect(messages[0].metadata?.userOpened).toBe(false)

      // Expand it again
      messages = applyCollapseToggle(messages, 'agent-1')
      expect(messages[0].metadata?.isCollapsed).toBe(false)
      expect(messages[0].metadata?.userOpened).toBe(true)
    })

    test('rapid toggle preserves correct state', () => {
      let messages = [createAgentMessage('agent-1', { isCollapsed: false })]

      for (let i = 0; i < 10; i++) {
        messages = applyCollapseToggle(messages, 'agent-1')
      }

      // Even number of toggles = back to original state
      expect(messages[0].metadata?.isCollapsed).toBe(false)
    })
  })
})

// ============================================================================
// Tests: Nested Block Collapse
// ============================================================================

describe('useChatMessages - nested block collapse', () => {
  test('toggles collapse on nested agent block by agentId', () => {
    const nestedBlock = createAgentBlock('nested-agent', { isCollapsed: true })
    const messages = [
      createAgentMessage('parent', { blocks: [nestedBlock] }),
    ]

    const result = applyCollapseToggle(messages, 'nested-agent')

    const parentMessage = result[0]
    const updatedBlock = parentMessage.blocks?.[0] as ContentBlock & { isCollapsed?: boolean }
    expect(updatedBlock.isCollapsed).toBe(false)
  })

  test('sets userOpened when expanding nested block', () => {
    const nestedBlock = createAgentBlock('nested-agent', { isCollapsed: true })
    const messages = [
      createAgentMessage('parent', { blocks: [nestedBlock] }),
    ]

    const result = applyCollapseToggle(messages, 'nested-agent')

    const parentMessage = result[0]
    const updatedBlock = parentMessage.blocks?.[0] as ContentBlock & { userOpened?: boolean }
    expect(updatedBlock.userOpened).toBe(true)
  })

  test('does not modify message when block id not found', () => {
    const nestedBlock = createAgentBlock('nested-agent', { isCollapsed: true })
    const messages = [
      createAgentMessage('parent', { blocks: [nestedBlock] }),
    ]

    const result = applyCollapseToggle(messages, 'nonexistent')

    expect(result[0]).toBe(messages[0]) // Same reference
  })

  test('handles deeply nested blocks', () => {
    const deepBlock = createAgentBlock('deep-agent', { isCollapsed: true })
    const middleBlock = createAgentBlock('middle-agent', { blocks: [deepBlock] })
    const messages = [
      createAgentMessage('parent', { blocks: [middleBlock] }),
    ]

    const result = applyCollapseToggle(messages, 'deep-agent')

    const parentMessage = result[0]
    const middle = parentMessage.blocks?.[0] as ContentBlock & { blocks?: ContentBlock[] }
    const deep = middle.blocks?.[0] as ContentBlock & { isCollapsed?: boolean }
    expect(deep.isCollapsed).toBe(false)
  })
})

// ============================================================================
// Tests: Pagination Logic
// ============================================================================

describe('useChatMessages - pagination', () => {
  describe('MESSAGE_BATCH_SIZE constant', () => {
    test('batch size is 15', () => {
      expect(MESSAGE_BATCH_SIZE).toBe(15)
    })
  })

  describe('visibleTopLevelMessages computation', () => {
    test('returns all messages when count is less than batch size', () => {
      const messages = Array.from({ length: 10 }, (_, i) =>
        createUserMessage(`msg-${i}`),
      )
      const result = computeVisibleMessages(messages, MESSAGE_BATCH_SIZE)

      expect(result.length).toBe(10)
      expect(result).toBe(messages) // Same reference when no slicing
    })

    test('returns all messages when count equals batch size', () => {
      const messages = Array.from({ length: 15 }, (_, i) =>
        createUserMessage(`msg-${i}`),
      )
      const result = computeVisibleMessages(messages, MESSAGE_BATCH_SIZE)

      expect(result.length).toBe(15)
      expect(result).toBe(messages)
    })

    test('slices from end when exceeding batch size', () => {
      const messages = Array.from({ length: 20 }, (_, i) =>
        createUserMessage(`msg-${i}`),
      )
      const result = computeVisibleMessages(messages, MESSAGE_BATCH_SIZE)

      expect(result.length).toBe(15)
      expect(result[0].id).toBe('msg-5') // First visible is index 5
      expect(result[14].id).toBe('msg-19') // Last visible is index 19
    })

    test('shows most recent messages (end of array)', () => {
      const messages = Array.from({ length: 50 }, (_, i) =>
        createUserMessage(`msg-${i}`),
      )
      const result = computeVisibleMessages(messages, MESSAGE_BATCH_SIZE)

      // Should show last 15 messages (indices 35-49)
      expect(result[0].id).toBe('msg-35')
      expect(result[14].id).toBe('msg-49')
    })
  })

  describe('hiddenMessageCount computation', () => {
    test('returns 0 when all messages visible', () => {
      expect(computeHiddenCount(10, 15)).toBe(0)
      expect(computeHiddenCount(15, 15)).toBe(0)
    })

    test('returns correct count when messages hidden', () => {
      expect(computeHiddenCount(20, 15)).toBe(5)
      expect(computeHiddenCount(50, 15)).toBe(35)
    })

    test('never returns negative', () => {
      expect(computeHiddenCount(5, 15)).toBe(0)
      expect(computeHiddenCount(0, 15)).toBe(0)
    })
  })

  describe('handleLoadPreviousMessages behavior', () => {
    test('increases visible count by batch size', () => {
      let visibleCount = MESSAGE_BATCH_SIZE

      // Simulate handleLoadPreviousMessages
      visibleCount = visibleCount + MESSAGE_BATCH_SIZE

      expect(visibleCount).toBe(30)
    })

    test('loading more reveals older messages', () => {
      const messages = Array.from({ length: 50 }, (_, i) =>
        createUserMessage(`msg-${i}`),
      )

      // Initial state
      let visibleCount = MESSAGE_BATCH_SIZE
      let visible = computeVisibleMessages(messages, visibleCount)
      expect(visible[0].id).toBe('msg-35')

      // Load more
      visibleCount = visibleCount + MESSAGE_BATCH_SIZE
      visible = computeVisibleMessages(messages, visibleCount)
      expect(visible.length).toBe(30)
      expect(visible[0].id).toBe('msg-20') // Now see older messages
    })

    test('eventually shows all messages', () => {
      const messages = Array.from({ length: 50 }, (_, i) =>
        createUserMessage(`msg-${i}`),
      )

      let visibleCount = MESSAGE_BATCH_SIZE

      // Keep loading until all visible
      while (computeHiddenCount(messages.length, visibleCount) > 0) {
        visibleCount = visibleCount + MESSAGE_BATCH_SIZE
      }

      const visible = computeVisibleMessages(messages, visibleCount)
      expect(visible.length).toBe(50)
      expect(computeHiddenCount(messages.length, visible.length)).toBe(0)
    })
  })
})

// ============================================================================
// Tests: Integration Scenarios
// ============================================================================

describe('useChatMessages - integration scenarios', () => {
  test('scenario: new conversation starts with full visibility', () => {
    const messages = [
      createUserMessage('msg-0'),
      createAgentMessage('msg-1'),
      createUserMessage('msg-2'),
    ]

    const visible = computeVisibleMessages(messages, MESSAGE_BATCH_SIZE)
    const hidden = computeHiddenCount(messages.length, visible.length)

    expect(visible.length).toBe(3)
    expect(hidden).toBe(0)
    expect(visible).toBe(messages) // Same reference
  })

  test('scenario: long conversation with pagination', () => {
    const messages = Array.from({ length: 100 }, (_, i) =>
      i % 2 === 0 ? createUserMessage(`msg-${i}`) : createAgentMessage(`msg-${i}`),
    )

    // Initial load
    let visibleCount = MESSAGE_BATCH_SIZE
    let visible = computeVisibleMessages(messages, visibleCount)

    expect(visible.length).toBe(15)
    expect(computeHiddenCount(messages.length, visible.length)).toBe(85)

    // User scrolls up to load more (twice)
    visibleCount += MESSAGE_BATCH_SIZE
    visibleCount += MESSAGE_BATCH_SIZE
    visible = computeVisibleMessages(messages, visibleCount)

    expect(visible.length).toBe(45)
    expect(computeHiddenCount(messages.length, visible.length)).toBe(55)
  })

  test('scenario: collapse agent then load more messages', () => {
    // Create messages with an agent in the visible portion
    let messages = Array.from({ length: 20 }, (_, i) =>
      i === 18 ? createAgentMessage(`agent-${i}`, { isCollapsed: false }) : createUserMessage(`msg-${i}`),
    )

    // Verify agent is visible (in last 15)
    let visible = computeVisibleMessages(messages, MESSAGE_BATCH_SIZE)
    const agentInVisible = visible.find(m => m.id === 'agent-18')
    expect(agentInVisible).toBeDefined()

    // Collapse the agent
    messages = applyCollapseToggle(messages, 'agent-18')
    const collapsedAgent = messages.find(m => m.id === 'agent-18')
    expect(collapsedAgent?.metadata?.isCollapsed).toBe(true)

    // Load more - collapse state should be preserved
    const visibleCount = MESSAGE_BATCH_SIZE + MESSAGE_BATCH_SIZE
    visible = computeVisibleMessages(messages, visibleCount)

    const agentAfterLoadMore = visible.find(m => m.id === 'agent-18')
    expect(agentAfterLoadMore?.metadata?.isCollapsed).toBe(true)
  })
})

// ============================================================================
// Tests: Edge Cases
// ============================================================================

describe('useChatMessages - edge cases', () => {
  test('empty messages array', () => {
    const messages: ChatMessage[] = []

    const visible = computeVisibleMessages(messages, MESSAGE_BATCH_SIZE)
    const hidden = computeHiddenCount(messages.length, visible.length)

    expect(visible).toEqual([])
    expect(hidden).toBe(0)
  })

  test('single message', () => {
    const messages = [createUserMessage('only-one')]

    const visible = computeVisibleMessages(messages, MESSAGE_BATCH_SIZE)

    expect(visible.length).toBe(1)
    expect(visible[0].id).toBe('only-one')
  })

  test('exactly batch size + 1 hides exactly 1', () => {
    const messages = Array.from({ length: 16 }, (_, i) =>
      createUserMessage(`msg-${i}`),
    )

    const visible = computeVisibleMessages(messages, MESSAGE_BATCH_SIZE)
    const hidden = computeHiddenCount(messages.length, visible.length)

    expect(visible.length).toBe(15)
    expect(hidden).toBe(1)
    expect(visible[0].id).toBe('msg-1') // msg-0 is hidden
  })

  test('toggle nonexistent id leaves messages unchanged', () => {
    const messages = [
      createAgentMessage('agent-1', { isCollapsed: false }),
    ]

    const result = applyCollapseToggle(messages, 'nonexistent-id')

    expect(result[0]).toBe(messages[0]) // Same reference
  })

  test('message without blocks is unchanged when toggling block id', () => {
    const messages = [createUserMessage('user-1')]

    const result = applyCollapseToggle(messages, 'some-block-id')

    expect(result[0]).toBe(messages[0])
  })
})
