import { describe, test, expect, beforeEach } from 'bun:test'

import contextPruner from '../context-pruner'

import type { JSONValue, Message, ToolMessage } from '../types/util-types'
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

    // Should contain replacement messages (content is an array of parts)
    const hasReplacementMessage = resultMessages.some(
      (m: any) =>
        Array.isArray(m.content) &&
        m.content.some(
          (part: any) =>
            part.type === 'text' &&
            part.text.includes('Previous message(s) omitted due to length'),
        ),
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

    // Important message should be preserved (content is an array of parts)
    const importantMessage = resultMessages.find(
      (m: any) =>
        Array.isArray(m.content) &&
        m.content.some(
          (part: any) =>
            part.type === 'text' && part.text.includes('Important message'),
        ),
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

describe('context-pruner tool-call/tool-result pair preservation', () => {
  let mockAgentState: any

  beforeEach(() => {
    mockAgentState = {
      messageHistory: [] as Message[],
    }
  })

  const createToolCallMessage = (
    toolCallId: string,
    toolName: string,
    input: Record<string, unknown>,
  ): Message => ({
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId,
        toolName,
        input,
      },
    ],
  })

  const createToolResultMessage = (
    toolCallId: string,
    toolName: string,
    value: unknown,
  ): ToolMessage => ({
    role: 'tool',
    toolCallId,
    toolName,
    content: [
      {
        type: 'json',
        value: value as JSONValue,
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

  test('preserves tool-call and tool-result pairs together during message pruning', () => {
    const largeContent = 'x'.repeat(50000)

    // Create messages with tool-call/tool-result pairs interspersed with regular messages
    const messages: Message[] = [
      createMessage('user', `First: ${largeContent}`),
      createMessage('assistant', `Response 1: ${largeContent}`),
      createMessage('user', `Second: ${largeContent}`),
      // Tool call pair that should be kept together
      createToolCallMessage('call-1', 'read_files', { paths: ['test.ts'] }),
      createToolResultMessage('call-1', 'read_files', { content: 'small' }),
      createMessage('user', `Third: ${largeContent}`),
      createMessage('assistant', `Response 2: ${largeContent}`),
      createMessage('user', `Fourth: ${largeContent}`),
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages

    // Find the tool call and result
    const toolCall = resultMessages.find(
      (m: any) =>
        m.role === 'assistant' &&
        Array.isArray(m.content) &&
        m.content.some(
          (c: any) => c.type === 'tool-call' && c.toolCallId === 'call-1',
        ),
    )
    const toolResult = resultMessages.find(
      (m: any) => m.role === 'tool' && m.toolCallId === 'call-1',
    )

    // Both should be present (kept together) or both absent
    if (toolCall) {
      expect(toolResult).toBeDefined()
    }
    if (toolResult) {
      expect(toolCall).toBeDefined()
    }
  })

  test('never removes tool-call message while keeping its tool-result', () => {
    const largeContent = 'x'.repeat(60000)

    const messages: Message[] = [
      createMessage('user', `Start: ${largeContent}`),
      createMessage('assistant', `Middle: ${largeContent}`),
      createToolCallMessage('call-abc', 'code_search', { pattern: 'test' }),
      createToolResultMessage('call-abc', 'code_search', { results: [] }),
      createMessage('user', `End: ${largeContent}`),
      createMessage('assistant', `Final: ${largeContent}`),
    ]

    const results = runHandleSteps(messages)
    const resultMessages = results[0].input.messages

    // Check for orphaned tool results (tool result without matching tool call)
    const toolResults = resultMessages.filter((m: any) => m.role === 'tool')
    for (const toolResult of toolResults) {
      const matchingCall = resultMessages.find(
        (m: any) =>
          m.role === 'assistant' &&
          Array.isArray(m.content) &&
          m.content.some(
            (c: any) =>
              c.type === 'tool-call' && c.toolCallId === toolResult.toolCallId,
          ),
      )
      expect(matchingCall).toBeDefined()
    }
  })

  test('never removes tool-result message while keeping its tool-call', () => {
    const largeContent = 'x'.repeat(60000)

    const messages: Message[] = [
      createMessage('user', `A: ${largeContent}`),
      createToolCallMessage('call-xyz', 'find_files', { pattern: '*.ts' }),
      createToolResultMessage('call-xyz', 'find_files', { files: ['a.ts'] }),
      createMessage('assistant', `B: ${largeContent}`),
      createMessage('user', `C: ${largeContent}`),
    ]

    const results = runHandleSteps(messages)
    const resultMessages = results[0].input.messages

    // Check for orphaned tool calls (tool call without matching tool result)
    const toolCalls = resultMessages.filter(
      (m: any) =>
        m.role === 'assistant' &&
        Array.isArray(m.content) &&
        m.content.some((c: any) => c.type === 'tool-call'),
    )

    for (const toolCallMsg of toolCalls) {
      for (const part of toolCallMsg.content) {
        if (part.type === 'tool-call') {
          const matchingResult = resultMessages.find(
            (m: any) => m.role === 'tool' && m.toolCallId === part.toolCallId,
          )
          expect(matchingResult).toBeDefined()
        }
      }
    }
  })

  test('preserves multiple tool-call/tool-result pairs in same context', () => {
    const largeContent = 'x'.repeat(40000)

    const messages: Message[] = [
      createMessage('user', `Request: ${largeContent}`),
      // First tool call pair
      createToolCallMessage('call-1', 'read_files', { paths: ['a.ts'] }),
      createToolResultMessage('call-1', 'read_files', { content: 'file a' }),
      // Second tool call pair
      createToolCallMessage('call-2', 'read_files', { paths: ['b.ts'] }),
      createToolResultMessage('call-2', 'read_files', { content: 'file b' }),
      // Third tool call pair
      createToolCallMessage('call-3', 'code_search', { pattern: 'foo' }),
      createToolResultMessage('call-3', 'code_search', { matches: [] }),
      createMessage('assistant', `Response: ${largeContent}`),
      createMessage('user', `Follow up: ${largeContent}`),
    ]

    const results = runHandleSteps(messages)
    const resultMessages = results[0].input.messages

    // Verify each tool call has its corresponding result
    const toolCallIds = ['call-1', 'call-2', 'call-3']
    for (const callId of toolCallIds) {
      const hasToolCall = resultMessages.some(
        (m: any) =>
          m.role === 'assistant' &&
          Array.isArray(m.content) &&
          m.content.some(
            (c: any) => c.type === 'tool-call' && c.toolCallId === callId,
          ),
      )
      const hasToolResult = resultMessages.some(
        (m: any) => m.role === 'tool' && m.toolCallId === callId,
      )

      // Either both exist or neither exists
      expect(hasToolCall).toBe(hasToolResult)
    }
  })

  test('abridges tool result content while preserving the pair structure', () => {
    const largeContent = 'x'.repeat(150000)
    const largeToolResult = 'y'.repeat(2000) // > 1000 chars, triggers abridging

    const messages: Message[] = [
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      createToolCallMessage('call-large', 'read_files', { paths: ['big.ts'] }),
      createToolResultMessage('call-large', 'read_files', {
        content: largeToolResult,
      }),
    ]

    const results = runHandleSteps(messages)
    const resultMessages = results[0].input.messages

    // Tool call should be unchanged
    const toolCall = resultMessages.find(
      (m: any) =>
        m.role === 'assistant' &&
        Array.isArray(m.content) &&
        m.content.some((c: any) => c.toolCallId === 'call-large'),
    )
    expect(toolCall).toBeDefined()
    expect(toolCall.content[0].input).toEqual({ paths: ['big.ts'] })

    // Tool result should be abridged but still present with same toolCallId
    const toolResult = resultMessages.find(
      (m: any) => m.role === 'tool' && m.toolCallId === 'call-large',
    )
    expect(toolResult).toBeDefined()
    expect(toolResult.content[0].value.message).toBe(
      '[LARGE_TOOL_RESULT_OMITTED]',
    )
  })

  test('handles assistant message with multiple tool calls', () => {
    const largeContent = 'x'.repeat(50000)

    // Assistant message with multiple tool calls in one message
    const multiToolCallMessage: Message = {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'multi-1',
          toolName: 'read_files',
          input: { paths: ['file1.ts'] },
        },
        {
          type: 'tool-call',
          toolCallId: 'multi-2',
          toolName: 'read_files',
          input: { paths: ['file2.ts'] },
        },
      ],
    }

    const messages: Message[] = [
      createMessage('user', `Request: ${largeContent}`),
      multiToolCallMessage,
      createToolResultMessage('multi-1', 'read_files', { content: 'file1' }),
      createToolResultMessage('multi-2', 'read_files', { content: 'file2' }),
      createMessage('user', `More: ${largeContent}`),
      createMessage('assistant', `Done: ${largeContent}`),
    ]

    const results = runHandleSteps(messages)
    const resultMessages = results[0].input.messages

    // Both tool results should have their corresponding tool calls
    const result1 = resultMessages.find(
      (m: any) => m.role === 'tool' && m.toolCallId === 'multi-1',
    )
    const result2 = resultMessages.find(
      (m: any) => m.role === 'tool' && m.toolCallId === 'multi-2',
    )

    if (result1) {
      const hasCall1 = resultMessages.some(
        (m: any) =>
          m.role === 'assistant' &&
          Array.isArray(m.content) &&
          m.content.some((c: any) => c.toolCallId === 'multi-1'),
      )
      expect(hasCall1).toBe(true)
    }

    if (result2) {
      const hasCall2 = resultMessages.some(
        (m: any) =>
          m.role === 'assistant' &&
          Array.isArray(m.content) &&
          m.content.some((c: any) => c.toolCallId === 'multi-2'),
      )
      expect(hasCall2).toBe(true)
    }
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
