import { describe, expect, test } from 'bun:test'

import {
  createToolCallBufferState,
  processToolCallBuffer,
  stripToolCallPayloads,
} from '../tool-xml-buffer'

const collect = (chunks: string[]): ((value: string) => void) =>
  (value: string) => {
    if (value) {
      chunks.push(value)
    }
  }

describe('processToolCallBuffer', () => {
  test('emits text before tool call and skips payload', () => {
    const state = createToolCallBufferState()
    const out: string[] = []
    processToolCallBuffer(state, 'Hello <codebuff_tool_call>{"a":1}</codebuff_tool_call> world', collect(out))
    expect(out.join('')).toBe('Hello  world')
  })

  test('handles tool call split across chunks', () => {
    const state = createToolCallBufferState()
    const out: string[] = []

    processToolCallBuffer(state, 'Hello <codebuff_tool_call>{"a"', collect(out))
    expect(out.join('')).toBe('Hello ')
    processToolCallBuffer(state, ':1}</codebuff_tool_call> world', collect(out))
    expect(out.join('')).toBe('Hello  world')
  })

  test('limits buffer growth while waiting for close tag', () => {
    const state = createToolCallBufferState()
    const out: string[] = []

    processToolCallBuffer(
      state,
      '<codebuff_tool_call>' + 'x'.repeat(200),
      collect(out),
    )
    expect(out).toHaveLength(0)
    expect(state.buffer.length).toBeLessThan(120)

    processToolCallBuffer(state, '</codebuff_tool_call>tail', collect(out))
    expect(out.join('')).toBe('tail')
  })

  test('handles multiline tool call split across many chunks (CLI log regression)', () => {
    const state = createToolCallBufferState()
    const out: string[] = []
    const chunks = [
      "I'll help you commit the SDK and CLI changes.\n\n<codebuff_tool_call",
      '>',
      '\n{\n  ',
      '"cb_tool_name": "run_terminal_command",\n',
      '"command": "git log --oneline -5",\n',
      '"cb_easp": true\n}\n</codebuff_tool_call>\n\nNext steps.',
    ]

    for (const chunk of chunks) {
      processToolCallBuffer(state, chunk, collect(out))
    }

    expect(out.join('')).toBe(
      "I'll help you commit the SDK and CLI changes.\n\n\n\nNext steps.",
    )
  })

  test('stripToolCallPayloads removes tool call payloads inline', () => {
    expect(
      stripToolCallPayloads(
        'Hello<codebuff_tool_call>{"a":1}</codebuff_tool_call>World',
      ),
    ).toBe('HelloWorld')
  })
})
