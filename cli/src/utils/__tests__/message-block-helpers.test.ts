import { describe, expect, test } from 'bun:test'

import {
  getAgentBaseName,
  extractPlanFromBuffer,
  autoCollapseBlocks,
  extractSpawnAgentResultContent,
  appendInterruptionNotice,
  createAgentBlock,
  updateBlocksRecursively,
  nestBlockUnderParent,
  extractBlockById,
  transformAskUserBlocks,
  updateToolBlockWithOutput,
  scrubPlanTags,
  scrubPlanTagsInBlocks,
  insertPlanBlock,
  moveSpawnAgentBlock,
} from '../message-block-helpers'

import type { ContentBlock } from '../../types/chat'

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

  test('handles scoped name without version', () => {
    expect(getAgentBaseName('codebuff/file-picker')).toBe('file-picker')
  })

  test('handles empty string', () => {
    expect(getAgentBaseName('')).toBe('')
  })

  test('handles name with multiple slashes', () => {
    expect(getAgentBaseName('@scope/sub/agent@1.0.0')).toBe('agent')
  })
})

describe('extractPlanFromBuffer', () => {
  test('extracts plan content between tags', () => {
    const buffer = 'Some text <PLAN>This is the plan</PLAN> more text'
    expect(extractPlanFromBuffer(buffer)).toBe('This is the plan')
  })

  test('trims whitespace from extracted plan', () => {
    const buffer = '<PLAN>  \n  Plan with whitespace  \n  </PLAN>'
    expect(extractPlanFromBuffer(buffer)).toBe('Plan with whitespace')
  })

  test('returns null when no opening tag', () => {
    const buffer = 'This is the plan</PLAN>'
    expect(extractPlanFromBuffer(buffer)).toBeNull()
  })

  test('returns null when no closing tag', () => {
    const buffer = '<PLAN>This is the plan'
    expect(extractPlanFromBuffer(buffer)).toBeNull()
  })

  test('returns null when tags are in wrong order', () => {
    const buffer = '</PLAN>content<PLAN>'
    expect(extractPlanFromBuffer(buffer)).toBeNull()
  })

  test('returns null for empty buffer', () => {
    expect(extractPlanFromBuffer('')).toBeNull()
  })

  test('handles multiline plan content', () => {
    const buffer = '<PLAN>\n1. First step\n2. Second step\n3. Third step\n</PLAN>'
    expect(extractPlanFromBuffer(buffer)).toBe(
      '1. First step\n2. Second step\n3. Third step',
    )
  })
})

describe('scrubPlanTags helpers', () => {
  test('removes plan tags from text', () => {
    expect(scrubPlanTags('<PLAN>Plan</PLAN> trailing')).toBe(' trailing')
  })

  test('scrubs plan tags inside text blocks and removes empties', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: '<PLAN>Plan</PLAN>' },
      { type: 'text', content: 'Keep me' },
      { type: 'tool', toolCallId: 'id', toolName: 'read_files', input: {} },
    ]
    const result = scrubPlanTagsInBlocks(blocks)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ type: 'text', content: 'Keep me' })
    expect(result[1].type).toBe('tool')
  })

  test('inserts plan block after scrubbing', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'Intro <PLAN>secret</PLAN>' },
    ]
    const result = insertPlanBlock(blocks, 'Plan body')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ type: 'text', content: 'Intro ' })
    expect(result[1]).toEqual({ type: 'plan', content: 'Plan body' })
  })
})

