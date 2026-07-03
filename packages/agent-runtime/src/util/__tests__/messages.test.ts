import {
  assistantMessage,
  jsonToolResult,
  systemMessage,
  userMessage,
} from '@codebuff/common/util/messages'
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
  COMPACTED_CONTEXT_POINTER,
  messagesWithSystem,
  expireMessages,
  getPreviouslyReadFiles,
  filterUnfinishedToolCalls,
  buildUserMessageContent,
  getContextCategoryTelemetry,
} from '../../util/messages'
import * as tokenCounter from '../token-counter'

import type { CodebuffToolMessage } from '@codebuff/common/tools/list'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type {
  TextPart,
  ToolCallPart,
} from '@codebuff/common/types/messages/content-part'

/**
 * Type guard to check if a content part is a text part.
 */
function isTextPart(part: unknown): part is TextPart {
  return (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    part.type === 'text' &&
    'text' in part
  )
}

/**
 * Type guard to check if a content part is a tool-call part.
 */
function isToolCallPart(part: unknown): part is ToolCallPart {
  return (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    part.type === 'tool-call' &&
    'toolCallId' in part
  )
}

describe('messagesWithSystem', () => {
  it('prepends system message to array', () => {
    const messages = [userMessage('hello'), assistantMessage('hi')] as Message[]
    const system = 'Be helpful'

    const result = messagesWithSystem({ messages, system })

    // Use the original message objects to avoid flaky sentAt timestamp comparisons
    expect(result).toEqual([systemMessage('Be helpful'), ...messages])
  })
})

describe('expireMessages', () => {
  it('keeps only the latest message for keepLastTags', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'old instructions' }],
        tags: ['INSTRUCTIONS_PROMPT'],
        keepLastTags: ['INSTRUCTIONS_PROMPT'],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'actual prompt' }],
        tags: ['USER_PROMPT'],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'new instructions' }],
        tags: ['INSTRUCTIONS_PROMPT'],
        keepLastTags: ['INSTRUCTIONS_PROMPT'],
      },
    ]

    const result = expireMessages(messages, 'userPrompt')

    expect(result.map((message) => getTextContentForTest(message))).toEqual([
      'actual prompt',
      'new instructions',
    ])
  })

  it('applies timeToLive before keepLastTags', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'old instructions' }],
        tags: ['INSTRUCTIONS_PROMPT'],
        keepLastTags: ['INSTRUCTIONS_PROMPT'],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'expired instructions' }],
        tags: ['INSTRUCTIONS_PROMPT'],
        keepLastTags: ['INSTRUCTIONS_PROMPT'],
        timeToLive: 'userPrompt',
      },
    ]

    const result = expireMessages(messages, 'userPrompt')

    expect(result.map((message) => getTextContentForTest(message))).toEqual([
      'old instructions',
    ])
  })
})

function getTextContentForTest(message: Message): string {
  if (!Array.isArray(message.content)) {
    return String(message.content)
  }
  return message.content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
}

