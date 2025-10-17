import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

import {
  trimMessagesToFitTokenLimit,
  messagesWithSystem,
  getPreviouslyReadFiles,
} from '@codebuff/agent-runtime/util/messages'

import * as tokenCounter from '../token-counter'

import type { CodebuffToolMessage } from '@codebuff/common/tools/list'
import type {
  Message,
  UserMessage,
} from '@codebuff/common/types/messages/codebuff-message'

describe('messagesWithSystem', () => {
  it('prepends system message to array', () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ] as Message[]
    const system = 'Be helpful'

    const result = messagesWithSystem({ messages, system })

    expect(result).toEqual([
      { role: 'system', content: 'Be helpful' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ])
  })
})

// Mock logger for tests
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

describe('trimMessagesToFitTokenLimit', () => {
  beforeEach(() => {
    // Mock countTokensJson to just count characters
    spyOn(tokenCounter, 'countTokensJson').mockImplementation((text) => {
      // Make token count high enough to trigger simplification
      return JSON.stringify(text).length
    })
  })

  afterEach(() => {
    mock.restore()
  })

  const testMessages: Message[] = [
    // Regular message without tool calls - should never be shortened, but won't fit in the final array
    {
      role: 'assistant',
      content:
        'This is a long assistant message that would normally be shortened but since it has no tool calls it should be preserved completely intact no matter what',
    },
    // Regular message without tool calls - should never be shortened
    {
      role: 'user',
      content:
        'This is a long message that would normally be shortened but since it has no tool calls it should be preserved completely intact no matter what',
    },
    {
      // Terminal output 0 (oldest) - should be simplified
      role: 'tool',
      content: {
        type: 'tool-result',
        toolName: 'run_terminal_command',
        toolCallId: 'test-id-0',
        output: [
          {
            type: 'json',
            value: `Terminal output 0${'.'.repeat(2000)}`,
          },
        ],
      },
    },
    {
      // Terminal output 1 - should be preserved (shorter than '[Output omitted]')
      role: 'tool',
      content: {
        type: 'tool-result',
        toolName: 'run_terminal_command',
        toolCallId: 'test-id-1',
        output: [
          {
            type: 'json',
            value: `Short output 1`,
          },
        ],
      },
    },
    {
      // Terminal output 2 - should be simplified
      role: 'tool',
      content: {
        type: 'tool-result',
        toolName: 'run_terminal_command',
        toolCallId: 'test-id-2',
        output: [
          {
            type: 'json',
            value: `Terminal output 2${'.'.repeat(2000)}`,
          },
        ],
      },
    },
    {
      // Terminal output 3 - should be preserved (5th most recent)
      role: 'tool',
      content: {
        type: 'tool-result',
        toolName: 'run_terminal_command',
        toolCallId: 'test-id-3',
        output: [
          {
            type: 'json',
            value: `Terminal output 3`,
          },
        ],
      },
    },
    {
      role: 'tool',
      content: {
        type: 'tool-result',
        toolName: 'run_terminal_command',
        toolCallId: 'test-id-4',
        output: [
          {
            type: 'json',
            value: `Terminal output 4`,
          },
        ],
      },
    },
    {
      role: 'user',
      content: [
        // Regular message - should never be shortened
        {
          type: 'image',
          image: 'xyz',
          mediaType: 'image/jpeg',
        },
      ],
    } satisfies UserMessage,
    {
      // Terminal output 5 - should be preserved (3rd most recent)
      role: 'tool',
      content: {
        type: 'tool-result',
        toolName: 'run_terminal_command',
        toolCallId: 'test-id-5',
        output: [
          {
            type: 'json',
            value: `Terminal output 5`,
          },
        ],
      },
    },
    {
      // Terminal output 6 - should be preserved (2nd most recent)
      role: 'tool',
      content: {
        type: 'tool-result',
        toolName: 'run_terminal_command',
        toolCallId: 'test-id-6',
        output: [
          {
            type: 'json',
            value: `Terminal output 6`,
          },
        ],
      },
    },
    {
      // Terminal output 7 - should be preserved (most recent)
      role: 'tool',
      content: {
        type: 'tool-result',
        toolName: 'run_terminal_command',
        toolCallId: 'test-id-7',
        output: [
          {
            type: 'json',
            value: `Terminal output 7`,
          },
        ],
      },
    },
    // Regular message - should never be shortened
    {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Another long message that should never be shortened because it has no tool calls in it at all',
        },
      ],
    },
  ]

  it('handles all features working together correctly', () => {
    const maxTotalTokens = 3000
    const systemTokens = 0
    const result = trimMessagesToFitTokenLimit({
      messages: testMessages,
      systemTokens,
      maxTotalTokens,
      logger,
    })

    // Should have replacement message for omitted content
    expect(result.length).toBeGreaterThan(0)

    // Should contain a replacement message for omitted content
    const hasReplacementMessage = result.some(
      (msg) =>
        typeof msg.content === 'string' &&
        msg.content.includes('Previous message(s) omitted due to length'),
    )
    expect(hasReplacementMessage).toBe(true)

    // Verify total tokens are under limit
    const finalTokens = tokenCounter.countTokensJson(result)
    expect(finalTokens).toBeLessThan((maxTotalTokens - systemTokens) * 0.5)
  })

  it('subtracts system tokens from total tokens', () => {
    const maxTotalTokens = 10_000
    const systemTokens = 7_000
    const result = trimMessagesToFitTokenLimit({
      messages: testMessages,
      systemTokens,
      maxTotalTokens,
      logger,
    })

    // Should have replacement message for omitted content
    expect(result.length).toBeGreaterThan(0)

    // Should contain a replacement message for omitted content
    const hasReplacementMessage = result.some(
      (msg) =>
        typeof msg.content === 'string' &&
        msg.content.includes('Previous message(s) omitted due to length'),
    )
    expect(hasReplacementMessage).toBe(true)

    // Verify total tokens are under limit
    const finalTokens = tokenCounter.countTokensJson(result)
    expect(finalTokens).toBeLessThan((maxTotalTokens - systemTokens) * 0.5)
  })

  it('does not simplify if under token limit', () => {
    const maxTotalTokens = 10_000
    const systemTokens = 100
    const result = trimMessagesToFitTokenLimit({
      messages: testMessages,
      systemTokens,
      maxTotalTokens,
      logger,
    })

    // All messages should be unchanged
    expect(result).toHaveLength(testMessages.length)
    for (let i = 0; i < testMessages.length; i++) {
      expect(result[i].role).toEqual(testMessages[i].role)
      expect(result[i].content).toEqual(testMessages[i].content)
    }

    // Verify total tokens are under limit
    const finalTokens = tokenCounter.countTokensJson(result)
    expect(finalTokens).toBeLessThan(maxTotalTokens - systemTokens)
  })

  it('handles empty messages array', () => {
    const maxTotalTokens = 200
    const systemTokens = 100
    const result = trimMessagesToFitTokenLimit({
      messages: [],
      systemTokens,
      maxTotalTokens,
      logger,
    })

    expect(result).toEqual([])
  })

  describe('keepDuringTruncation functionality', () => {
    it('preserves messages marked with keepDuringTruncation=true', () => {
      const messages: Message[] = [
        { role: 'user', content: 'A'.repeat(500) }, // Large message to force truncation
        { role: 'user', content: 'B'.repeat(500) }, // Large message to force truncation
        {
          role: 'user',
          content: 'Message 3 - keep me!',
          keepDuringTruncation: true,
        },
        { role: 'assistant', content: 'C'.repeat(500) }, // Large message to force truncation
        {
          role: 'user',
          content: 'Message 5 - keep me too!',
          keepDuringTruncation: true,
        },
      ]

      const result = trimMessagesToFitTokenLimit({
        messages,
        systemTokens: 0,
        maxTotalTokens: 1000,
        logger,
      })

      // Should contain the kept messages
      const keptMessages = result.filter(
        (msg) =>
          typeof msg.content === 'string' &&
          (msg.content.includes('keep me!') ||
            msg.content.includes('keep me too!')),
      )
      expect(keptMessages).toHaveLength(2)

      // Should have replacement message for omitted content
      const hasReplacementMessage = result.some(
        (msg) =>
          typeof msg.content === 'string' &&
          msg.content.includes('Previous message(s) omitted due to length'),
      )
      expect(hasReplacementMessage).toBe(true)
    })

    it('does not add replacement message when no messages are removed', () => {
      const messages = [
        { role: 'user', content: 'Short message 1' },
        {
          role: 'user',
          content: 'Short message 2',
          keepDuringTruncation: true,
        },
      ] as Message[]

      const result = trimMessagesToFitTokenLimit({
        messages,
        systemTokens: 0,
        maxTotalTokens: 10000,
        logger,
      })

      // Should be unchanged when under token limit
      expect(result).toHaveLength(2)
      expect(result[0].content).toBe('Short message 1')
      expect(result[1].content).toBe('Short message 2')
    })

    it('handles consecutive replacement messages correctly', () => {
      const messages: Message[] = [
        { role: 'user', content: 'A'.repeat(1000) }, // Large message to be removed
        { role: 'user', content: 'B'.repeat(1000) }, // Large message to be removed
        { role: 'user', content: 'C'.repeat(1000) }, // Large message to be removed
        { role: 'user', content: 'Keep this', keepDuringTruncation: true },
      ]

      const result = trimMessagesToFitTokenLimit({
        messages,
        systemTokens: 0,
        maxTotalTokens: 1000,
        logger,
      })

      // Should only have one replacement message for consecutive removals
      const replacementMessages = result.filter(
        (msg) =>
          typeof msg.content === 'string' &&
          msg.content.includes('Previous message(s) omitted due to length'),
      )
      expect(replacementMessages).toHaveLength(1)

      // Should keep the marked message
      const keptMessage = result.find(
        (msg) =>
          typeof msg.content === 'string' && msg.content.includes('Keep this'),
      )
      expect(keptMessage).toBeDefined()
    })

    it('calculates token removal correctly with keepDuringTruncation', () => {
      const messages: Message[] = [
        { role: 'user', content: 'A'.repeat(500) }, // Will be removed
        { role: 'user', content: 'B'.repeat(500) }, // Will be removed
        {
          role: 'user',
          content: 'Keep this short message',
          keepDuringTruncation: true,
        },
        { role: 'user', content: 'C'.repeat(100) }, // Might be kept
      ]

      const result = trimMessagesToFitTokenLimit({
        messages,
        systemTokens: 0,
        maxTotalTokens: 2000,
        logger,
      })

      // Should preserve the keepDuringTruncation message
      const keptMessage = result.find(
        (msg) =>
          typeof msg.content === 'string' &&
          msg.content.includes('Keep this short message'),
      )
      expect(keptMessage).toBeDefined()

      // Total tokens should be under limit
      const finalTokens = tokenCounter.countTokensJson(result)
      expect(finalTokens).toBeLessThan(2000)
    })

    it('handles mixed keepDuringTruncation and regular messages', () => {
      const messages: Message[] = [
        { role: 'user', content: 'A'.repeat(800) }, // Large message to force truncation
        { role: 'user', content: 'Keep 1', keepDuringTruncation: true },
        { role: 'user', content: 'B'.repeat(800) }, // Large message to force truncation
        { role: 'user', content: 'Keep 2', keepDuringTruncation: true },
        { role: 'user', content: 'C'.repeat(800) }, // Large message to force truncation
      ]

      const result = trimMessagesToFitTokenLimit({
        messages,
        systemTokens: 0,
        maxTotalTokens: 500,
        logger,
      })

      // Should keep both marked messages
      const keptMessages = result.filter(
        (msg) =>
          typeof msg.content === 'string' &&
          (msg.content.includes('Keep 1') || msg.content.includes('Keep 2')),
      )
      expect(keptMessages).toHaveLength(2)

      // Should have replacement messages for removed content
      const replacementMessages = result.filter(
        (msg) =>
          typeof msg.content === 'string' &&
          msg.content.includes('Previous message(s) omitted due to length'),
      )
      expect(replacementMessages.length).toBeGreaterThan(0)
    })
  })
})

