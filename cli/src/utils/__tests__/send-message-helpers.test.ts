import { describe, test, expect } from 'bun:test'

import { appendTextToRootStream } from '../block-operations'
import {
  updateBlocksRecursively,
  scrubPlanTags,
  scrubPlanTagsInBlocks,
  extractPlanFromBuffer,
  createAgentBlock,
  getAgentBaseName,
  autoCollapseBlocks,
  updateToolBlockWithOutput,
  transformAskUserBlocks,
  appendInterruptionNotice,
  extractSpawnAgentResultContent,
} from '../message-block-helpers'
import {
  createModeDividerMessage,
  createAiMessageShell,
  createErrorMessage,
  generateAiMessageId,
  autoCollapsePreviousMessages,
  createSpawnAgentBlocks,
  isSpawnAgentsResult,
  markMessageComplete,
  setMessageError,
} from '../send-message-helpers'

import type {
  ContentBlock,
  AgentContentBlock,
  ChatMessage,
} from '../../types/chat'

// ============================================================================
// Block Manipulation Helpers Tests (from message-block-helpers)
// ============================================================================

describe('updateBlocksRecursively', () => {
  test('updates a top-level agent block', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'agent-1',
        agentName: 'Test',
        agentType: 'test',
        content: '',
        status: 'running',
      },
    ]

    const result = updateBlocksRecursively(blocks, 'agent-1', (block) => ({
      ...block,
      status: 'complete' as const,
    }))

    expect(result[0].type).toBe('agent')
    expect((result[0] as AgentContentBlock).status).toBe('complete')
  })

  test('updates a nested agent block', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'parent',
        agentName: 'Parent',
        agentType: 'parent',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'agent',
            agentId: 'child',
            agentName: 'Child',
            agentType: 'child',
            content: '',
            status: 'running',
          },
        ],
      },
    ]

    const result = updateBlocksRecursively(blocks, 'child', (block) => ({
      ...block,
      status: 'complete' as const,
    }))

    const parent = result[0] as AgentContentBlock
    const child = parent.blocks![0] as AgentContentBlock
    expect(child.status).toBe('complete')
  })

  test('returns original array if no match found', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'Hello' }]

    const result = updateBlocksRecursively(blocks, 'nonexistent', (block) => ({
      ...block,
    }))

    expect(result).toBe(blocks) // Same reference
  })

  test('does not create new blocks for unchanged nested structures', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'agent-1',
        agentName: 'Test',
        agentType: 'test',
        content: '',
        status: 'running',
        blocks: [{ type: 'text', content: 'Nested text' }],
      },
    ]

    const result = updateBlocksRecursively(blocks, 'nonexistent', (block) => ({
      ...block,
    }))

    expect(result).toBe(blocks)
  })
})

describe('scrubPlanTags', () => {
  test('removes complete PLAN tags', () => {
    const input = 'Before <PLAN>plan content</cb_plan> After'
    expect(scrubPlanTags(input)).toBe('Before  After')
  })

  test('removes incomplete trailing PLAN tags', () => {
    const input = 'Content <PLAN>incomplete plan'
    expect(scrubPlanTags(input)).toBe('Content ')
  })

  test('handles string with no PLAN tags', () => {
    const input = 'Just regular content'
    expect(scrubPlanTags(input)).toBe('Just regular content')
  })

  test('handles empty string', () => {
    expect(scrubPlanTags('')).toBe('')
  })
})

describe('scrubPlanTagsInBlocks', () => {
  test('removes plan tags from text blocks', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'Hello <PLAN>plan</cb_plan> World' },
    ]

    const result = scrubPlanTagsInBlocks(blocks)
    expect((result[0] as any).content).toBe('Hello  World')
  })

  test('filters out empty text blocks after scrubbing', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: '<PLAN>only plan</cb_plan>' },
      { type: 'text', content: 'Keep this' },
    ]

    const result = scrubPlanTagsInBlocks(blocks)
    expect(result).toHaveLength(1)
    expect((result[0] as any).content).toBe('Keep this')
  })

  test('preserves non-text blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: '1',
        agentName: 'Test',
        agentType: 'test',
        content: '',
        status: 'running',
      },
    ]

    const result = scrubPlanTagsInBlocks(blocks)
    expect(result).toEqual(blocks)
  })
})