describe('buildUserMessageContent', () => {
  it('wraps prompt in user_message tags when no content provided', () => {
    const result = buildUserMessageContent('Hello world', undefined, undefined)

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('text')
    const firstPart = result[0]
    if (!isTextPart(firstPart)) throw new Error('Expected text part')
    expect(firstPart.text).toContain('<user_message>')
    expect(firstPart.text).toContain('Hello world')
  })

  it('wraps text content in user_message tags', () => {
    const result = buildUserMessageContent(undefined, undefined, [
      { type: 'text', text: 'Hello from content' },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('text')
    const firstPart = result[0]
    if (!isTextPart(firstPart)) throw new Error('Expected text part')
    expect(firstPart.text).toContain('<user_message>')
    expect(firstPart.text).toContain('Hello from content')
  })

  it('uses prompt when content has empty text part', () => {
    const result = buildUserMessageContent('See attached image(s)', undefined, [
      { type: 'text', text: '' },
      { type: 'image', image: 'base64data', mediaType: 'image/png' },
    ])

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('text')
    const firstPart = result[0]
    if (!isTextPart(firstPart)) throw new Error('Expected text part')
    expect(firstPart.text).toContain('See attached image(s)')
    expect(result[1].type).toBe('image')
  })

  it('uses prompt when content has whitespace-only text part', () => {
    const result = buildUserMessageContent('See attached image(s)', undefined, [
      { type: 'text', text: '   ' },
      { type: 'image', image: 'base64data', mediaType: 'image/png' },
    ])

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('text')
    const firstPart = result[0]
    if (!isTextPart(firstPart)) throw new Error('Expected text part')
    expect(firstPart.text).toContain('See attached image(s)')
    expect(result[1].type).toBe('image')
  })

  it('uses prompt when content has only images (no text part)', () => {
    const result = buildUserMessageContent('See attached image(s)', undefined, [
      { type: 'image', image: 'base64data', mediaType: 'image/png' },
    ])

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('text')
    const firstPart = result[0]
    if (!isTextPart(firstPart)) throw new Error('Expected text part')
    expect(firstPart.text).toContain('See attached image(s)')
    expect(result[1].type).toBe('image')
  })

  it('uses content text when it has meaningful content (ignores prompt)', () => {
    const result = buildUserMessageContent(
      'This prompt should be ignored',
      undefined,
      [
        { type: 'text', text: 'User provided text' },
        { type: 'image', image: 'base64data', mediaType: 'image/png' },
      ],
    )

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('text')
    const firstPart = result[0]
    if (!isTextPart(firstPart)) throw new Error('Expected text part')
    expect(firstPart.text).toContain('User provided text')
    expect(firstPart.text).not.toContain('This prompt should be ignored')
    expect(result[1].type).toBe('image')
  })

  it('ignores whitespace-only prompt when content has no text', () => {
    const result = buildUserMessageContent('   ', undefined, [
      { type: 'image', image: 'base64data', mediaType: 'image/png' },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('image')
  })
})

// Mock logger for tests
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

describe('getContextCategoryTelemetry', () => {
  it('reports context usage by major source category', () => {
    spyOn(tokenCounter, 'countTokensJson').mockImplementation((value) =>
      JSON.stringify(value).length,
    )

    const messages: Message[] = [
      userMessage('user prompt'),
      assistantMessage('assistant response'),
      {
        role: 'tool',
        toolName: 'write_todos',
        toolCallId: 'todos-1',
        content: jsonToolResult({ todos: [{ task: 'Do work' }] }),
      },
      {
        role: 'tool',
        toolName: 'read_files',
        toolCallId: 'read-1',
        content: jsonToolResult([{ path: 'src/file.ts', content: 'content' }]),
      },
      {
        role: 'tool',
        toolName: 'spawn_agents',
        toolCallId: 'spawn-1',
        content: jsonToolResult([{ agentType: 'editor', output: 'done' }]),
      },
      {
        role: 'tool',
        toolName: 'run_terminal_command',
        toolCallId: 'terminal-1',
        content: jsonToolResult({ command: 'bun test', exitCode: 0 }),
      },
    ]

    const telemetry = getContextCategoryTelemetry(messages)

    expect(telemetry.userAssistantMessages.messages).toBe(2)
    expect(telemetry.todos.messages).toBe(1)
    expect(telemetry.fileReads.messages).toBe(1)
    expect(telemetry.subagents.messages).toBe(1)
    expect(telemetry.toolResults.messages).toBe(1)
    expect(
      Object.values(telemetry).reduce((sum, entry) => sum + entry.messages, 0),
    ).toBe(messages.length)
  })
})

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
    assistantMessage(
      'This is a long assistant message that would normally be shortened but since it has no tool calls it should be preserved completely intact no matter what',
    ),
    // Regular message without tool calls - should never be shortened
    userMessage(
      'This is a long message that would normally be shortened but since it has no tool calls it should be preserved completely intact no matter what',
    ),
    {
      // Terminal output 0 (oldest) - should be simplified

      role: 'tool',
      toolName: 'run_terminal_command',
      toolCallId: 'test-id-0',
      content: jsonToolResult(`Terminal output 0${'.'.repeat(2000)}`),
    },
    {
      // Terminal output 1 - should be preserved (shorter than '[Output omitted]')
      role: 'tool',
      toolName: 'run_terminal_command',
      toolCallId: 'test-id-1',
      content: jsonToolResult(`Short output 1`),
    },
    {
      // Terminal output 2 - should be simplified
      role: 'tool',
      toolName: 'run_terminal_command',
      toolCallId: 'test-id-2',
      content: jsonToolResult(`Terminal output 2${'.'.repeat(2000)}`),
    },
    {
      // Terminal output 3 - should be simplified
      role: 'tool',
      toolName: 'run_terminal_command',
      toolCallId: 'test-id-3',
      content: jsonToolResult(`Terminal output 3`),
    },
    {
      role: 'tool',
      toolName: 'run_terminal_command',
      toolCallId: 'test-id-4',
      content: jsonToolResult(`Terminal output 4`),
    },
    // Regular message - should never be shortened
    userMessage({
      type: 'image',
      image: 'xyz',
      mediaType: 'image/jpeg',
    }),
    {
      // Terminal output 5 - should be simplified
      role: 'tool',
      toolName: 'run_terminal_command',
      toolCallId: 'test-id-5',
      content: jsonToolResult(`Terminal output 5`),
    },
    {
      // Terminal output 6 - should be simplified
      role: 'tool',
      toolName: 'run_terminal_command',
      toolCallId: 'test-id-6',
      content: jsonToolResult(`Terminal output 6`),
    },
    {
      // Terminal output 7 - should be preserved (most recent)
      role: 'tool',
      toolName: 'run_terminal_command',
      toolCallId: 'test-id-7',
      content: jsonToolResult(`Terminal output 7`),
    },
    // Regular message - should never be shortened
    assistantMessage(
      'Another long message that should never be shortened because it has no tool calls in it at all',
    ),
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

    // Should have replacement message for compacted context
    expect(result.length).toBeGreaterThan(0)

    const hasCompactedContextPointer = result.some(
      (msg) =>
        msg.content[0].type === 'text' &&
        msg.content[0].text.includes(COMPACTED_CONTEXT_POINTER),
    )
    expect(hasCompactedContextPointer).toBe(true)

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

    // Should have replacement message for compacted context
    expect(result.length).toBeGreaterThan(0)

    const hasCompactedContextPointer = result.some(
      (msg) =>
        msg.content[0].type === 'text' &&
        msg.content[0].text.includes(COMPACTED_CONTEXT_POINTER),
    )
    expect(hasCompactedContextPointer).toBe(true)

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

  it('summarizes the newest terminal output when it would exceed the trim target', () => {
    const messages: Message[] = [
      userMessage('Inspect the project'),
      {
        role: 'tool',
        toolName: 'run_terminal_command',
        toolCallId: 'large-terminal-result',
        content: jsonToolResult({
          command: 'bun test',
          stdout: 'pass\n'.repeat(500),
          stderr: '',
          exitCode: 0,
        }),
        keepDuringTruncation: true,
      },
      assistantMessage({
        content: 'Done',
        keepDuringTruncation: true,
      }),
    ]

    const result = trimMessagesToFitTokenLimit({
      messages,
      systemTokens: 0,
      maxTotalTokens: 1500,
      logger,
    })

    const terminalResult = result.find(
      (message): message is CodebuffToolMessage<'run_terminal_command'> =>
        message.role === 'tool' && message.toolName === 'run_terminal_command',
    )

    expect(terminalResult?.content[0].value).toMatchObject({
      command: 'bun test',
      status: 'passed',
      stdoutOmittedForLength: true,
      exitCode: 0,
    })
    expect(tokenCounter.countTokensJson(result)).toBeLessThanOrEqual(1500)
    expect(JSON.stringify(result)).not.toContain('pass\npass\n')
  })

  it('summarizes code_search results when over token limit', () => {
    const messages: Message[] = [
      userMessage('Search the codebase for authenticate'),
      {
        role: 'tool',
        toolName: 'code_search',
        toolCallId: 'code-search-large',
        content: jsonToolResult({
          stdout: 'src/auth/login.ts:42:export function authenticate\n'.repeat(
            200,
          ),
          stderr: '',
          exitCode: 0,
          message: 'Found 200 matches',
        }),
        keepDuringTruncation: true,
      },
      assistantMessage({
        content: 'Done searching',
        keepDuringTruncation: true,
      }),
    ]

    const result = trimMessagesToFitTokenLimit({
      messages,
      systemTokens: 0,
      maxTotalTokens: 3000,
      logger,
    })

    const searchResult = result.find(
      (message): message is CodebuffToolMessage<'code_search'> =>
        message.role === 'tool' && message.toolName === 'code_search',
    )

    expect(searchResult?.content[0].value).toMatchObject({
      message: 'Found 200 matches',
      status: 'passed',
      stdoutOmittedForLength: true,
      exitCode: 0,
    })
    expect(tokenCounter.countTokensJson(result)).toBeLessThanOrEqual(3000)
  })

  it('summarizes read_subtree results when over token limit', () => {
    const messages: Message[] = [
      userMessage('Explore the src directory structure'),
      {
        role: 'tool',
        toolName: 'read_subtree',
        toolCallId: 'read-subtree-large',
        content: jsonToolResult([
          {
            path: 'src',
            type: 'directory',
            printedTree: 'src/\n  auth/\n    login.ts\n    logout.ts\n'.repeat(
              200,
            ),
            tokenCount: 5000,
            truncationLevel: 'none',
          },
          {
            path: 'src/auth/login.ts',
            type: 'file',
            variables: ['authenticate', 'login', 'validateCredentials'],
          },
        ]),
        keepDuringTruncation: true,
      },
      assistantMessage({
        content: 'Done exploring',
        keepDuringTruncation: true,
      }),
    ]

    const result = trimMessagesToFitTokenLimit({
      messages,
      systemTokens: 0,
      maxTotalTokens: 1500,
      logger,
    })

    const subtreeResult = result.find(
      (message): message is CodebuffToolMessage<'read_subtree'> =>
        message.role === 'tool' && message.toolName === 'read_subtree',
    )

    expect(subtreeResult).toBeDefined()
    const subtreeEntries = subtreeResult!.content[0].value
    expect(subtreeEntries).toHaveLength(2)
    expect(subtreeEntries[0]).toMatchObject({
      path: 'src',
      type: 'directory',
      tokenCount: 5000,
      truncationLevel: 'none',
      printedTreeOmittedForLength: true,
    })
    expect(subtreeEntries[1]).toMatchObject({
      path: 'src/auth/login.ts',
      type: 'file',
      variablesOmittedForLength: true,
    })
    expect(tokenCounter.countTokensJson(result)).toBeLessThanOrEqual(1500)
    expect(JSON.stringify(result)).not.toContain('login.ts\n    logout.ts')
  })

  it('summarizes query_index results when over token limit', () => {
    const messages: Message[] = [
      userMessage('Find authentication-related files'),
      {
        role: 'tool',
        toolName: 'query_index',
        toolCallId: 'query-index-large',
        content: jsonToolResult({
          results: [
            {
              path: 'src/auth.ts',
              score: 95.5,
              matchedOn: ['symbol', 'path'],
              symbols: ['authenticate', 'login'],
              matchedSnippets: [
                'export function authenticate(user: string): boolean\n'.repeat(
                  200,
                ),
              ],
              relatedFiles: [
                { path: 'src/utils.ts', score: 10, reason: 'imports' },
              ],
            },
          ],
          totalIndexed: 1510,
          indexAge: 672771,
          message: 'Found 1 result',
        }),
        keepDuringTruncation: true,
      },
      assistantMessage({
        content: 'Done querying',
        keepDuringTruncation: true,
      }),
    ]

    const result = trimMessagesToFitTokenLimit({
      messages,
      systemTokens: 0,
      maxTotalTokens: 1500,
      logger,
    })

    const queryResult = result.find(
      (message): message is CodebuffToolMessage<'query_index'> =>
        message.role === 'tool' && message.toolName === 'query_index',
    )

    expect(queryResult).toBeDefined()
    const queryValue = queryResult!.content[0].value
    expect(queryValue.results[0]).toMatchObject({
      path: 'src/auth.ts',
      score: 95.5,
      matchedOn: ['symbol', 'path'],
      symbols: ['authenticate', 'login'],
      matchedSnippetsOmittedForLength: true,
      relatedFilesOmittedForLength: true,
    })
    expect(queryValue.results[0]).not.toHaveProperty('matchedSnippets')
    expect(queryValue.results[0]).not.toHaveProperty('relatedFiles')
    expect(tokenCounter.countTokensJson(result)).toBeLessThanOrEqual(1500)
    expect(JSON.stringify(result)).not.toContain('export function authenticate')
  })

  it('summarizes web_search results when over token limit', () => {
    const messages: Message[] = [
      userMessage('Search the web for Next.js 15 features'),
      {
        role: 'tool',
        toolName: 'web_search',
        toolCallId: 'web-search-large',
        content: jsonToolResult({
          result: 'Next.js 15 introduces React Server Components improvements. '.repeat(
            200,
          ),
          links: Array.from({ length: 6 }, (_, i) => ({
            href: `https://example.com/${i + 1}`,
            text: `Link ${i + 1}`,
          })),
        }),
        keepDuringTruncation: true,
      },
      assistantMessage({
        content: 'Done searching',
        keepDuringTruncation: true,
      }),
    ]

    const result = trimMessagesToFitTokenLimit({
      messages,
      systemTokens: 0,
      maxTotalTokens: 3000,
      logger,
    })

    const webResult = result.find(
      (message): message is CodebuffToolMessage<'web_search'> =>
        message.role === 'tool' && message.toolName === 'web_search',
    )

    expect(webResult).toBeDefined()
    const webValue = webResult!.content[0].value
    expect(webValue).toMatchObject({
      resultOmittedForLength: true,
    })
    expect(webValue).not.toHaveProperty('result')
    expect(
      (webValue as { links?: Array<unknown> }).links,
    ).toHaveLength(5)
    expect(tokenCounter.countTokensJson(result)).toBeLessThanOrEqual(3000)
  })

  it('summarizes mixed summarizable tool result types in a single history', () => {
    const messages: Message[] = [
      userMessage('Research the codebase and web'),
      {
        role: 'tool',
        toolName: 'code_search',
        toolCallId: 'mixed-code-search',
        content: jsonToolResult({
          stdout: 'mixed-code-search-payload'.repeat(200),
          stderr: '',
          exitCode: 0,
          message: 'Found results',
        }),
        keepDuringTruncation: true,
      },
      {
        role: 'tool',
        toolName: 'read_subtree',
        toolCallId: 'mixed-read-subtree',
        content: jsonToolResult([
          {
            path: 'src',
            type: 'directory',
            printedTree: 'mixed-read-subtree-payload'.repeat(200),
            tokenCount: 5000,
            truncationLevel: 'none',
          },
        ]),
        keepDuringTruncation: true,
      },
      {
        role: 'tool',
        toolName: 'query_index',
        toolCallId: 'mixed-query-index',
        content: jsonToolResult({
          results: [
            {
              path: 'src/auth.ts',
              score: 95,
              matchedOn: ['symbol'],
              matchedSnippets: ['mixed-query-index-payload'.repeat(200)],
            },
          ],
          totalIndexed: 1510,
          indexAge: 672771,
          message: 'Found 1 result',
        }),
        keepDuringTruncation: true,
      },
      {
        role: 'tool',
        toolName: 'web_search',
        toolCallId: 'mixed-web-search',
        content: jsonToolResult({
          result: 'mixed-web-search-payload'.repeat(200),
        }),
        keepDuringTruncation: true,
      },
      assistantMessage({
        content: 'Done',
        keepDuringTruncation: true,
      }),
    ]

    const result = trimMessagesToFitTokenLimit({
      messages,
      systemTokens: 0,
      maxTotalTokens: 6000,
      logger,
    })

    // Each tool type should be summarized, not dropped
    const codeSearchResult = result.find(
      (m): m is CodebuffToolMessage<'code_search'> =>
        m.role === 'tool' && m.toolName === 'code_search',
    )
    expect(codeSearchResult?.content[0].value).toMatchObject({
      stdoutOmittedForLength: true,
      status: 'passed',
    })

    const subtreeResult = result.find(
      (m): m is CodebuffToolMessage<'read_subtree'> =>
        m.role === 'tool' && m.toolName === 'read_subtree',
    )
    expect(subtreeResult?.content[0].value?.[0]).toMatchObject({
      printedTreeOmittedForLength: true,
    })

    const queryResult = result.find(
      (m): m is CodebuffToolMessage<'query_index'> =>
        m.role === 'tool' && m.toolName === 'query_index',
    )
    expect(queryResult?.content[0].value).toMatchObject({
      results: [{ matchedSnippetsOmittedForLength: true }],
    })

    const webResult = result.find(
      (m): m is CodebuffToolMessage<'web_search'> =>
        m.role === 'tool' && m.toolName === 'web_search',
    )
    expect(webResult?.content[0].value).toMatchObject({
      resultOmittedForLength: true,
    })

    expect(tokenCounter.countTokensJson(result)).toBeLessThanOrEqual(6000)
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
        userMessage(
          'A'.repeat(500), // Large message to force truncation
        ),
        userMessage(
          'B'.repeat(500), // Large message to force truncation
        ),
        userMessage({
          content: 'Message 3 - keep me!',
          keepDuringTruncation: true,
        }),
        assistantMessage(
          'C'.repeat(500), // Large message to force truncation
        ),
        userMessage({
          content: 'Message 5 - keep me too!',
          keepDuringTruncation: true,
        }),
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
          msg.content[0].type === 'text' &&
          (msg.content[0].text.includes('keep me!') ||
            msg.content[0].text.includes('keep me too!')),
      )
      expect(keptMessages).toHaveLength(2)

      const hasCompactedContextPointer = result.some(
        (msg) =>
          msg.content[0].type === 'text' &&
          msg.content[0].text.includes(COMPACTED_CONTEXT_POINTER),
      )
      expect(hasCompactedContextPointer).toBe(true)
    })

    it('does not add replacement message when no messages are removed', () => {
      const messages = [
        userMessage('Short message 1'),
        userMessage({
          content: 'Short message 2',
          keepDuringTruncation: true,
        }),
      ]

      const result = trimMessagesToFitTokenLimit({
        messages,
        systemTokens: 0,
        maxTotalTokens: 10000,
        logger,
      })

      // Should be unchanged when under token limit
      expect(result).toHaveLength(2)
      expect(
        result[0].content[0].type === 'text' && result[0].content[0].text,
      ).toBe('Short message 1')
      expect(
        result[1].content[0].type === 'text' && result[1].content[0].text,
      ).toBe('Short message 2')
    })

    it('handles consecutive replacement messages correctly', () => {
      const messages: Message[] = [
        userMessage('A'.repeat(1000)), // Large message to be removed
        userMessage('B'.repeat(1000)), // Large message to be removed
        userMessage('C'.repeat(1000)), // Large message to be removed
        userMessage({ content: 'Keep this', keepDuringTruncation: true }),
      ]

      const result = trimMessagesToFitTokenLimit({
        messages,
        systemTokens: 0,
        maxTotalTokens: 1000,
        logger,
      })

      // Should only have one replacement message for consecutive removals
      const compactedContextPointers = result.filter(
        (msg) =>
          msg.content[0].type === 'text' &&
          msg.content[0].text.includes(COMPACTED_CONTEXT_POINTER),
      )
      expect(compactedContextPointers).toHaveLength(1)

      // Should keep the marked message
      const keptMessage = result.find(
        (msg) =>
          msg.content[0].type === 'text' &&
          msg.content[0].text.includes('Keep this'),
      )
      expect(keptMessage).toBeDefined()
    })

    it('calculates token removal correctly with keepDuringTruncation', () => {
      const messages: Message[] = [
        userMessage('A'.repeat(500)), // Will be removed
        userMessage('B'.repeat(500)), // Will be removed
        userMessage({
          content: 'Keep this short message',
          keepDuringTruncation: true,
        }),
        userMessage('C'.repeat(100)), // Might be kept
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
          msg.content[0].type === 'text' &&
          msg.content[0].text.includes('Keep this short message'),
      )
      expect(keptMessage).toBeDefined()

      // Total tokens should be under limit
      const finalTokens = tokenCounter.countTokensJson(result)
      expect(finalTokens).toBeLessThan(2000)
    })

    it('handles mixed keepDuringTruncation and regular messages', () => {
      const messages: Message[] = [
        userMessage('A'.repeat(800)), // Large message to force truncation
        userMessage({ content: 'Keep 1', keepDuringTruncation: true }),
        userMessage('B'.repeat(800)), // Large message to force truncation
        userMessage({ content: 'Keep 2', keepDuringTruncation: true }),
        userMessage('C'.repeat(800)), // Large message to force truncation
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
          msg.content[0].type === 'text' &&
          (msg.content[0].text.includes('Keep 1') ||
            msg.content[0].text.includes('Keep 2')),
      )
      expect(keptMessages).toHaveLength(2)

      const compactedContextPointers = result.filter(
        (msg) =>
          msg.content[0].type === 'text' &&
          msg.content[0].text.includes(COMPACTED_CONTEXT_POINTER),
      )
      expect(compactedContextPointers.length).toBeGreaterThan(0)
    })
  })
})

