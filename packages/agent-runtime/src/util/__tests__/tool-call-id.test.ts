import { assistantMessage } from '@codebuff/common/util/messages'
import { describe, expect, it } from 'bun:test'

import {
  countToolCallsByName,
  createToolCallIdGenerator,
  formatToolCallId,
} from '../tool-call-id'

describe('tool call ids', () => {
  it('formats ids with the tool name and per-tool invocation index', () => {
    expect(formatToolCallId('glob', 0)).toBe('functions.glob:0')
  })

  it('seeds per-tool counters from existing message history', () => {
    const messages = [
      assistantMessage({
        type: 'tool-call',
        toolName: 'glob',
        toolCallId: 'functions.glob:0',
        input: { pattern: '**/*.ts' },
      }),
      assistantMessage({
        type: 'tool-call',
        toolName: 'read_files',
        toolCallId: 'functions.read_files:0',
        input: { paths: ['src/index.ts'] },
      }),
      assistantMessage({
        type: 'tool-call',
        toolName: 'glob',
        toolCallId: 'functions.glob:1',
        input: { pattern: '**/*.tsx' },
      }),
    ]

    expect(countToolCallsByName(messages)).toEqual(
      new Map([
        ['glob', 2],
        ['read_files', 1],
      ]),
    )

    const getToolCallId = createToolCallIdGenerator(messages)

    expect(getToolCallId('glob')).toBe('functions.glob:2')
    expect(getToolCallId('glob')).toBe('functions.glob:3')
    expect(getToolCallId('read_files')).toBe('functions.read_files:1')
  })

  it('can seed counters from pending tool calls', () => {
    const getToolCallId = createToolCallIdGenerator([], [
      {
        toolName: 'glob',
      },
      {
        toolName: 'glob',
      },
    ])

    expect(getToolCallId('glob')).toBe('functions.glob:2')
  })
})