describe('autoCollapseBlocks', () => {
  test('collapses text blocks with thinkingId', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'thinking', thinkingId: 'think-1' },
    ]
    const result = autoCollapseBlocks(blocks)
    expect(result[0]).toHaveProperty('isCollapsed', true)
  })

  test('preserves user-opened text blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'text',
        content: 'thinking',
        thinkingId: 'think-1',
        userOpened: true,
      },
    ]
    const result = autoCollapseBlocks(blocks)
    expect(result[0]).not.toHaveProperty('isCollapsed')
  })

  test('collapses agent blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'agent-1',
        agentName: 'Test Agent',
        agentType: 'test',
        content: '',
        status: 'complete',
        blocks: [],
        initialPrompt: '',
      },
    ]
    const result = autoCollapseBlocks(blocks)
    expect(result[0]).toHaveProperty('isCollapsed', true)
  })

  test('recursively collapses nested agent blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'parent',
        agentName: 'Parent',
        agentType: 'parent',
        content: '',
        status: 'complete',
        blocks: [
          {
            type: 'agent',
            agentId: 'child',
            agentName: 'Child',
            agentType: 'child',
            content: '',
            status: 'complete',
            blocks: [],
            initialPrompt: '',
          },
        ],
        initialPrompt: '',
      },
    ]
    const result = autoCollapseBlocks(blocks)
    expect(result[0]).toHaveProperty('isCollapsed', true)
    expect((result[0] as any).blocks[0]).toHaveProperty('isCollapsed', true)
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
    expect(result[0]).toHaveProperty('isCollapsed', true)
  })

  test('preserves user-opened tool blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-1',
        toolName: 'read_files',
        input: {},
        userOpened: true,
      },
    ]
    const result = autoCollapseBlocks(blocks)
    expect(result[0]).not.toHaveProperty('isCollapsed')
  })

  test('leaves regular text blocks unchanged', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'Hello' }]
    const result = autoCollapseBlocks(blocks)
    expect(result[0]).toEqual({ type: 'text', content: 'Hello' })
  })
})

describe('extractSpawnAgentResultContent', () => {
  test('returns string value directly', () => {
    const result = extractSpawnAgentResultContent('Simple result')
    expect(result).toEqual({ content: 'Simple result', hasError: false })
  })

  test('extracts error message', () => {
    const result = extractSpawnAgentResultContent({
      errorMessage: 'Something went wrong',
    })
    expect(result).toEqual({
      content: 'Something went wrong',
      hasError: true,
    })
  })

  test('extracts nested value string', () => {
    const result = extractSpawnAgentResultContent({
      type: 'lastMessage',
      value: 'Nested value',
    })
    expect(result).toEqual({ content: 'Nested value', hasError: false })
  })

  test('extracts message field', () => {
    const result = extractSpawnAgentResultContent({
      message: 'Message content',
    })
    expect(result).toEqual({ content: 'Message content', hasError: false })
  })

  test('falls back to formatted output for unknown structure', () => {
    const result = extractSpawnAgentResultContent({ unknownField: 123 })
    expect(result.hasError).toBe(false)
    expect(result.content).toContain('unknownField')
  })

  test('handles null value', () => {
    const result = extractSpawnAgentResultContent(null)
    expect(result.hasError).toBe(false)
  })

  test('handles undefined value', () => {
    const result = extractSpawnAgentResultContent(undefined)
    expect(result.hasError).toBe(false)
  })
})

describe('appendInterruptionNotice', () => {
  test('appends to last text block', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'Hello' }]
    const result = appendInterruptionNotice(blocks)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      type: 'text',
      content: 'Hello\n\n[response interrupted]',
    })
  })

  test('preserves text block fields when appending', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'text',
        content: 'Hello',
        color: 'blue',
        status: 'running',
        thinkingId: 'think-1',
        userOpened: true,
        isCollapsed: true,
      },
    ]
    const result = appendInterruptionNotice(blocks)
    expect(result[0]).toMatchObject({
      color: 'blue',
      status: 'running',
      thinkingId: 'think-1',
      userOpened: true,
      isCollapsed: true,
      content: 'Hello\n\n[response interrupted]',
    })
  })

  test('adds new block when last is not text', () => {
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
    expect(result[1]).toEqual({
      type: 'text',
      content: '[response interrupted]',
    })
  })

  test('adds notice to empty blocks array', () => {
    const result = appendInterruptionNotice([])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      type: 'text',
      content: '[response interrupted]',
    })
  })

  test('preserves other blocks when appending to text', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-1',
        toolName: 'read_files',
        input: {},
      },
      { type: 'text', content: 'Some response' },
    ]
    const result = appendInterruptionNotice(blocks)
    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('tool')
    expect(result[1]).toEqual({
      type: 'text',
      content: 'Some response\n\n[response interrupted]',
    })
  })
})