describe('filterUnfinishedToolCalls', () => {
  it('returns empty array when given empty messages', () => {
    const result = filterUnfinishedToolCalls([])
    expect(result).toEqual([])
  })

  it('keeps messages that are not assistant messages', () => {
    const messages: Message[] = [
      userMessage('Hello'),
      systemMessage('System prompt'),
      {
        role: 'tool',
        toolName: 'read_files',
        toolCallId: 'tool-1',
        content: jsonToolResult({ files: [] }),
      },
    ]

    const result = filterUnfinishedToolCalls(messages)
    expect(result).toHaveLength(3)
    expect(result).toEqual(messages)
  })

  it('keeps assistant messages with text content only', () => {
    const messages: Message[] = [
      userMessage('Hello'),
      assistantMessage('Hi there!'),
      userMessage('How are you?'),
      assistantMessage('I am doing well.'),
    ]

    const result = filterUnfinishedToolCalls(messages)
    expect(result).toHaveLength(4)
    expect(result).toEqual(messages)
  })

  it('keeps tool calls that have corresponding tool responses', () => {
    const messages: Message[] = [
      userMessage('Read a file'),
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'read_files',
            input: { paths: ['test.ts'] },
          },
        ],
      },
      {
        role: 'tool',
        toolName: 'read_files',
        toolCallId: 'call-1',
        content: jsonToolResult({ content: 'file content' }),
      },
    ]

    const result = filterUnfinishedToolCalls(messages)
    expect(result).toHaveLength(3)
    expect(result[1].role).toBe('assistant')
    expect(result[1].content).toHaveLength(1)
    expect(result[1].content[0].type).toBe('tool-call')
  })

  it('removes tool calls that do not have corresponding tool responses', () => {
    const messages: Message[] = [
      userMessage('Read a file'),
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'read_files',
            input: { paths: ['test.ts'] },
          },
        ],
      },
      // No tool response for call-1
    ]

    const result = filterUnfinishedToolCalls(messages)
    expect(result).toHaveLength(1) // Only the user message
    expect(result[0].role).toBe('user')
  })

  it('removes only unfinished tool calls from assistant messages with mixed content', () => {
    const messages: Message[] = [
      userMessage('Read files'),
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will read these files' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'read_files',
            input: { paths: ['file1.ts'] },
          },
          {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'read_files',
            input: { paths: ['file2.ts'] },
          },
        ],
      },
      {
        role: 'tool',
        toolName: 'read_files',
        toolCallId: 'call-1',
        content: jsonToolResult({ content: 'file1 content' }),
      },
      // No tool response for call-2
    ]

    const result = filterUnfinishedToolCalls(messages)
    expect(result).toHaveLength(3) // user, assistant (filtered), tool

    const assistantMsg = result[1]
    expect(assistantMsg.role).toBe('assistant')
    expect(assistantMsg.content).toHaveLength(2) // text + call-1 (call-2 removed)
    expect(assistantMsg.content[0].type).toBe('text')
    expect(assistantMsg.content[1].type).toBe('tool-call')
    const toolCallPart = assistantMsg.content[1]
    if (!isToolCallPart(toolCallPart))
      throw new Error('Expected tool-call part')
    expect(toolCallPart.toolCallId).toBe('call-1')
  })

  it('removes assistant message entirely if all content parts are unfinished tool calls', () => {
    const messages: Message[] = [
      userMessage('Do something'),
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'write_file',
            input: { path: 'test.ts', content: 'test' },
          },
          {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'read_files',
            input: { paths: ['other.ts'] },
          },
        ],
      },
      // No tool responses
    ]

    const result = filterUnfinishedToolCalls(messages)
    expect(result).toHaveLength(1) // Only the user message
    expect(result[0].role).toBe('user')
  })

  it('handles multiple assistant messages with different tool call states', () => {
    const messages: Message[] = [
      userMessage('First request'),
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'read_files',
            input: { paths: ['file1.ts'] },
          },
        ],
      },
      {
        role: 'tool',
        toolName: 'read_files',
        toolCallId: 'call-1',
        content: jsonToolResult({ content: 'content1' }),
      },
      userMessage('Second request'),
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'write_file',
            input: { path: 'test.ts', content: 'test' },
          },
        ],
      },
      // No tool response for call-2 (unfinished)
    ]

    const result = filterUnfinishedToolCalls(messages)
    expect(result).toHaveLength(4) // user1, assistant1 (kept), tool1, user2
    expect(result[0].role).toBe('user')
    expect(result[1].role).toBe('assistant')
    expect(result[2].role).toBe('tool')
    expect(result[3].role).toBe('user')
  })

  it('preserves auxiliary message data on filtered assistant messages', () => {
    const messages: Message[] = [
      userMessage('Test'),
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Response' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'read_files',
            input: { paths: ['test.ts'] },
          },
        ],
        tags: ['important'],
        keepDuringTruncation: true,
      },
      // No tool response
    ]

    const result = filterUnfinishedToolCalls(messages)
    expect(result).toHaveLength(2)

    const assistantMsg = result[1]
    expect(assistantMsg.tags).toEqual(['important'])
    expect(assistantMsg.keepDuringTruncation).toBe(true)
    expect(assistantMsg.content).toHaveLength(1) // Only text, tool-call removed
  })
})