describe('getPreviouslyReadFiles', () => {
  it('returns empty array when no messages provided', () => {
    const result = getPreviouslyReadFiles({ messages: [], logger })
    expect(result).toEqual([])
  })

  it('returns empty array when no tool messages with relevant tool names', () => {
    const messages: Message[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      {
        role: 'tool',
        content: {
          type: 'tool-result',
          toolName: 'write_file',
          toolCallId: 'test-id',
          output: [
            { type: 'json', value: { file: 'test.ts', errorMessage: 'error' } },
          ],
        },
      } satisfies CodebuffToolMessage<'write_file'>,
    ]

    const result = getPreviouslyReadFiles({ messages, logger })
    expect(result).toEqual([])
  })

  it('extracts files from read_files tool messages', () => {
    const messages: Message[] = [
      {
        role: 'tool',
        content: {
          type: 'tool-result',
          toolName: 'read_files',
          toolCallId: 'test-id',
          output: [
            {
              type: 'json',
              value: [
                {
                  path: 'src/test.ts',
                  content: 'export function test() {}',
                  referencedBy: { 'main.ts': ['line 10'] },
                },
                {
                  path: 'src/utils.ts',
                  content: 'export const utils = {}',
                },
              ],
            },
          ],
        },
      } satisfies CodebuffToolMessage<'read_files'>,
    ]

    const result = getPreviouslyReadFiles({ messages, logger })
    expect(result).toEqual([
      {
        path: 'src/test.ts',
        content: 'export function test() {}',
        referencedBy: { 'main.ts': ['line 10'] },
      },
      {
        path: 'src/utils.ts',
        content: 'export const utils = {}',
      },
    ])
  })

  it('extracts files from find_files tool messages', () => {
    const messages: Message[] = [
      {
        role: 'tool',
        content: {
          type: 'tool-result',
          toolName: 'find_files',
          toolCallId: 'test-id',
          output: [
            {
              type: 'json',
              value: [
                {
                  path: 'components/Button.tsx',
                  content: 'export const Button = () => {}',
                },
              ],
            },
          ],
        },
      } satisfies CodebuffToolMessage<'find_files'>,
    ]

    const result = getPreviouslyReadFiles({ messages, logger })
    expect(result).toEqual([
      {
        path: 'components/Button.tsx',
        content: 'export const Button = () => {}',
      },
    ])
  })

  it('combines files from multiple tool messages', () => {
    const messages: Message[] = [
      {
        role: 'tool',
        content: {
          type: 'tool-result',
          toolName: 'read_files',
          toolCallId: 'test-id-1',
          output: [
            {
              type: 'json',
              value: [
                {
                  path: 'file1.ts',
                  content: 'content 1',
                },
              ],
            },
          ],
        },
      } satisfies CodebuffToolMessage<'read_files'>,
      {
        role: 'tool',
        content: {
          type: 'tool-result',
          toolName: 'find_files',
          toolCallId: 'test-id-2',
          output: [
            {
              type: 'json',
              value: [
                {
                  path: 'file2.ts',
                  content: 'content 2',
                },
              ],
            },
          ],
        },
      } satisfies CodebuffToolMessage<'find_files'>,
      {
        role: 'user',
        content: 'Some user message',
      },
    ]

    const result = getPreviouslyReadFiles({ messages, logger })
    expect(result).toEqual([
      { path: 'file1.ts', content: 'content 1' },
      { path: 'file2.ts', content: 'content 2' },
    ])
  })

  it('handles contentOmittedForLength files by filtering them out', () => {
    const messages: Message[] = [
      {
        role: 'tool',
        content: {
          type: 'tool-result',
          toolName: 'read_files',
          toolCallId: 'test-id',
          output: [
            {
              type: 'json',
              value: [
                {
                  path: 'small-file.ts',
                  content: 'small content',
                },
                {
                  path: 'large-file.ts',
                  contentOmittedForLength: true,
                },
                {
                  path: 'another-small-file.ts',
                  content: 'another small content',
                },
              ],
            },
          ],
        },
      } satisfies CodebuffToolMessage<'read_files'>,
    ]

    const result = getPreviouslyReadFiles({ messages, logger })
    expect(result).toEqual([
      { path: 'small-file.ts', content: 'small content' },
      { path: 'another-small-file.ts', content: 'another small content' },
    ])
  })

  it('handles malformed tool message output gracefully', () => {
    const mockLoggerError = spyOn(logger, 'error').mockImplementation(() => {})

    const messages: Message[] = [
      {
        role: 'tool',
        content: {
          type: 'tool-result',
          toolName: 'read_files',
          toolCallId: 'test-id',
          output: null, // Invalid output
        } as any,
      },
    ]

    const result = getPreviouslyReadFiles({ messages, logger })
    expect(result).toEqual([])
    expect(mockLoggerError).toHaveBeenCalled()

    mockLoggerError.mockRestore()
  })

  it('handles find_files tool messages with error message instead of files', () => {
    const messages: Message[] = [
      {
        role: 'tool',
        content: {
          type: 'tool-result',
          toolName: 'find_files',
          toolCallId: 'test-id',
          output: [
            {
              type: 'json',
              value: {
                message: 'No files found matching the criteria',
              },
            },
          ],
        },
      } satisfies CodebuffToolMessage<'find_files'>,
    ]

    const result = getPreviouslyReadFiles({ messages, logger })
    expect(result).toEqual([])
  })

  it('ignores non-tool messages', () => {
    const messages: Message[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
      { role: 'system', content: 'system message' },
      {
        role: 'tool',
        content: {
          type: 'tool-result',
          toolName: 'read_files',
          toolCallId: 'test-id',
          output: [
            {
              type: 'json',
              value: [
                {
                  path: 'test.ts',
                  content: 'test content',
                },
              ],
            },
          ],
        },
      } satisfies CodebuffToolMessage<'read_files'>,
    ]

    const result = getPreviouslyReadFiles({ messages, logger })
    expect(result).toEqual([{ path: 'test.ts', content: 'test content' }])
  })

  it('handles empty file arrays in tool output', () => {
    const messages: Message[] = [
      {
        role: 'tool',
        content: {
          type: 'tool-result',
          toolName: 'read_files',
          toolCallId: 'test-id',
          output: [
            {
              type: 'json',
              value: [], // Empty array
            },
          ],
        },
      } satisfies CodebuffToolMessage<'read_files'>,
    ]

    const result = getPreviouslyReadFiles({ messages, logger })
    expect(result).toEqual([])
  })
})
