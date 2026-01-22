import { describe, it, expect } from 'bun:test'

import {
  updateBlockById,
  updateAgentBlockById,
  toggleBlockCollapse,
  traverseBlocks,
  findBlockByPredicate,
  mapBlocks,
} from '../block-tree-utils'

import type { ContentBlock } from '../../types/chat'
import { isAgentBlock } from '../../types/chat'

describe('updateBlockById', () => {
  it('updates agent block by agentId', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'hello' },
      {
        type: 'agent',
        agentId: 'a1',
        agentType: 'test',
        agentName: 'Test',
        content: 'original',
        status: 'running',
        blocks: [],
      },
    ]

    const result = updateBlockById(blocks, 'a1', (block) => ({
      ...block,
      content: 'updated',
    }))

    expect(result[1]).toMatchObject({ agentId: 'a1', content: 'updated' })
  })

  it('updates tool block by toolCallId', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 't1',
        toolName: 'read_files',
        input: {},
      },
    ]

    const result = updateBlockById(blocks, 't1', (block) => ({
      ...block,
      output: 'result',
    }))

    expect(result[0]).toMatchObject({ toolCallId: 't1', output: 'result' })
  })

  it('updates text block by thinkingId', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'text',
        content: 'thinking content',
        thinkingId: 'think1',
        textType: 'reasoning',
      },
    ]

    const result = updateBlockById(blocks, 'think1', (block) => ({
      ...block,
      isCollapsed: true,
    }))

    expect(result[0]).toMatchObject({ thinkingId: 'think1', isCollapsed: true })
  })

  it('updates agent-list block by id', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent-list',
        id: 'list1',
        agents: [{ id: 'a1', displayName: 'Agent 1' }],
        agentsDir: '/agents',
      },
    ]

    const result = updateBlockById(blocks, 'list1', (block) => ({
      ...block,
      isCollapsed: true,
    }))

    expect(result[0]).toMatchObject({ id: 'list1', isCollapsed: true })
  })

  it('updates nested blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'parent',
        agentType: 'test',
        agentName: 'Parent',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'agent',
            agentId: 'child',
            agentType: 'test',
            agentName: 'Child',
            content: 'original',
            status: 'running',
            blocks: [],
          },
        ],
      },
    ]

    const result = updateBlockById(blocks, 'child', (block) => ({
      ...block,
      content: 'updated',
    }))

    const parent = result[0]
    if (!isAgentBlock(parent)) throw new Error('Expected agent block')
    expect(parent.blocks?.[0]).toMatchObject({ agentId: 'child', content: 'updated' })
  })

  it('updates deeply nested blocks (3+ levels)', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'level1',
        agentType: 'test',
        agentName: 'Level 1',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'agent',
            agentId: 'level2',
            agentType: 'test',
            agentName: 'Level 2',
            content: '',
            status: 'running',
            blocks: [
              {
                type: 'agent',
                agentId: 'level3',
                agentType: 'test',
                agentName: 'Level 3',
                content: '',
                status: 'running',
                blocks: [
                  {
                    type: 'text',
                    content: 'deepest-original',
                    thinkingId: 'deep-think',
                  },
                ],
              },
            ],
          },
        ],
      },
    ]

    const result = updateBlockById(blocks, 'deep-think', (block) => ({
      ...block,
      content: 'deepest-updated',
    }))

    // Verify the deeply nested text block was updated
    const level1 = result[0]
    if (!isAgentBlock(level1)) throw new Error('Expected agent block at level 1')
    const level2 = level1.blocks?.[0]
    if (!level2 || !isAgentBlock(level2)) throw new Error('Expected agent block at level 2')
    const level3 = level2.blocks?.[0]
    if (!level3 || !isAgentBlock(level3)) throw new Error('Expected agent block at level 3')
    expect(level3.blocks?.[0]).toMatchObject({ thinkingId: 'deep-think', content: 'deepest-updated' })
  })

  it('preserves reference equality when no match', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'hello' }]
    const result = updateBlockById(blocks, 'nonexistent', (b) => b)
    expect(result).toBe(blocks)
  })
})