describe('createAgentBlock', () => {
  test('creates basic agent block with required fields', () => {
    const block = createAgentBlock({
      agentId: 'agent-123',
      agentType: 'file-picker',
    })
    expect(block.type).toBe('agent')
    expect(block.agentId).toBe('agent-123')
    expect(block.agentName).toBe('file-picker')
    expect(block.agentType).toBe('file-picker')
    expect(block.content).toBe('')
    expect(block.status).toBe('running')
    expect(block.blocks).toEqual([])
    expect(block.initialPrompt).toBe('')
  })

  test('includes prompt when provided', () => {
    const block = createAgentBlock({
      agentId: 'agent-123',
      agentType: 'file-picker',
      prompt: 'Find relevant files',
    })
    expect(block.initialPrompt).toBe('Find relevant files')
  })

  test('includes params when provided', () => {
    const block = createAgentBlock({
      agentId: 'agent-123',
      agentType: 'file-picker',
      params: { directories: ['src'] },
    })
    expect(block.params).toEqual({ directories: ['src'] })
  })

  test('uses fallback values for empty agentType', () => {
    const block = createAgentBlock({
      agentId: 'agent-123',
      agentType: '',
    })
    expect(block.agentName).toBe('Agent')
    expect(block.agentType).toBe('unknown')
  })
})

describe('updateBlocksRecursively', () => {
  test('updates target block at top level', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'agent-1',
        agentName: 'Test',
        agentType: 'test',
        content: '',
        status: 'running',
        blocks: [],
        initialPrompt: '',
      },
    ]
    const result = updateBlocksRecursively(blocks, 'agent-1', (block) => ({
      ...block,
      status: 'complete' as const,
    }))
    expect((result[0] as any).status).toBe('complete')
  })

  test('updates nested block', () => {
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
            blocks: [],
            initialPrompt: '',
          },
        ],
        initialPrompt: '',
      },
    ]
    const result = updateBlocksRecursively(blocks, 'child', (block) => ({
      ...block,
      status: 'complete' as const,
    }))
    expect((result[0] as any).blocks[0].status).toBe('complete')
  })

  test('returns original array if target not found', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'Hello' },
    ]
    const result = updateBlocksRecursively(blocks, 'nonexistent', (block) => block)
    expect(result).toBe(blocks)
  })

  test('handles deeply nested blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'level-1',
        agentName: 'L1',
        agentType: 'l1',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'agent',
            agentId: 'level-2',
            agentName: 'L2',
            agentType: 'l2',
            content: '',
            status: 'running',
            blocks: [
              {
                type: 'agent',
                agentId: 'level-3',
                agentName: 'L3',
                agentType: 'l3',
                content: '',
                status: 'running',
                blocks: [],
                initialPrompt: '',
              },
            ],
            initialPrompt: '',
          },
        ],
        initialPrompt: '',
      },
    ]
    const result = updateBlocksRecursively(blocks, 'level-3', (block) => ({
      ...block,
      content: 'updated',
    }))
    expect((result[0] as any).blocks[0].blocks[0].content).toBe('updated')
  })
})

describe('nestBlockUnderParent', () => {
  test('nests block under existing parent', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'parent',
        agentName: 'Parent',
        agentType: 'parent',
        content: '',
        status: 'running',
        blocks: [],
        initialPrompt: '',
      },
    ]
    const childBlock: ContentBlock = { type: 'text', content: 'Child content' }
    const { blocks: result, parentFound } = nestBlockUnderParent(
      blocks,
      'parent',
      childBlock,
    )
    expect(parentFound).toBe(true)
    expect((result[0] as any).blocks).toHaveLength(1)
    expect((result[0] as any).blocks[0]).toEqual(childBlock)
  })

  test('returns parentFound false when parent not found', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'Hello' }]
    const childBlock: ContentBlock = { type: 'text', content: 'Child' }
    const { blocks: result, parentFound } = nestBlockUnderParent(
      blocks,
      'nonexistent',
      childBlock,
    )
    expect(parentFound).toBe(false)
    expect(result).toBe(blocks)
  })

  test('appends to existing blocks in parent', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'parent',
        agentName: 'Parent',
        agentType: 'parent',
        content: '',
        status: 'running',
        blocks: [{ type: 'text', content: 'Existing' }],
        initialPrompt: '',
      },
    ]
    const childBlock: ContentBlock = { type: 'text', content: 'New child' }
    const { blocks: result, parentFound } = nestBlockUnderParent(
      blocks,
      'parent',
      childBlock,
    )
    expect(parentFound).toBe(true)
    expect((result[0] as any).blocks).toHaveLength(2)
    expect((result[0] as any).blocks[1]).toEqual(childBlock)
  })

  test('nests under deeply nested parent', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'grandparent',
        agentName: 'GP',
        agentType: 'gp',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'agent',
            agentId: 'parent',
            agentName: 'Parent',
            agentType: 'parent',
            content: '',
            status: 'running',
            blocks: [],
            initialPrompt: '',
          },
        ],
        initialPrompt: '',
      },
    ]
    const childBlock: ContentBlock = { type: 'text', content: 'Nested child' }
    const { blocks: result, parentFound } = nestBlockUnderParent(
      blocks,
      'parent',
      childBlock,
    )
    expect(parentFound).toBe(true)
    expect((result[0] as any).blocks[0].blocks).toHaveLength(1)
    expect((result[0] as any).blocks[0].blocks[0]).toEqual(childBlock)
  })
})