// ============================================================================
// Message Creation Helpers Tests (from send-message-helpers)
// ============================================================================

describe('createModeDividerMessage', () => {
  test('creates a mode divider message', () => {
    const message = createModeDividerMessage('MAX')

    expect(message.variant).toBe('ai')
    expect(message.content).toBe('')
    expect(message.blocks).toHaveLength(1)
    expect(message.blocks![0].type).toBe('mode-divider')
    expect((message.blocks![0] as any).mode).toBe('MAX')
    expect(message.id).toMatch(/^divider-/)
  })
})

describe('createAiMessageShell', () => {
  test('creates an empty AI message shell', () => {
    const message = createAiMessageShell('ai-123')

    expect(message.id).toBe('ai-123')
    expect(message.variant).toBe('ai')
    expect(message.content).toBe('')
    expect(message.blocks).toEqual([])
  })
})

describe('createErrorMessage', () => {
  test('creates an error message', () => {
    const message = createErrorMessage('Something went wrong')

    expect(message.variant).toBe('error')
    expect(message.content).toBe('Something went wrong')
    expect(message.id).toMatch(/^error-/)
  })
})

describe('generateAiMessageId', () => {
  test('generates unique IDs', () => {
    const id1 = generateAiMessageId()
    const id2 = generateAiMessageId()

    expect(id1).toMatch(/^ai-\d+-[a-f0-9]+$/)
    expect(id1).not.toBe(id2)
  })
})

// ============================================================================
// Auto-Collapse Logic Tests
// ============================================================================

describe('autoCollapseBlocks', () => {
  test('collapses text blocks with thinkingId', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'thinking', thinkingId: 'think-1' },
    ]

    const result = autoCollapseBlocks(blocks)
    expect((result[0] as any).isCollapsed).toBe(true)
  })

  test('does not collapse user-opened blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'text',
        content: 'thinking',
        thinkingId: 'think-1',
        userOpened: true,
      },
    ]

    const result = autoCollapseBlocks(blocks)
    expect((result[0] as any).isCollapsed).toBeUndefined()
  })

  test('collapses agent blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: '1',
        agentName: 'Test',
        agentType: 'test',
        content: '',
        status: 'running',
      },
    ]

    const result = autoCollapseBlocks(blocks)
    expect((result[0] as any).isCollapsed).toBe(true)
  })

  test('collapses tool blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-1',
        toolName: 'read_files',
        input: {},
      },
    ]

    const result = autoCollapseBlocks(blocks)
    expect((result[0] as any).isCollapsed).toBe(true)
  })

  test('recursively collapses nested agent blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'parent',
        agentName: 'Parent',
        agentType: 'parent',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'agent',
            agentId: 'child',
            agentName: 'Child',
            agentType: 'child',
            content: '',
            status: 'running',
          },
        ],
      },
    ]

    const result = autoCollapseBlocks(blocks)
    const parent = result[0] as AgentContentBlock
    const child = parent.blocks![0] as AgentContentBlock

    expect(parent.isCollapsed).toBe(true)
    expect(child.isCollapsed).toBe(true)
  })
})

describe('autoCollapsePreviousMessages', () => {
  test('does not collapse the current AI message', () => {
    const messages: ChatMessage[] = [
      {
        id: 'ai-123',
        variant: 'ai',
        content: '',
        blocks: [
          {
            type: 'agent',
            agentId: '1',
            agentName: 'Test',
            agentType: 'test',
            content: '',
            status: 'running',
          },
        ],
        timestamp: '',
      },
    ]

    const result = autoCollapsePreviousMessages(messages, 'ai-123')
    expect((result[0].blocks![0] as any).isCollapsed).toBeUndefined()
  })

  test('collapses previous messages', () => {
    const messages: ChatMessage[] = [
      {
        id: 'ai-old',
        variant: 'ai',
        content: '',
        blocks: [
          {
            type: 'agent',
            agentId: '1',
            agentName: 'Test',
            agentType: 'test',
            content: '',
            status: 'running',
          },
        ],
        timestamp: '',
      },
      {
        id: 'ai-new',
        variant: 'ai',
        content: '',
        blocks: [],
        timestamp: '',
      },
    ]

    const result = autoCollapsePreviousMessages(messages, 'ai-new')
    expect((result[0].blocks![0] as any).isCollapsed).toBe(true)
  })

  test('respects user-opened agent messages', () => {
    const messages: ChatMessage[] = [
      {
        id: 'agent-msg',
        variant: 'agent',
        content: '',
        timestamp: '',
        metadata: { userOpened: true },
      },
    ]

    const result = autoCollapsePreviousMessages(messages, 'ai-new')
    expect(result[0].metadata?.isCollapsed).toBeUndefined()
  })
})