describe('updateAgentBlockById', () => {
  it('updates only agent blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'a1',
        agentType: 'test',
        agentName: 'Test',
        content: 'original',
        status: 'running',
        blocks: [],
      },
    ]

    const result = updateAgentBlockById(blocks, 'a1', (block) => ({
      ...block,
      content: 'updated',
    }))

    expect(result[0]).toMatchObject({ content: 'updated' })
  })

  it('ignores non-agent blocks with matching ID string', () => {
    const toolBlock: ContentBlock = {
      type: 'tool',
      toolCallId: 'shared-id',
      toolName: 'read_files',
      input: {},
    }
    const blocks: ContentBlock[] = [toolBlock]

    const result = updateAgentBlockById(blocks, 'shared-id', (block) => ({
      ...block,
      output: 'should-not-appear',
    }))

    // Should return original array unchanged since no agent matched
    expect(result).toBe(blocks)
    expect(result[0]).toBe(toolBlock)
  })

  it('updates nested agent blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'parent',
        agentType: 'test',
        agentName: 'Parent',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'agent',
            agentId: 'child',
            agentType: 'test',
            agentName: 'Child',
            content: 'original',
            status: 'running',
            blocks: [],
          },
        ],
      },
    ]

    const result = updateAgentBlockById(blocks, 'child', (block) => ({
      ...block,
      content: 'updated',
    }))

    const parent = result[0]
    if (!isAgentBlock(parent)) throw new Error('Expected agent block')
    expect(parent.blocks?.[0]).toMatchObject({ agentId: 'child', content: 'updated' })
  })
})

describe('toggleBlockCollapse', () => {
  it('expands a collapsed block and sets userOpened', () => {
    const block: ContentBlock = {
      type: 'agent',
      agentId: 'a1',
      agentType: 'test',
      agentName: 'Test',
      content: '',
      status: 'complete',
      blocks: [],
      isCollapsed: true,
    }

    const result = toggleBlockCollapse(block)

    expect(result).toMatchObject({ isCollapsed: false, userOpened: true })
  })

  it('collapses an expanded block', () => {
    const block: ContentBlock = {
      type: 'agent',
      agentId: 'a1',
      agentType: 'test',
      agentName: 'Test',
      content: '',
      status: 'complete',
      blocks: [],
      isCollapsed: false,
    }

    const result = toggleBlockCollapse(block)

    expect(result).toMatchObject({ isCollapsed: true, userOpened: false })
  })

  it('treats undefined isCollapsed as false (expanded)', () => {
    const block: ContentBlock = {
      type: 'agent',
      agentId: 'a1',
      agentType: 'test',
      agentName: 'Test',
      content: '',
      status: 'complete',
      blocks: [],
      // isCollapsed is undefined
    }

    const result = toggleBlockCollapse(block)

    // Should collapse (false -> true) and userOpened should be false
    expect(result).toMatchObject({ isCollapsed: true, userOpened: false })
  })

  it('returns non-collapsible blocks unchanged', () => {
    const planBlock: ContentBlock = { type: 'plan', content: 'my plan' }
    const result = toggleBlockCollapse(planBlock)
    expect(result).toBe(planBlock)
  })

  it('works with tool blocks', () => {
    const toolBlock: ContentBlock = {
      type: 'tool',
      toolCallId: 't1',
      toolName: 'read_files',
      input: {},
      isCollapsed: true,
    }

    const result = toggleBlockCollapse(toolBlock)

    expect(result).toMatchObject({ isCollapsed: false, userOpened: true })
  })

  it('works with text blocks that have thinkingId', () => {
    const textBlock: ContentBlock = {
      type: 'text',
      content: 'thinking...',
      thinkingId: 'think1',
      isCollapsed: true,
    }

    const result = toggleBlockCollapse(textBlock)

    expect(result).toMatchObject({ isCollapsed: false, userOpened: true })
  })

  it('works with image blocks', () => {
    const imageBlock: ContentBlock = {
      type: 'image',
      image: 'base64data',
      mediaType: 'image/png',
      isCollapsed: false,
    }

    const result = toggleBlockCollapse(imageBlock)

    expect(result).toMatchObject({ isCollapsed: true, userOpened: false })
  })

  it('works with agent-list blocks', () => {
    const agentListBlock: ContentBlock = {
      type: 'agent-list',
      id: 'list1',
      agents: [],
      agentsDir: '/agents',
      isCollapsed: true,
    }

    const result = toggleBlockCollapse(agentListBlock)

    expect(result).toMatchObject({ isCollapsed: false, userOpened: true })
  })

  it('maintains correct state across multiple toggle cycles', () => {
    // Start with a collapsed block
    const block: ContentBlock = {
      type: 'agent',
      agentId: 'a1',
      agentType: 'test',
      agentName: 'Test',
      content: '',
      status: 'complete',
      blocks: [],
      isCollapsed: true,
      userOpened: false,
    }

    // Toggle 1: collapsed -> expanded (user is opening it)
    const afterToggle1 = toggleBlockCollapse(block)
    expect(afterToggle1).toMatchObject({ isCollapsed: false, userOpened: true })

    // Toggle 2: expanded -> collapsed (user is closing it)
    const afterToggle2 = toggleBlockCollapse(afterToggle1)
    expect(afterToggle2).toMatchObject({ isCollapsed: true, userOpened: false })

    // Toggle 3: collapsed -> expanded (user is opening it again)
    const afterToggle3 = toggleBlockCollapse(afterToggle2)
    expect(afterToggle3).toMatchObject({ isCollapsed: false, userOpened: true })

    // Toggle 4: expanded -> collapsed (user is closing it again)
    const afterToggle4 = toggleBlockCollapse(afterToggle3)
    expect(afterToggle4).toMatchObject({ isCollapsed: true, userOpened: false })
  })
})

