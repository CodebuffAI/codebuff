import { describe, test, expect, beforeEach } from 'bun:test'

import contextPruner from '../context-pruner'

import type { Message, ToolMessage } from '../types/util-types'
const createMessage = (
  role: 'user' | 'assistant',
  content: string,
): Message => ({
  role,
  content: [
    {
      type: 'text',
      text: content,
    },
  ],
})

describe('context-pruner handleSteps', () => {
  let mockAgentState: any

  beforeEach(() => {
    mockAgentState = {
      messageHistory: [] as Message[],
    }
  })

  const createTerminalToolMessage = (
    command: string,
    output: string,
    exitCode?: number,
  ): ToolMessage => ({
    role: 'tool',
    toolCallId: 'test-id',
    toolName: 'run_terminal_command',
    content: [
      {
        type: 'json',
        value: {
          command,
          stdout: output,
          ...(exitCode !== undefined && { exitCode }),
        },
      },
    ],
  })

  const createLargeToolMessage = (
    toolName: string,
    largeData: string,
  ): ToolMessage => ({
    role: 'tool',
    toolCallId: 'test-id',
    toolName,
    content: [
      {
        type: 'json',
        value: {
          data: largeData,
        },
      },
    ],
  })

  const runHandleSteps = (messages: Message[]) => {
    mockAgentState.messageHistory = messages
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }
    const generator = contextPruner.handleSteps!({
      agentState: mockAgentState,
      logger: mockLogger,
    })
    const results: any[] = []
    let result = generator.next()
    while (!result.done) {
      if (typeof result.value === 'object') {
        results.push(result.value)
      }
      result = generator.next()
    }
    return results
  }

  test('does nothing when messages are under token limit', () => {
    const messages = [
      createMessage('user', 'Hello'),
      createMessage('assistant', 'Hi there!'),
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(
      expect.objectContaining({
        toolName: 'set_messages',
        input: {
          messages,
        },
      }),
    )
  })

  test('does not remove messages if assistant message does not contain context-pruner spawn call', () => {
    const messages = [
      createMessage('user', 'Hello'),
      createMessage('assistant', 'Regular response without spawn call'),
      createMessage('user', 'Follow up'),
    ]

    const results = runHandleSteps(messages)
    expect(results).toHaveLength(1)
    expect(results[0].input.messages).toHaveLength(3)
  })

  test('removes old terminal command results while keeping recent 5', () => {
    // Create content large enough to exceed 200k token limit (~600k chars)
    const largeContent = 'x'.repeat(150000)

    const messages = [
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      // 7 terminal commands (should keep last 5, simplify first 2)
      ...Array.from({ length: 7 }, (_, i) =>
        createTerminalToolMessage(
          `command-${i + 1}`,
          `Large output ${i + 1}: ${'y'.repeat(1000)}`,
          0,
        ),
      ),
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages

    // Check that first 2 terminal commands are simplified
    const firstTerminalMessage = resultMessages.find(
      (m: any) =>
        m.role === 'tool' &&
        m.toolName === 'run_terminal_command' &&
        m.content?.[0]?.value?.command === 'command-1',
    )
    expect(
      firstTerminalMessage?.content?.[0]?.value?.stdoutOmittedForLength,
    ).toBe(true)

    // Check that recent terminal commands are preserved (but may be processed by large tool result pass)
    const recentTerminalMessage = resultMessages.find(
      (m: any) =>
        m.role === 'tool' &&
        m.toolName === 'run_terminal_command' &&
        (m.content?.[0]?.value?.command === 'command-7' ||
          m.content?.[0]?.value?.message === '[LARGE_TOOL_RESULT_OMITTED]'),
    )
    expect(recentTerminalMessage).toBeDefined()
  })

  test('removes large tool results', () => {
    // Create content large enough to exceed 200k token limit (~600k chars) to trigger terminal pass
    const largeContent = 'z'.repeat(150000)
    const largeToolData = 'x'.repeat(2000) // > 1000 chars when stringified

    const messages = [
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      // Message with large tool result
      createLargeToolMessage('read_files', largeToolData),
      createLargeToolMessage('code_search', 'Small result'),
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages

    // Large tool result should be simplified
    const largeResultMessage = resultMessages.find(
      (m: any) => m.role === 'tool' && m.toolName === 'read_files',
    )
    expect(largeResultMessage?.content?.[0]?.value?.message).toBe(
      '[LARGE_TOOL_RESULT_OMITTED]',
    )

    // Small tool result should be preserved
    const smallResultMessage = resultMessages.find(
      (m: any) => m.role === 'tool' && m.toolName === 'code_search',
    )
    expect(smallResultMessage?.content?.[0]?.value?.data).toBe('Small result')
  })

  test('performs message-level pruning when other passes are insufficient', () => {
    // Create many large messages to exceed token limit
    const largeContent = 'z'.repeat(50000)

    const messages = Array.from({ length: 20 }, (_, i) =>
      createMessage(
        i % 2 === 0 ? 'user' : 'assistant',
        `Message ${i + 1}: ${largeContent}`,
      ),
    )

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages

    // Should have fewer messages due to pruning
    expect(resultMessages.length).toBeLessThan(messages.length)

    // Should contain replacement messages
    const hasReplacementMessage = resultMessages.some(
      (m: any) =>
        typeof m.content === 'string' &&
        m.content.includes('Previous message(s) omitted due to length'),
    )
    expect(hasReplacementMessage).toBe(true)
  })

  test('preserves messages with keepDuringTruncation flag', () => {
    const largeContent = 'w'.repeat(50000)

    const messages = [
      createMessage('user', `Message 1: ${largeContent}`),
      {
        ...createMessage('assistant', `Important message: ${largeContent}`),
        keepDuringTruncation: true,
      },
      createMessage('user', `Message 3: ${largeContent}`),
    ] as any[]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages

    // Important message should be preserved
    const importantMessage = resultMessages.find(
      (m: any) =>
        typeof m.content === 'string' &&
        m.content.includes('Important message'),
    )
    expect(importantMessage).toBeDefined()
  })

  test('handles non-string message content', () => {
    const messages = [
      createMessage('user', 'Hello'),
      { role: 'assistant', content: { type: 'object', data: 'test' } },
    ] as any[]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    // Should convert non-string content to JSON string for processing
    const resultMessages = results[0].input.messages
    expect(resultMessages).toHaveLength(2)
    // The content might remain as object if no processing was needed, or become string if processed
    expect(resultMessages[1]).toBeDefined()
  })

  test('handles empty message history', () => {
    const messages: Message[] = []

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    expect(results[0].input.messages).toEqual([])
  })

  test('token counting approximation works', () => {
    // Test the internal token counting logic indirectly
    const shortMessage = createMessage('user', 'Hi')
    const longMessage = createMessage('user', 'x'.repeat(300)) // ~100 tokens

    // Short message should not trigger pruning
    let results = runHandleSteps([shortMessage])
    expect(results[0].input.messages).toHaveLength(1)

    // Very long message should potentially trigger some processing
    results = runHandleSteps([longMessage])
    expect(results).toHaveLength(1)
  })
})

describe('context-pruner edge cases', () => {
  let mockAgentState: any

  beforeEach(() => {
    mockAgentState = {
      messageHistory: [] as Message[],
    }
  })

  const createTerminalToolMessage = (
    command: string,
    output: string,
  ): ToolMessage => ({
    role: 'tool',
    toolCallId: 'test-id',
    toolName: 'run_terminal_command',
    content: [
      {
        type: 'json',
        value: {
          command,
          stdout: output,
        },
      },
    ],
  })

  const runHandleSteps = (messages: Message[]) => {
    mockAgentState.messageHistory = messages
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }
    const generator = contextPruner.handleSteps!({
      agentState: mockAgentState,
      logger: mockLogger,
    })
    const results: ReturnType<typeof generator.next>['value'][] = []
    let result = generator.next()
    while (!result.done) {
      if (typeof result.value === 'object') {
        results.push(result.value)
      }
      result = generator.next()
    }
    return results
  }

  test('handles terminal command tool results gracefully', () => {
    const largeContent = 'x'.repeat(100000)
    const messages = [
      createMessage('user', largeContent),
      createTerminalToolMessage('npm test', '[Output omitted]'),
      createTerminalToolMessage('ls -la', 'file1.txt\nfile2.txt'),
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = (results[0] as any).input.messages

    // Should handle terminal commands gracefully
    expect(resultMessages.length).toBeGreaterThan(0)

    // Valid terminal command should be processed correctly
    const validCommand = resultMessages.find(
      (m: any) => m.role === 'tool' && m.toolName === 'run_terminal_command',
    )
    expect(validCommand).toBeDefined()
  })

  test('handles exact token limit boundary', () => {
    // Create content that when stringified is close to the 200k token limit
    // 200k tokens ≈ 600k characters (rough approximation used in code)
    const boundaryContent = 'x'.repeat(599000)

    const messages = [createMessage('user', boundaryContent)]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    // Should handle boundary condition without errors
    expect((results[0] as any).input.messages).toBeDefined()
  })

  test('preserves message order after pruning', () => {
    const largeContent = 'x'.repeat(50000)

    const messages = [
      createMessage('user', `First: ${largeContent}`),
      createMessage('assistant', `Second: ${largeContent}`),
      createMessage('user', `Third: ${largeContent}`),
      createMessage('assistant', `Fourth: ${largeContent}`),
      createMessage('user', `Fifth: ${largeContent}`),
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = (results[0] as any).input.messages

    // Check that remaining messages maintain chronological order
    let previousIndex = -1
    resultMessages.forEach((message: any) => {
      if (typeof message.content === 'string') {
        const match = message.content.match(
          /(First|Second|Third|Fourth|Fifth):/,
        )
        if (match) {
          const currentIndex = [
            'First',
            'Second',
            'Third',
            'Fourth',
            'Fifth',
          ].indexOf(match[1])
          expect(currentIndex).toBeGreaterThan(previousIndex)
          previousIndex = currentIndex
        }
      }
    })
  })

  test('handles messages with only whitespace content', () => {
    const messages = [
      createMessage('user', '   \n\t  '),
      createMessage('assistant', ''),
      createMessage('user', 'Normal content'),
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    expect((results[0] as any).input.messages).toHaveLength(3)
  })

  test('handles tool results with various sizes around 1000 char threshold', () => {
    // Create content large enough to exceed 200k token limit to trigger pruning
    const largeContent = 'x'.repeat(150000)

    const createToolMessage = (
      toolName: string,
      size: number,
    ): ToolMessage => ({
      role: 'tool',
      toolCallId: 'test-id',
      toolName,
      content: [
        {
          type: 'json',
          value: {
            data: 'a'.repeat(size),
          },
        },
      ],
    })

    const messages = [
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      createToolMessage('test1', 500), // Small
      createToolMessage('test2', 999), // Just under 1000 when stringified
      createToolMessage('test3', 2000), // Large
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = (results[0] as any).input.messages

    // Check that some tool result processing occurred
    const hasToolResults = resultMessages.some((m: any) => m.role === 'tool')
    expect(hasToolResults).toBe(true)

    // Check that large tool result replacement occurred
    const hasLargeToolResultReplacement = resultMessages.some(
      (m: any) =>
        m.role === 'tool' &&
        m.content?.[0]?.value?.message === '[LARGE_TOOL_RESULT_OMITTED]',
    )
    expect(hasLargeToolResultReplacement).toBe(true)
  })

  test('handles spawn_agent_inline detection with variations', () => {
    const testCases = [
      {
        content:
          'Regular message with spawn_agent_inline but not for other-agent',
        shouldRemove: false,
      },
      {
        content: 'spawn_agent_inline call for "context-pruner" with quotes',
        shouldRemove: true, // Has context-pruner and 3 total messages before instructions
      },
      {
        content: 'spawn_agent_inline\n  "agent_type": "context-pruner"',
        shouldRemove: true, // Has context-pruner and 3 total messages before instructions
      },
      {
        content: 'Multiple spawn_agent_inline calls, one for context-pruner',
        shouldRemove: true, // Has context-pruner and 3 total messages before instructions
      },
    ]

    testCases.forEach(({ content, shouldRemove }, index) => {
      const messages = [
        createMessage('user', 'Hello'),
        createMessage('assistant', content),
        createMessage('user', 'Follow up'),
        createMessage('user', 'Tools and instructions'),
      ]

      const results = runHandleSteps(messages)

      if (shouldRemove) {
        // Should remove the assistant message and following 2 user messages
        expect(results).toHaveLength(1)
        expect((results[0] as any).input.messages[0]).toEqual(
          createMessage('user', 'Hello'),
        )
      } else {
        // Should preserve all messages (4 original messages)
        expect((results[0] as any).input.messages).toHaveLength(4)
      }
    })
  })

  test('handles multiple consecutive replacement messages in pruning', () => {
    // Create scenario where multiple consecutive messages would be replaced
    const largeContent = 'x'.repeat(60000)

    const messages = Array.from({ length: 10 }, (_, i) =>
      createMessage('user', `Message ${i}: ${largeContent}`),
    )

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = (results[0] as any).input.messages

    // Should not have consecutive replacement messages
    let consecutiveReplacements = 0
    let maxConsecutive = 0

    resultMessages.forEach((message: any) => {
      if (
        typeof message.content === 'string' &&
        message.content.includes('Previous message(s) omitted')
      ) {
        consecutiveReplacements++
      } else {
        maxConsecutive = Math.max(maxConsecutive, consecutiveReplacements)
        consecutiveReplacements = 0
      }
    })

    maxConsecutive = Math.max(maxConsecutive, consecutiveReplacements)
    expect(maxConsecutive).toBeLessThanOrEqual(1) // No more than 1 consecutive replacement
  })
})