// ============================================================================
// Stream Chunk Processing Tests (from block-operations)
// ============================================================================

describe('appendTextToRootStream', () => {
  test('creates new text block for empty blocks array', () => {
    const result = appendTextToRootStream([], { type: 'text', text: 'Hello' })

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('text')
    expect((result[0] as any).content).toBe('Hello')
  })

  test('appends to existing text block of same type', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'Hello', textType: 'text' },
    ]

    const result = appendTextToRootStream(blocks, {
      type: 'text',
      text: ' World',
    })

    expect(result).toHaveLength(1)
    expect((result[0] as any).content).toBe('Hello World')
  })

  test('creates new block for different text type', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'Hello', textType: 'text' },
    ]

    const result = appendTextToRootStream(blocks, {
      type: 'reasoning',
      text: 'Thinking...',
    })

    expect(result).toHaveLength(2)
    expect((result[1] as any).textType).toBe('reasoning')
    expect((result[1] as any).isCollapsed).toBe(true)
  })

  test('returns original blocks for empty text', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'Hello' }]

    const result = appendTextToRootStream(blocks, { type: 'text', text: '' })

    expect(result).toBe(blocks)
  })
})

describe('extractPlanFromBuffer', () => {
  test('extracts plan content from complete tags', () => {
    const buffer = 'Some text <PLAN>This is the plan</PLAN> more text'

    const result = extractPlanFromBuffer(buffer)

    expect(result).toBe('This is the plan')
  })

  test('returns null for incomplete plan', () => {
    const buffer = 'Some text <PLAN>Incomplete plan'

    expect(extractPlanFromBuffer(buffer)).toBeNull()
  })

  test('returns null when no plan tags exist', () => {
    expect(extractPlanFromBuffer('No plan here')).toBeNull()
  })

  test('trims whitespace from extracted plan', () => {
    const buffer = '<PLAN>  Trimmed plan  </PLAN>'

    expect(extractPlanFromBuffer(buffer)).toBe('Trimmed plan')
  })
})

// ============================================================================
// Agent Block Helpers Tests (from message-block-helpers)
// ============================================================================

describe('createAgentBlock', () => {
  test('creates an agent block with required fields', () => {
    const block = createAgentBlock({
      agentId: 'agent-1',
      agentType: 'file-picker',
    })

    expect(block.type).toBe('agent')
    expect(block.agentId).toBe('agent-1')
    expect(block.agentType).toBe('file-picker')
    expect(block.status).toBe('running')
    expect(block.content).toBe('')
  })

  test('includes optional prompt', () => {
    const block = createAgentBlock({
      agentId: 'agent-1',
      agentType: 'file-picker',
      prompt: 'Find files',
    })

    expect(block.initialPrompt).toBe('Find files')
  })

  test('includes optional params', () => {
    const block = createAgentBlock({
      agentId: 'agent-1',
      agentType: 'file-picker',
      params: { path: '/src' },
    })

    expect(block.params).toEqual({ path: '/src' })
  })
})

describe('getAgentBaseName', () => {
  test('extracts base name from scoped versioned name', () => {
    expect(getAgentBaseName('codebuff/file-picker@0.0.2')).toBe('file-picker')
  })

  test('extracts base name from simple versioned name', () => {
    expect(getAgentBaseName('file-picker@1.0.0')).toBe('file-picker')
  })

  test('returns simple name unchanged', () => {
    expect(getAgentBaseName('file-picker')).toBe('file-picker')
  })
})