describe('moveSpawnAgentBlock', () => {
  test('replaces temp agent id with real id', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'temp',
        agentName: 'Temp',
        agentType: 'temp',
        content: '',
        status: 'running',
        blocks: [],
        initialPrompt: '',
      },
    ]
    const result = moveSpawnAgentBlock(blocks, 'temp', 'real')
    expect((result[0] as any).agentId).toBe('real')
  })

  test('nests extracted block under parent when found', () => {
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
            agentId: 'temp',
            agentName: 'Temp',
            agentType: 'temp',
            content: '',
            status: 'running',
            blocks: [],
            initialPrompt: '',
          },
        ],
        initialPrompt: '',
      },
    ]
    const result = moveSpawnAgentBlock(blocks, 'temp', 'real', 'parent')
    const parent = result[0] as any
    expect(parent.blocks).toHaveLength(1)
    expect(parent.blocks[0].agentId).toBe('real')
  })

  test('appends when parent missing', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'temp',
        agentName: 'Temp',
        agentType: 'temp',
        content: '',
        status: 'running',
        blocks: [],
        initialPrompt: '',
      },
      { type: 'text', content: 'other' },
    ]
    const result = moveSpawnAgentBlock(blocks, 'temp', 'real', 'missing')
    expect(result[result.length - 1]).toMatchObject({ type: 'agent' })
  })
})

describe('extractBlockById', () => {
  test('extracts block from top level', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'Keep me' },
      {
        type: 'agent',
        agentId: 'extract-me',
        agentName: 'Extract',
        agentType: 'extract',
        content: '',
        status: 'running',
        blocks: [],
        initialPrompt: '',
      },
    ]
    const { remainingBlocks, extractedBlock } = extractBlockById(
      blocks,
      'extract-me',
    )
    expect(remainingBlocks).toHaveLength(1)
    expect(remainingBlocks[0].type).toBe('text')
    expect(extractedBlock).not.toBeNull()
    expect((extractedBlock as any).agentId).toBe('extract-me')
  })

  test('returns null when block not found', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'Hello' }]
    const { remainingBlocks, extractedBlock } = extractBlockById(
      blocks,
      'nonexistent',
    )
    expect(remainingBlocks).toHaveLength(1)
    expect(extractedBlock).toBeNull()
  })

  test('extracts from nested blocks', () => {
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
            agentId: 'nested-child',
            agentName: 'Child',
            agentType: 'child',
            content: '',
            status: 'running',
            blocks: [],
            initialPrompt: '',
          },
        ],
        initialPrompt: '',
      },
    ]
    const { remainingBlocks, extractedBlock } = extractBlockById(
      blocks,
      'nested-child',
    )
    expect((remainingBlocks[0] as any).blocks).toHaveLength(0)
    expect(extractedBlock).not.toBeNull()
    expect((extractedBlock as any).agentId).toBe('nested-child')
  })

  test('handles empty blocks array', () => {
    const { remainingBlocks, extractedBlock } = extractBlockById([], 'any-id')
    expect(remainingBlocks).toHaveLength(0)
    expect(extractedBlock).toBeNull()
  })

  test('preserves non-matching nested structure', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'parent',
        agentName: 'Parent',
        agentType: 'parent',
        content: '',
        status: 'running',
        blocks: [
          { type: 'text', content: 'Keep this' },
          {
            type: 'agent',
            agentId: 'extract-me',
            agentName: 'Extract',
            agentType: 'extract',
            content: '',
            status: 'running',
            blocks: [],
            initialPrompt: '',
          },
          { type: 'text', content: 'Keep this too' },
        ],
        initialPrompt: '',
      },
    ]
    const { remainingBlocks, extractedBlock } = extractBlockById(
      blocks,
      'extract-me',
    )
    expect((remainingBlocks[0] as any).blocks).toHaveLength(2)
    expect((remainingBlocks[0] as any).blocks[0].content).toBe('Keep this')
    expect((remainingBlocks[0] as any).blocks[1].content).toBe('Keep this too')
    expect(extractedBlock).not.toBeNull()
  })
})