describe('traverseBlocks', () => {
  it('visits all blocks in order', () => {
    const visited: string[] = []
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'first' },
      {
        type: 'agent',
        agentId: 'a1',
        agentType: 'test',
        agentName: 'Test',
        content: '',
        status: 'complete',
        blocks: [{ type: 'text', content: 'nested' }],
      },
      { type: 'text', content: 'last' },
    ]

    traverseBlocks(blocks, (block) => {
      if (block.type === 'text') visited.push(block.content)
      else if (block.type === 'agent') visited.push(`agent:${block.agentId}`)
    })

    expect(visited).toEqual(['first', 'agent:a1', 'nested', 'last'])
  })

  it('stops early when visitor returns false', () => {
    const visited: string[] = []
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'first' },
      { type: 'text', content: 'second' },
      { type: 'text', content: 'third' },
    ]

    traverseBlocks(blocks, (block) => {
      if (block.type === 'text') {
        visited.push(block.content)
        if (block.content === 'second') return false
      }
      return undefined
    })

    expect(visited).toEqual(['first', 'second'])
  })

  it('propagates early exit from nested blocks to parent', () => {
    const visited: string[] = []
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'before-agent' },
      {
        type: 'agent',
        agentId: 'a1',
        agentType: 'test',
        agentName: 'Test',
        content: '',
        status: 'complete',
        blocks: [
          { type: 'text', content: 'nested-first' },
          { type: 'text', content: 'nested-stop' },
          { type: 'text', content: 'nested-after' },
        ],
      },
      { type: 'text', content: 'after-agent' },
    ]

    traverseBlocks(blocks, (block) => {
      if (block.type === 'text') visited.push(block.content)
      else if (block.type === 'agent') visited.push(`agent:${block.agentId}`)
      // Stop when we hit 'nested-stop'
      if (block.type === 'text' && block.content === 'nested-stop') return false
      return undefined
    })

    // Should NOT include 'nested-after' or 'after-agent'
    expect(visited).toEqual(['before-agent', 'agent:a1', 'nested-first', 'nested-stop'])
  })

  it('returns true when traversal completes normally', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'only' }]
    const result = traverseBlocks(blocks, () => undefined)
    expect(result).toBe(true)
  })

  it('returns false when traversal stops early', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'only' }]
    const result = traverseBlocks(blocks, () => false)
    expect(result).toBe(false)
  })
})