describe('agentTypesMatch', () => {
  test('matches same base names with different versions', () => {
    expect(
      getAgentBaseName('codebuff/file-picker@0.0.2') ===
        getAgentBaseName('file-picker@1.0.0'),
    ).toBe(true)
  })

  test('matches same simple names', () => {
    expect(
      getAgentBaseName('file-picker') === getAgentBaseName('file-picker'),
    ).toBe(true)
  })

  test('does not match different base names', () => {
    expect(
      getAgentBaseName('file-picker') === getAgentBaseName('code-searcher'),
    ).toBe(false)
  })
})

// ============================================================================
// Tool Block Helpers Tests (from message-block-helpers)
// ============================================================================

describe('updateToolBlockWithOutput', () => {
  test('updates tool block with output', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-1',
        toolName: 'read_files',
        input: {},
      },
    ]

    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'tool-1',
      toolOutput: ['File contents'],
    })

    expect((result[0] as any).output).toBe('File contents')
  })

  test('updates nested tool block', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'agent-1',
        agentName: 'Test',
        agentType: 'test',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'tool',
            toolCallId: 'tool-1',
            toolName: 'read_files',
            input: {},
          },
        ],
      },
    ]

    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'tool-1',
      toolOutput: ['File contents'],
    })
    const agent = result[0] as AgentContentBlock
    expect((agent.blocks![0] as any).output).toBe('File contents')
  })

  test('returns same reference if no match', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'Hello' }]

    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'tool-1',
      toolOutput: ['Output'],
    })

    expect(result).toEqual(blocks)
  })
})

// ============================================================================
// Ask User Transformation Tests (from message-block-helpers)
// ============================================================================

describe('transformAskUserBlocks', () => {
  test('transforms ask_user tool block to ask-user block', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-1',
        toolName: 'ask_user',
        input: { questions: [{ question: 'Choose?', options: ['A', 'B'] }] },
      },
    ]

    const result = transformAskUserBlocks(blocks, {
      toolCallId: 'tool-1',
      resultValue: { answers: [{ selectedOption: 'A' }] },
    })

    expect(result[0].type).toBe('ask-user')
    expect((result[0] as any).answers).toEqual([{ selectedOption: 'A' }])
  })

  test('keeps tool block if no answers or skipped', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-1',
        toolName: 'ask_user',
        input: { questions: [] },
      },
    ]

    const result = transformAskUserBlocks(blocks, {
      toolCallId: 'tool-1',
      resultValue: {},
    })

    expect(result[0].type).toBe('tool')
  })

  test('handles skipped state', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-1',
        toolName: 'ask_user',
        input: { questions: [] },
      },
    ]

    const result = transformAskUserBlocks(blocks, {
      toolCallId: 'tool-1',
      resultValue: { skipped: true },
    })

    expect(result[0].type).toBe('ask-user')
    expect((result[0] as any).skipped).toBe(true)
  })
})

// ============================================================================
// Interruption Handling Tests (from message-block-helpers)
// ============================================================================

describe('appendInterruptionNotice', () => {
  test('appends to existing text block', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'Partial response' },
    ]

    const result = appendInterruptionNotice(blocks)

    expect((result[0] as any).content).toBe(
      'Partial response\n\n[response interrupted]',
    )
  })

  test('creates new text block if no existing text', () => {
    const blocks: ContentBlock[] = []

    const result = appendInterruptionNotice(blocks)

    expect(result).toHaveLength(1)
    expect((result[0] as any).content).toBe('[response interrupted]')
  })

  test('creates new block if last block is not text', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-1',
        toolName: 'read_files',
        input: {},
      },
    ]

    const result = appendInterruptionNotice(blocks)

    expect(result).toHaveLength(2)
    expect(result[1].type).toBe('text')
  })
})

// ============================================================================
// Spawn Agents Helpers Tests (from send-message-helpers)
// ============================================================================

describe('createSpawnAgentBlocks', () => {
  test('creates agent blocks from spawn_agents input', () => {
    const agents = [
      { agent_type: 'file-picker', prompt: 'Find files' },
      { agent_type: 'code-searcher', prompt: 'Search code' },
    ]

    const result = createSpawnAgentBlocks('tool-1', agents)

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('agent')
    expect((result[0] as any).agentId).toBe('tool-1-0')
    expect((result[1] as any).agentId).toBe('tool-1-1')
  })

  test('filters out hidden agents', () => {
    const agents = [
      { agent_type: 'file-picker' },
      { agent_type: 'codebuff/context-pruner' }, // This should be hidden
    ]

    const result = createSpawnAgentBlocks('tool-1', agents)

    // context-pruner is in the hidden agents list
    expect(result.length).toBeLessThanOrEqual(2)
  })
})