describe('transformAskUserBlocks', () => {
  test('transforms ask_user tool block to ask-user block', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'ask_user',
        input: { questions: [{ question: 'Pick one', options: ['A', 'B'] }] },
      },
    ]
    const result = transformAskUserBlocks(blocks, {
      toolCallId: 'tool-123',
      resultValue: { answers: ['A'] },
    })
    expect(result[0].type).toBe('ask-user')
    expect((result[0] as any).answers).toEqual(['A'])
    expect((result[0] as any).questions).toEqual([
      { question: 'Pick one', options: ['A', 'B'] },
    ])
  })

  test('transforms skipped ask_user block', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'ask_user',
        input: { questions: [{ question: 'Pick one', options: ['A', 'B'] }] },
      },
    ]
    const result = transformAskUserBlocks(blocks, {
      toolCallId: 'tool-123',
      resultValue: { skipped: true },
    })
    expect(result[0].type).toBe('ask-user')
    expect((result[0] as any).skipped).toBe(true)
  })

  test('keeps tool block when no result data', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'ask_user',
        input: { questions: [] },
      },
    ]
    const result = transformAskUserBlocks(blocks, {
      toolCallId: 'tool-123',
      resultValue: {},
    })
    expect(result[0].type).toBe('tool')
  })

  test('does not transform non-matching tool', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'ask_user',
        input: { questions: [] },
      },
    ]
    const result = transformAskUserBlocks(blocks, {
      toolCallId: 'different-id',
      resultValue: { answers: ['A'] },
    })
    expect(result[0].type).toBe('tool')
  })

  test('transforms nested ask_user in agent blocks', () => {
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
            toolCallId: 'tool-123',
            toolName: 'ask_user',
            input: { questions: [{ question: 'Q?' }] },
          },
        ],
        initialPrompt: '',
      },
    ]
    const result = transformAskUserBlocks(blocks, {
      toolCallId: 'tool-123',
      resultValue: { answers: ['Yes'] },
    })
    expect((result[0] as any).blocks[0].type).toBe('ask-user')
  })

  test('returns same reference when nothing changes', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'Hello' }]
    const result = transformAskUserBlocks(blocks, {
      toolCallId: 'tool-123',
      resultValue: { answers: ['A'] },
    })
    expect(result[0]).toBe(blocks[0])
  })
})

describe('updateToolBlockWithOutput', () => {
  test('updates tool block with formatted output', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'read_files',
        input: { paths: ['file.ts'] },
      },
    ]
    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'tool-123',
      toolOutput: [{ type: 'text', value: 'file contents' }],
    })
    expect((result[0] as any).output).toBeDefined()
  })

  test('formats terminal command output specially', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'run_terminal_command',
        input: { command: 'echo hi' },
      },
    ]
    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'tool-123',
      toolOutput: [{ value: { stdout: 'hi\n', stderr: '' } }],
    })
    expect((result[0] as any).output).toBe('hi\n')
  })

  test('combines stdout and stderr for terminal commands', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'run_terminal_command',
        input: { command: 'cmd' },
      },
    ]
    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'tool-123',
      toolOutput: [{ value: { stdout: 'out', stderr: 'err' } }],
    })
    expect((result[0] as any).output).toBe('outerr')
  })

  test('does not update non-matching tool block', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'read_files',
        input: {},
      },
    ]
    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'different-id',
      toolOutput: [{ value: 'output' }],
    })
    expect((result[0] as any).output).toBeUndefined()
  })

  test('updates nested tool blocks in agent', () => {
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
            toolCallId: 'tool-123',
            toolName: 'read_files',
            input: {},
          },
        ],
        initialPrompt: '',
      },
    ]
    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'tool-123',
      toolOutput: [{ type: 'text', value: 'contents' }],
    })
    expect((result[0] as any).blocks[0].output).toBeDefined()
  })

  test('returns same reference for unchanged nested blocks', () => {
    const nestedBlocks: ContentBlock[] = [{ type: 'text', content: 'Hello' }]
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'agent-1',
        agentName: 'Test',
        agentType: 'test',
        content: '',
        status: 'running',
        blocks: nestedBlocks,
        initialPrompt: '',
      },
    ]
    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'non-existent',
      toolOutput: [],
    })
    expect(result[0]).toBe(blocks[0])
  })
})