describe('findBlockByPredicate', () => {
  it('returns undefined for empty blocks array', () => {
    const result = findBlockByPredicate([], () => true)
    expect(result).toBeUndefined()
  })

  it('finds a block at the top level', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'first' },
      { type: 'text', content: 'target' },
      { type: 'text', content: 'last' },
    ]

    const result = findBlockByPredicate(
      blocks,
      (block) => block.type === 'text' && block.content === 'target',
    )

    expect(result).toEqual({ type: 'text', content: 'target' })
  })

  it('finds a nested block', () => {
    const nestedBlock: ContentBlock = { type: 'text', content: 'nested-target' }
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'first' },
      {
        type: 'agent',
        agentId: 'a1',
        agentType: 'test',
        agentName: 'Test',
        content: '',
        status: 'complete',
        blocks: [nestedBlock],
      },
    ]

    const result = findBlockByPredicate(
      blocks,
      (block) => block.type === 'text' && block.content === 'nested-target',
    )

    expect(result).toBe(nestedBlock)
  })

  it('returns undefined when not found', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'only' }]
    const result = findBlockByPredicate(blocks, (block) => block.type === 'agent')
    expect(result).toBeUndefined()
  })
})

describe('mapBlocks', () => {
  it('returns empty array unchanged for empty input', () => {
    const emptyBlocks: ContentBlock[] = []
    const result = mapBlocks(emptyBlocks, (block) => ({ ...block }))
    expect(result).toBe(emptyBlocks)
  })

  it('transforms all blocks recursively', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'a' },
      {
        type: 'agent',
        agentId: 'a1',
        agentType: 'test',
        agentName: 'Test',
        content: '',
        status: 'complete',
        blocks: [{ type: 'text', content: 'b' }],
      },
    ]

    const result = mapBlocks(blocks, (block) => {
      if (block.type === 'text') {
        return { ...block, content: block.content.toUpperCase() }
      }
      return block
    })

    expect(result[0]).toEqual({ type: 'text', content: 'A' })
    const agent = result[1]
    if (!isAgentBlock(agent)) throw new Error('Expected agent block')
    expect(agent.blocks?.[0]).toEqual({ type: 'text', content: 'B' })
  })

  it('transforms both parent agent block and its nested children', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'a1',
        agentType: 'test',
        agentName: 'Test',
        content: 'agent-content',
        status: 'complete',
        blocks: [
          { type: 'text', content: 'child-text' },
          { type: 'text', content: 'another-child' },
        ],
      },
    ]

    const result = mapBlocks(blocks, (block) => {
      // Modify agent blocks by adding a marker to content
      if (block.type === 'agent') {
        return { ...block, content: block.content + '-MODIFIED' }
      }
      // Modify text blocks by uppercasing
      if (block.type === 'text') {
        return { ...block, content: block.content.toUpperCase() }
      }
      return block
    })

    const agent = result[0]
    if (!isAgentBlock(agent)) throw new Error('Expected agent block')
    
    // Verify parent agent was modified
    expect(agent.content).toBe('agent-content-MODIFIED')
    
    // Verify nested children were also modified
    expect(agent.blocks?.[0]).toMatchObject({ type: 'text', content: 'CHILD-TEXT' })
    expect(agent.blocks?.[1]).toMatchObject({ type: 'text', content: 'ANOTHER-CHILD' })
  })

  it('preserves reference equality when nothing changes', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'unchanged' },
      {
        type: 'agent',
        agentId: 'a1',
        agentType: 'test',
        agentName: 'Test',
        content: '',
        status: 'complete',
        blocks: [{ type: 'text', content: 'also-unchanged' }],
      },
    ]

    const result = mapBlocks(blocks, (block) => block)

    expect(result).toBe(blocks)
  })

  it('only creates new references for changed branches', () => {
    const unchangedBlock: ContentBlock = { type: 'text', content: 'unchanged' }
    const blocks: ContentBlock[] = [
      unchangedBlock,
      {
        type: 'agent',
        agentId: 'a1',
        agentType: 'test',
        agentName: 'Test',
        content: '',
        status: 'complete',
        blocks: [{ type: 'text', content: 'will-change' }],
      },
    ]

    const result = mapBlocks(blocks, (block) => {
      if (block.type === 'text' && block.content === 'will-change') {
        return { ...block, content: 'changed' }
      }
      return block
    })

    expect(result).not.toBe(blocks)
    expect(result[0]).toBe(unchangedBlock)
  })
})