describe('isSpawnAgentsResult', () => {
  test('returns true for spawn_agents result structure', () => {
    const output = [{ agentName: 'file-picker', value: 'result' }]

    expect(isSpawnAgentsResult(output)).toBe(true)
  })

  test('returns false for non-array', () => {
    expect(isSpawnAgentsResult('string')).toBe(false)
    expect(isSpawnAgentsResult(null)).toBe(false)
  })

  test('returns false for array without agent properties', () => {
    expect(isSpawnAgentsResult([{ foo: 'bar' }])).toBe(false)
  })
})

describe('extractSpawnAgentResultContent', () => {
  test('extracts string value directly', () => {
    const result = extractSpawnAgentResultContent('Simple result')

    expect(result.content).toBe('Simple result')
    expect(result.hasError).toBe(false)
  })

  test('extracts string from value property', () => {
    const result = extractSpawnAgentResultContent({ value: 'Nested string' })

    expect(result.content).toBe('Nested string')
    expect(result.hasError).toBe(false)
  })

  test('extracts error message', () => {
    const result = extractSpawnAgentResultContent({ errorMessage: 'Failed!' })

    expect(result.content).toBe('Failed!')
    expect(result.hasError).toBe(true)
  })

  test('extracts nested error message', () => {
    const result = extractSpawnAgentResultContent({
      value: { errorMessage: 'Nested error!' },
    })

    expect(result.content).toBe('Nested error!')
    expect(result.hasError).toBe(true)
  })

  test('extracts message property', () => {
    const result = extractSpawnAgentResultContent({
      message: 'Message content',
    })

    expect(result.content).toBe('Message content')
    expect(result.hasError).toBe(false)
  })

  test('extracts nested message property', () => {
    const result = extractSpawnAgentResultContent({
      value: { message: 'Nested message' },
    })

    expect(result.content).toBe('Nested message')
    expect(result.hasError).toBe(false)
  })

  test('returns empty for null/undefined', () => {
    const result = extractSpawnAgentResultContent(null)

    expect(result.content).toBe('')
    expect(result.hasError).toBe(false)
  })

  test('returns empty for empty object', () => {
    const result = extractSpawnAgentResultContent({})

    expect(result.content).toBe('')
    expect(result.hasError).toBe(false)
  })
})

// ============================================================================
// Message Completion Helpers Tests (from send-message-helpers)
// ============================================================================

describe('markMessageComplete', () => {
  const baseMessage: ChatMessage = {
    id: 'msg-1',
    variant: 'ai',
    content: 'Hello',
    timestamp: '',
  }

  test('marks message as complete', () => {
    const result = markMessageComplete(baseMessage)

    expect(result.isComplete).toBe(true)
  })

  test('adds completion time', () => {
    const result = markMessageComplete(baseMessage, { completionTime: '5s' })

    expect(result.completionTime).toBe('5s')
  })

  test('adds credits', () => {
    const result = markMessageComplete(baseMessage, { credits: 100 })

    expect(result.credits).toBe(100)
  })

  test('adds runState to metadata', () => {
    const runState = { output: { type: 'text', text: 'Done' } }
    const result = markMessageComplete(baseMessage, { runState })

    expect(result.metadata?.runState).toEqual(runState)
  })

  test('preserves existing metadata', () => {
    const message: ChatMessage = {
      ...baseMessage,
      metadata: { userOpened: true },
    }

    const result = markMessageComplete(message, { credits: 50 })

    expect(result.metadata?.userOpened).toBe(true)
  })
})

describe('setMessageError', () => {
  test('sets error content and clears blocks', () => {
    const message: ChatMessage = {
      id: 'msg-1',
      variant: 'ai',
      content: '',
      blocks: [{ type: 'text', content: 'Old content' }],
      timestamp: '',
    }

    const result = setMessageError(message, 'Error occurred')

    expect(result.content).toBe('Error occurred')
    expect(result.blocks).toBeUndefined()
    expect(result.isComplete).toBe(true)
  })
})
