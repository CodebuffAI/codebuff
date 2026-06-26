import { describe, test, expect } from 'bun:test'

import { serializeConversation } from '../copy-conversation'

import type { ChatMessage, ContentBlock } from '../../types/chat'

const msg = (
  variant: ChatMessage['variant'],
  opts: { content?: string; blocks?: ContentBlock[] } = {},
): ChatMessage => ({
  id: `${variant}-${opts.content ?? 'x'}`,
  variant,
  content: opts.content ?? '',
  blocks: opts.blocks,
  timestamp: '2026-06-25T00:00:00.000Z',
})

const toolBlock = (
  toolName: string,
  input: unknown,
  output: string,
): ContentBlock => ({
  type: 'tool',
  toolCallId: `call-${toolName}`,
  toolName: toolName as ContentBlock extends { toolName: infer T } ? T : never,
  input,
  output,
})

describe('serializeConversation', () => {
  test('includes user text, assistant text, and tool input + output', () => {
    const messages: ChatMessage[] = [
      msg('user', { content: 'Read the config file' }),
      msg('ai', {
        blocks: [
          { type: 'text', content: 'Sure, reading it now.' },
          toolBlock('read_files', { paths: ['config.ts'] }, 'export const x = 1'),
        ],
      }),
    ]

    const { text, omittedCount } = serializeConversation(messages)

    expect(omittedCount).toBe(0)
    expect(text).toContain('## User')
    expect(text).toContain('Read the config file')
    expect(text).toContain('## Assistant')
    expect(text).toContain('Sure, reading it now.')
    // Tool call: display name, input, and output all present.
    expect(text).toContain('Read Files')
    expect(text).toContain('"config.ts"')
    expect(text).toContain('export const x = 1')
  })

  test('pretty-prints JSON tool output envelopes', () => {
    const envelope =
      '[{"type":"json","value":{"stdout":"hi\\n","exitCode":0}}]'
    const messages: ChatMessage[] = [
      msg('ai', { blocks: [toolBlock('run_terminal_command', { command: 'echo hi' }, envelope)] }),
    ]
    const { text } = serializeConversation(messages)
    // Pretty-printed across multiple lines, not a single dense JSON string.
    expect(text).toContain('"stdout": "hi\\n"')
    expect(text).toContain('"exitCode": 0')
    expect(text).not.toContain(envelope)
  })

  test('leaves non-JSON tool output as raw text', () => {
    const messages: ChatMessage[] = [
      msg('ai', { blocks: [toolBlock('read_files', { p: 'a' }, 'plain text output')] }),
    ]
    const { text } = serializeConversation(messages)
    expect(text).toContain('plain text output')
  })

  test('reasoning blocks render as blockquotes', () => {
    const messages: ChatMessage[] = [
      msg('ai', {
        blocks: [
          { type: 'text', textType: 'reasoning', content: 'Thinking hard' },
          { type: 'text', content: 'Answer' },
        ],
      }),
    ]
    const { text } = serializeConversation(messages)
    expect(text).toContain('> _Reasoning_')
    expect(text).toContain('> Thinking hard')
    expect(text).toContain('Answer')
  })

  test('does not shrink when under budget', () => {
    const messages: ChatMessage[] = [
      msg('ai', {
        blocks: [toolBlock('read_files', { p: 'a' }, 'short output')],
      }),
    ]
    const { omittedCount } = serializeConversation(messages, { maxBytes: 10_000 })
    expect(omittedCount).toBe(0)
  })

  test('drops largest tool results first to fit the byte budget', () => {
    const big = 'B'.repeat(5_000)
    const medium = 'M'.repeat(2_000)
    const small = 'S'.repeat(200)
    const messages: ChatMessage[] = [
      msg('ai', {
        blocks: [
          toolBlock('read_files', { f: 'big' }, big),
          toolBlock('read_files', { f: 'medium' }, medium),
          toolBlock('read_files', { f: 'small' }, small),
        ],
      }),
    ]

    const maxBytes = 3_000
    const { text, omittedCount } = serializeConversation(messages, { maxBytes })

    // Result fits the budget.
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(maxBytes)
    expect(omittedCount).toBeGreaterThan(0)
    // Largest result is omitted with a note; smallest survives intact.
    expect(text).not.toContain(big)
    expect(text).toContain('Result omitted')
    expect(text).toContain(small)
  })

  test('drops tool inputs only after all outputs are dropped', () => {
    const bigInput = { blob: 'I'.repeat(6_000) }
    const messages: ChatMessage[] = [
      msg('ai', {
        blocks: [toolBlock('write_file', bigInput, 'ok')],
      }),
    ]
    // Budget small enough that dropping the (tiny) output isn't sufficient,
    // forcing the large input to be dropped too.
    const { text } = serializeConversation(messages, { maxBytes: 1_000 })
    expect(text).toContain('Input omitted')
    expect(text).not.toContain('I'.repeat(6_000))
  })

  test('serializes sub-agents recursively, including nested tool calls', () => {
    const messages: ChatMessage[] = [
      msg('ai', {
        blocks: [
          {
            type: 'agent',
            agentId: 'a1',
            agentName: 'Researcher',
            agentType: 'deep-thinker',
            content: 'I investigated the issue.',
            status: 'complete',
            initialPrompt: 'Find the root cause',
            blocks: [
              { type: 'text', content: 'Looking into it.' },
              toolBlock('code_search', { query: 'bug' }, 'match in foo.ts'),
            ],
          },
        ],
      }),
    ]

    const { text } = serializeConversation(messages)
    expect(text).toContain('Subagent: Researcher')
    expect(text).toContain('Find the root cause')
    expect(text).toContain('I investigated the issue.')
    // Nested block + nested tool call surface in the output.
    expect(text).toContain('Looking into it.')
    expect(text).toContain('Code Search')
    expect(text).toContain('match in foo.ts')
  })

  test('hard-truncates an oversized non-droppable text block as a last resort', () => {
    // A single huge user text block — no tool bodies to drop.
    const huge = 'word '.repeat(10_000)
    const messages: ChatMessage[] = [msg('user', { content: huge })]

    const maxBytes = 2_000
    const { text, truncated, omittedCount } = serializeConversation(messages, {
      maxBytes,
    })

    expect(truncated).toBe(true)
    expect(omittedCount).toBe(0)
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(maxBytes)
    expect(text).toContain('truncated to fit clipboard')
    // The most recent tail of the content is what survives.
    expect(text.endsWith('word \n') || text.trimEnd().endsWith('word')).toBe(true)
  })

  test('tool call with no input or output renders a compact one-liner', () => {
    const messages: ChatMessage[] = [
      msg('ai', {
        blocks: [
          {
            type: 'tool',
            toolCallId: 'c1',
            toolName: 'end_turn' as never,
            input: null,
            output: undefined,
          },
        ],
      }),
    ]
    const { text } = serializeConversation(messages)
    expect(text).toContain('(no input or output)')
  })

  test('notes attachments on user messages', () => {
    const messages: ChatMessage[] = [
      {
        ...msg('user', { content: 'Look at these' }),
        fileAttachments: [
          { path: '/a/b.ts', filename: 'b.ts', isDirectory: false },
        ],
      },
    ]
    const { text } = serializeConversation(messages)
    expect(text).toContain('Attached files: b.ts')
  })

  test('empty conversation still produces a header', () => {
    const { text, omittedCount } = serializeConversation([])
    expect(text).toMatch(/# (Freebuff|Codebuff) conversation/)
    expect(omittedCount).toBe(0)
  })
})