describe('getPreviouslyReadFiles', () => {
  it('returns empty array when no messages provided', () => {
    const result = getPreviouslyReadFiles({ messages: [], logger })
    expect(result).toEqual([])
  })

  it('returns empty array when no tool messages with relevant tool names', () => {
    const messages: Message[] = [
      userMessage('hello'),
      userMessage('hi'),
      {
        role: 'tool',
        toolName: 'write_file',
        toolCallId: 'test-id',
        content: jsonToolResult({
          file: 'test.ts',
          errorMessage: 'error',
        }),
      } satisfies CodebuffToolMessage<'write_file'>,
    ]

    const result = getPreviouslyReadFiles({ messages, logger })
    expect(result).toEqual([])
  })

  it('extracts files from read_files tool messages', () => {
    const messages: Message[] = [
      {
        role: 'tool',
        toolName: 'read_files',
        toolCallId: 'test-id',
        content: jsonToolResult([
          {
            path: 'src/test.ts',
            content: 'export function test() {}',
            referencedBy: { 'main.ts': ['line 10'] },
          },
          {
            path: 'src/utils.ts',
            content: 'export const utils = {}',
          },
        ] as const),
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
        toolName: 'find_files',
        toolCallId: 'test-id',
        content: jsonToolResult([
          {
            path: 'components/Button.tsx',
            content: 'export const Button = () => {}',
          },
        ] as const),
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
        toolName: 'read_files',
        toolCallId: 'test-id-1',
        content: jsonToolResult([
          {
            path: 'file1.ts',
            content: 'content 1',
          },
        ]),
      } satisfies CodebuffToolMessage<'read_files'>,
      {
        role: 'tool',
        toolName: 'find_files',
        toolCallId: 'test-id-2',
        content: jsonToolResult([
          {
            path: 'file2.ts',
            content: 'content 2',
          },
        ]),
      } satisfies CodebuffToolMessage<'find_files'>,
      userMessage('Some user message'),
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
        toolName: 'read_files',
        toolCallId: 'test-id',
        content: jsonToolResult([
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
        ] as const),
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

    // Use jsonToolResult with non-array data to trigger error handling
    // The function expects an array of files but we give it an object
    const malformedMessage: Message = {
      role: 'tool' as const,
      toolName: 'read_files',
      toolCallId: 'test-id',
      content: jsonToolResult({ unexpectedFormat: true }),
    }

    const messages: Message[] = [malformedMessage]

    const result = getPreviouslyReadFiles({ messages, logger })
    expect(result).toEqual([])
    expect(mockLoggerError).toHaveBeenCalled()

    mockLoggerError.mockRestore()
  })

  it('handles find_files tool messages with error message instead of files', () => {
    const messages: Message[] = [
      {
        role: 'tool',
        toolName: 'find_files',
        toolCallId: 'test-id',
        content: jsonToolResult({
          message: 'No files found matching the criteria',
        }),
      } satisfies CodebuffToolMessage<'find_files'>,
    ]

    const result = getPreviouslyReadFiles({ messages, logger })
    expect(result).toEqual([])
  })

  it('ignores non-tool messages', () => {
    const messages: Message[] = [
      userMessage('hello'),
      assistantMessage('hi there'),
      systemMessage('system message'),
      {
        role: 'tool',
        toolName: 'read_files',
        toolCallId: 'test-id',
        content: jsonToolResult([
          {
            path: 'test.ts',
            content: 'test content',
          },
        ]),
      } satisfies CodebuffToolMessage<'read_files'>,
    ]

    const result = getPreviouslyReadFiles({ messages, logger })
    expect(result).toEqual([{ path: 'test.ts', content: 'test content' }])
  })

  it('handles empty file arrays in tool output', () => {
    const messages: Message[] = [
      {
        role: 'tool',
        toolName: 'read_files',
        toolCallId: 'test-id',
        content: jsonToolResult([]),
      } satisfies CodebuffToolMessage<'read_files'>,
    ]

    const result = getPreviouslyReadFiles({ messages, logger })
    expect(result).toEqual([])
  })
})
