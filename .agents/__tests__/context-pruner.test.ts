import { describe, test, expect, beforeEach } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

import contextPruner from '../context-pruner'

import type { JSONValue, Message, ToolMessage } from '../types/util-types'
import { AgentState } from 'types/agent-definition'
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

  // Helper to create a tool call + tool result pair
  const createToolCallPair = (
    toolCallId: string,
    toolName: string,
    input: Record<string, unknown>,
    resultValue: unknown,
  ): [Message, ToolMessage] => [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId,
          toolName,
          input,
        },
      ],
    },
    {
      role: 'tool',
      toolCallId,
      toolName,
      content: [
        {
          type: 'json',
          value: resultValue as JSONValue,
        },
      ],
    },
  ]

  const createTerminalToolPair = (
    toolCallId: string,
    command: string,
    output: string,
    exitCode?: number,
  ): [Message, ToolMessage] =>
    createToolCallPair(
      toolCallId,
      'run_terminal_command',
      { command },
      {
        command,
        stdout: output,
        ...(exitCode !== undefined && { exitCode }),
      },
    )

  const createLargeToolPair = (
    toolCallId: string,
    toolName: string,
    largeData: string,
  ): [Message, ToolMessage] =>
    createToolCallPair(toolCallId, toolName, {}, { data: largeData })

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

  test('skips all pruning passes and returns early when under limit', () => {
    // Create messages with tool calls that would normally be pruned by PASS 2
    // (non-important tools outside last 30 messages)
    // But since we're under the token limit, they should all be preserved
    const messages: Message[] = []
    
    // Add 40 code_search tool pairs (80 messages total, but small content)
    for (let i = 0; i < 40; i++) {
      messages.push(
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: `search-${i}`,
              toolName: 'code_search',
              input: { pattern: 'x' },
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: `search-${i}`,
          toolName: 'code_search',
          content: [{ type: 'json', value: { results: [] } }],
        } as ToolMessage,
      )
    }

    // With default 200k limit, these small messages are well under limit
    // So early return should preserve ALL messages, including old non-important tools
    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages

    // All 80 messages should be preserved (early return skips PASS 2)
    expect(resultMessages.length).toBe(80)
    
    // All code_search tool results should still be present
    const codeSearchCount = resultMessages.filter(
      (m: any) => m.role === 'tool' && m.toolName === 'code_search',
    ).length
    expect(codeSearchCount).toBe(40)
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

  test('removes large tool results', () => {
    // Create content large enough to exceed 200k token limit (~600k chars) to trigger terminal pass
    const largeContent = 'z'.repeat(150000)
    const largeToolData = 'x'.repeat(2000) // > 1000 chars when stringified

    const messages = [
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      // Tool call pairs with large and small results
      ...createLargeToolPair('large-tool-1', 'read_files', largeToolData),
      ...createLargeToolPair('small-tool-1', 'code_search', 'Small result'),
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

  test('preserves user messages during pruning when under aggressive limit', () => {
    // Use smaller content so we stay above 25% target but don't trigger PASS 4
    const largeContent = 'w'.repeat(10000)

    const messages = [
      createMessage('user', `User message 1: ${largeContent}`),
      createMessage('assistant', `Assistant response: ${largeContent}`),
      createMessage('user', `User message 2: ${largeContent}`),
      createMessage('assistant', `Another response: ${largeContent}`),
      createMessage('user', `User message 3: ${largeContent}`),
    ]

    // Use high limit so PASS 4 doesn't trigger
    const results = runHandleSteps(messages, 200000)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages

    // All user messages should be preserved (PASS 3 preserves user messages)
    const userMessages = resultMessages.filter(
      (m: any) => m.role === 'user' && !m.content?.[0]?.text?.includes('omitted'),
    )
    const originalUserMessages = userMessages.filter((m: any) =>
      m.content?.[0]?.text?.includes('User message'),
    )
    expect(originalUserMessages.length).toBe(3)
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

describe('context-pruner image token counting', () => {
  let mockAgentState: any

  beforeEach(() => {
    mockAgentState = {
      messageHistory: [] as Message[],
    }
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

  test('counts image content with fixed 500 tokens instead of string length', () => {
    // Create a message with a very large base64 image (would be ~100k tokens if counted by string length)
    const largeBase64Image = 'x'.repeat(300000) // ~100k tokens if counted as text

    const userMessageWithImage: Message = {
      role: 'user',
      content: [
        {
          type: 'image',
          image: largeBase64Image,
          mediaType: 'image/png',
        },
      ],
    }

    // This should NOT trigger pruning because the image is counted as 500 tokens, not 100k
    const messages: Message[] = [userMessageWithImage]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    // Message should be preserved without pruning
    expect(results[0].input.messages).toHaveLength(1)
    expect(results[0].input.messages[0].content[0].type).toBe('image')
  })

  test('counts media type tool results with fixed 500 tokens', () => {
    // Create a tool message with media type content
    // Use small media data to avoid PASS 1 truncation (>1000 chars triggers truncation)
    const smallMediaData = 'x'.repeat(100) // Small enough to not be truncated

    // Need matching tool call for the tool result
    const toolCallMessage: Message = {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'test-media',
          toolName: 'screenshot',
          input: {},
        },
      ],
    }

    const toolMessageWithMedia: ToolMessage = {
      role: 'tool',
      toolCallId: 'test-media',
      toolName: 'screenshot',
      content: [
        {
          type: 'media',
          data: smallMediaData,
          mediaType: 'image/png',
        },
      ],
    }

    // This should NOT trigger pruning because media is counted as 500 tokens
    const messages: Message[] = [toolCallMessage, toolMessageWithMedia]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    // Both messages should be preserved without pruning
    expect(results[0].input.messages).toHaveLength(2)
    // Find the tool result message
    const toolResult = results[0].input.messages.find(
      (m: any) => m.role === 'tool',
    )
    expect(toolResult.content[0].type).toBe('media')
  })

  test('counts multiple images correctly', () => {
    // Create message with multiple images
    const imageData = 'x'.repeat(100000)

    const messageWithMultipleImages: Message = {
      role: 'user',
      content: [
        { type: 'text', text: 'Here are some images:' },
        { type: 'image', image: imageData, mediaType: 'image/png' },
        { type: 'image', image: imageData, mediaType: 'image/jpeg' },
        { type: 'image', image: imageData, mediaType: 'image/png' },
      ],
    }

    // 3 images * 500 tokens + text tokens should be well under 200k limit
    const messages: Message[] = [messageWithMultipleImages]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    expect(results[0].input.messages).toHaveLength(1)
    // All images should be preserved
    const imageCount = results[0].input.messages[0].content.filter(
      (c: any) => c.type === 'image',
    ).length
    expect(imageCount).toBe(3)
  })

  test('mixed text and image content is counted correctly', () => {
    // Use smaller text so we stay under 25% target (50k tokens for 200k limit)
    const smallerText = 'y'.repeat(100000) // ~33k tokens
    const smallImageData = 'x'.repeat(100) // Small to avoid truncation

    const messageWithTextAndImage: Message = {
      role: 'user',
      content: [
        { type: 'text', text: smallerText },
        { type: 'image', image: smallImageData, mediaType: 'image/png' },
      ],
    }

    // ~33k text tokens + 1000 image tokens = ~34k, under 50k target (25% of 200k)
    const messages: Message[] = [messageWithTextAndImage]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    // Should preserve without pruning (under 25% target)
    const hasImage = results[0].input.messages.some(
      (m: any) =>
        Array.isArray(m.content) &&
        m.content.some((c: any) => c.type === 'image'),
    )
    expect(hasImage).toBe(true)
  })
})

describe('context-pruner saved run state overflow', () => {
  test('prunes message history from saved run state with large token count', () => {
    // Load the saved run state file with ~194k tokens in message history
    const runStatePath = join(
      __dirname,
      'data',
      'run-state-context-overflow.json',
    )
    const savedRunState = JSON.parse(readFileSync(runStatePath, 'utf-8'))
    const initialMessages =
      savedRunState.sessionState?.mainAgentState?.messageHistory ?? []

    // Calculate initial token count
    const countTokens = (msgs: any[]) => {
      return msgs.reduce(
        (sum, msg) => sum + Math.ceil(JSON.stringify(msg).length / 3),
        0,
      )
    }
    const initialTokens = countTokens(initialMessages)
    console.log('Initial message count:', initialMessages.length)
    console.log('Initial tokens (approx):', initialTokens)

    // Run context-pruner with 100k limit
    const mockAgentState = {
      messageHistory: initialMessages,
      systemPrompt: savedRunState.sessionState?.mainAgentState?.systemPrompt,
    } as AgentState
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }

    const maxContextLength = 190_000

    // Override maxMessageTokens via params
    const generator = contextPruner.handleSteps!({
      agentState: mockAgentState,
      logger: mockLogger,
      params: { maxContextLength },
    })

    const results: any[] = []
    let result = generator.next()
    while (!result.done) {
      if (typeof result.value === 'object') {
        results.push(result.value)
      }
      result = generator.next()
    }

    expect(results).toHaveLength(1)
    const prunedMessages = results[0].input.messages
    const finalTokens = countTokens(prunedMessages)

    console.log('Final message count:', prunedMessages.length)
    console.log('Final tokens (approx):', finalTokens)
    console.log('Token reduction:', initialTokens - finalTokens)

    // The context-pruner should have actually pruned the token count.
    // With a 100k limit and ~194k tokens, the pruner targets:
    //   targetTokens = maxContextLength * shortenedMessageTokenFactor = 100k * 0.5 = 50k
    // So final tokens should be around 50k.
    const shortenedMessageTokenFactor = 0.5
    const targetTokens = maxContextLength * shortenedMessageTokenFactor
    // Allow 500 tokens overhead
    const maxAllowedTokens = targetTokens + 500

    expect(finalTokens).toBeLessThan(maxAllowedTokens)
  })

  test('prunes message history from saved run state with large token count including system prompt', () => {
    // Load the saved run state file - message tokens (~183k) + system prompt tokens (~22k) = ~205k total
    // This exceeds the 200k limit when system prompt is included
    const runStatePath = join(
      __dirname,
      'data',
      'run-state-context-overflow2.json',
    )
    const savedRunState = JSON.parse(readFileSync(runStatePath, 'utf-8'))
    const initialMessages =
      savedRunState.sessionState?.mainAgentState?.messageHistory
    const systemPrompt =
      savedRunState.sessionState?.mainAgentState?.systemPrompt

    // Calculate initial token count
    const countTokens = (msgs: any[]) => {
      return msgs.reduce(
        (sum, msg) => sum + Math.ceil(JSON.stringify(msg).length / 3),
        0,
      )
    }
    const initialMessageTokens = countTokens(initialMessages)
    const systemPromptTokens = Math.ceil(JSON.stringify(systemPrompt).length / 3)
    console.log('Initial message count:', initialMessages.length)
    console.log('Initial message tokens (approx):', initialMessageTokens)
    console.log('System prompt tokens (approx):', systemPromptTokens)
    console.log('Total initial tokens (approx):', initialMessageTokens + systemPromptTokens)

    // Run context-pruner with 200k limit - must include systemPrompt in agentState
    // so the pruner knows about the extra tokens from the system prompt
    const mockAgentState = {
      messageHistory: initialMessages,
      systemPrompt: systemPrompt,
    } as AgentState
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }

    const maxContextLength = 200_000

    // Override maxMessageTokens via params
    const generator = contextPruner.handleSteps!({
      agentState: mockAgentState,
      logger: mockLogger,
      params: { maxContextLength },
    })

    const results: any[] = []
    let result = generator.next()
    while (!result.done) {
      if (typeof result.value === 'object') {
        results.push(result.value)
      }
      result = generator.next()
    }

    expect(results).toHaveLength(1)
    const prunedMessages = results[0].input.messages
    const finalMessageTokens = countTokens(prunedMessages)
    const finalTotalTokens = finalMessageTokens + systemPromptTokens

    console.log('Final message count:', prunedMessages.length)
    console.log('Final message tokens (approx):', finalMessageTokens)
    console.log('Final total tokens (approx):', finalTotalTokens)
    console.log('Message token reduction:', initialMessageTokens - finalMessageTokens)

    // The context-pruner calculates effective message budget as:
    //   maxMessageTokens = maxContextLength - systemPromptTokens - toolDefinitionTokens
    //   maxMessageTokens = 200k - ~22k - 0 = ~178k
    // Then it targets shortenedMessageTokenFactor (0.5) of that budget:
    //   targetMessageTokens = 178k * 0.5 = ~89k
    // So final message tokens should be around 89k
    const effectiveMessageBudget = maxContextLength - systemPromptTokens
    const shortenedMessageTokenFactor = 0.5
    const targetMessageTokens = effectiveMessageBudget * shortenedMessageTokenFactor
    // Allow some overhead for the pruning not being exact
    const maxAllowedMessageTokens = targetMessageTokens + 5000

    expect(finalMessageTokens).toBeLessThan(maxAllowedMessageTokens)
  })

  test('accounts for system prompt and tool definitions when pruning with default 200k limit', () => {
    // Load the saved run state file with ~194k tokens in message history
    const runStatePath = join(
      __dirname,
      'data',
      'run-state-context-overflow.json',
    )
    const savedRunState = JSON.parse(readFileSync(runStatePath, 'utf-8'))
    const initialMessages =
      savedRunState.sessionState?.mainAgentState?.messageHistory ?? []

    // Create a huge system prompt (~10k tokens)
    const hugeSystemPrompt = 'x'.repeat(30000) // ~10k tokens

    // Create tool definitions (~10k tokens)
    const toolDefinitions = Array.from({ length: 20 }, (_, i) => ({
      name: `tool_${i}`,
      description: 'A'.repeat(1000), // ~333 tokens each
      parameters: { type: 'object', properties: {} },
    }))

    // Calculate initial token count
    const countTokens = (obj: any) => Math.ceil(JSON.stringify(obj).length / 3)
    const systemPromptTokens = countTokens(hugeSystemPrompt)
    const toolDefinitionTokens = countTokens(toolDefinitions)
    const initialMessageTokens = countTokens(initialMessages)
    const totalInitialTokens =
      systemPromptTokens + toolDefinitionTokens + initialMessageTokens

    console.log('System prompt tokens (approx):', systemPromptTokens)
    console.log('Tool definition tokens (approx):', toolDefinitionTokens)
    console.log('Initial message tokens (approx):', initialMessageTokens)
    console.log('Total initial tokens (approx):', totalInitialTokens)

    // Run context-pruner with default 200k limit
    // Both systemPrompt and toolDefinitions are read from agentState
    const mockAgentState: any = {
      messageHistory: initialMessages,
      systemPrompt: hugeSystemPrompt,
      toolDefinitions,
    }
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }

    // No maxContextLength param, defaults to 200k
    const generator = contextPruner.handleSteps!({
      agentState: mockAgentState,
      logger: mockLogger,
      params: {},
    })

    const results: any[] = []
    let result = generator.next()
    while (!result.done) {
      if (typeof result.value === 'object') {
        results.push(result.value)
      }
      result = generator.next()
    }

    expect(results).toHaveLength(1)
    const prunedMessages = results[0].input.messages
    const finalMessageTokens = countTokens(prunedMessages)
    const finalTotalTokens =
      systemPromptTokens + toolDefinitionTokens + finalMessageTokens

    console.log('Final message tokens (approx):', finalMessageTokens)
    console.log('Final total tokens (approx):', finalTotalTokens)

    // The context-pruner should prune so that system prompt + tools + messages < 200k
    // With ~10k system prompt + ~10k tools and default 200k limit, effective message budget is ~180k
    // Target is shortenedMessageTokenFactor (0.5) of effective budget = ~90k for messages
    // Total should be well under 200k
    const maxContextLength = 200_000
    const prunedContextLength = maxContextLength * 0.6
    expect(finalTotalTokens).toBeLessThan(prunedContextLength)

    // Also verify significant pruning occurred
    expect(finalMessageTokens).toBeLessThan(initialMessageTokens)
  })
})

describe('context-pruner token counting accuracy', () => {
  let mockAgentState: any

  beforeEach(() => {
    mockAgentState = {
      messageHistory: [] as Message[],
    }
  })

  const runHandleSteps = (messages: Message[], maxContextLength?: number) => {
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
      params: maxContextLength ? { maxContextLength } : {},
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

  test('accurately counts tokens for message with large text content', () => {
    // Create a message with large content that would be significantly undercounted
    // if we only counted metadata fields without the content
    const largeText = 'x'.repeat(90000) // ~30k tokens
    
    const messageWithLargeContent: Message = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: largeText,
        },
      ],
    }

    // With a 200k token limit and a ~30k token message, should NOT be pruned
    // (30k is well under 25% of 200k = 50k target)
    const results = runHandleSteps([messageWithLargeContent], 200000)

    expect(results).toHaveLength(1)
    // Message should be preserved (under 25% target)
    expect(results[0].input.messages).toHaveLength(1)
    expect(results[0].input.messages[0].content[0].text).toBe(largeText)
  })

  test('prunes when large content exceeds token limit', () => {
    // Create multiple messages with large content that should trigger pruning
    const largeText = 'x'.repeat(60000) // ~20k tokens each
    
    const messages: Message[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: `First: ${largeText}` }],
      },
      {
        role: 'assistant', 
        content: [{ type: 'text', text: `Second: ${largeText}` }],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: `Third: ${largeText}` }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: `Fourth: ${largeText}` }],
      },
    ]

    // ~80k tokens total, with 50k limit should trigger pruning
    // If content wasn't being counted, it would see ~0 tokens and NOT prune
    const results = runHandleSteps(messages, 50000)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages
    
    // Should have pruned some messages (either removed or replaced with placeholder)
    // If token counting was broken, all 4 messages would remain
    const hasReplacementMessage = resultMessages.some(
      (m: any) =>
        Array.isArray(m.content) &&
        m.content.some(
          (part: any) =>
            part.type === 'text' &&
            part.text.includes('Previous message(s) omitted'),
        ),
    )
    expect(hasReplacementMessage).toBe(true)
  })

  test('many small messages have JSON structure overhead counted correctly', () => {
    // When there are MANY small messages, the JSON structure overhead becomes significant:
    // Each message has ~50 chars of structure: {"role":"user","content":[{"type":"text","text":""}]}
    // With 500 messages, that's ~25k chars = ~8k tokens just in structure
    // The old code would undercount because it only counted content parts + minimal metadata
    
    const smallMessages: Message[] = []
    for (let i = 0; i < 500; i++) {
      smallMessages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: [{ type: 'text', text: `msg${i}` }], // ~5 chars of actual content each
      })
    }

    // Calculate expected tokens:
    // Each message stringified is roughly: {"role":"user","content":[{"type":"text","text":"msg123"}]}
    // That's about 60-65 chars per message = ~20 tokens per message
    // 500 messages * 20 tokens = ~10k tokens
    // With a 5k limit, should trigger pruning
    // If structure wasn't counted (only content parts), we'd see ~500 * 5 chars / 3 = ~800 tokens
    // which wouldn't trigger pruning
    
    const results = runHandleSteps(smallMessages, 5000)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages
    
    // Should have pruned - either fewer messages or replacement placeholders
    // If JSON structure wasn't being counted, all 500 messages would fit in 5k tokens
    const hasReplacementMessage = resultMessages.some(
      (m: any) =>
        Array.isArray(m.content) &&
        m.content.some(
          (part: any) =>
            part.type === 'text' &&
            part.text.includes('Previous message(s) omitted'),
        ),
    )
    // Either we have fewer messages OR we have replacement messages
    const wasPruned = resultMessages.length < 500 || hasReplacementMessage
    expect(wasPruned).toBe(true)
  })

  test('tool message with large result content is counted correctly', () => {
    // Tool message with large content that must be counted
    const largeResult = 'y'.repeat(90000) // ~30k tokens
    
    const toolCallMessage: Message = {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'test-large-result',
          toolName: 'read_files',
          input: { paths: ['big-file.ts'] },
        },
      ],
    }

    const toolResultMessage: ToolMessage = {
      role: 'tool',
      toolCallId: 'test-large-result',
      toolName: 'read_files',
      content: [
        {
          type: 'json',
          value: { content: largeResult },
        },
      ],
    }

    // With 50k limit and ~30k token tool result, should not trigger message-level pruning
    // but may trigger large tool result simplification (>1000 chars)
    const results = runHandleSteps([toolCallMessage, toolResultMessage], 50000)

    expect(results).toHaveLength(1)
    // Both tool call and result should be present (may be simplified but paired)
    const resultMessages = results[0].input.messages
    const hasToolCall = resultMessages.some(
      (m: any) =>
        m.role === 'assistant' &&
        Array.isArray(m.content) &&
        m.content.some((c: any) => c.toolCallId === 'test-large-result'),
    )
    const hasToolResult = resultMessages.some(
      (m: any) => m.role === 'tool' && m.toolCallId === 'test-large-result',
    )
    expect(hasToolCall).toBe(true)
    expect(hasToolResult).toBe(true)
  })
})

describe('context-pruner aggressive pruning for many messages', () => {
  let mockAgentState: any

  beforeEach(() => {
    mockAgentState = {
      messageHistory: [] as Message[],
    }
  })

  const runHandleSteps = (messages: Message[], maxContextLength?: number) => {
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
      params: maxContextLength ? { maxContextLength } : {},
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

  const createToolCallPair = (
    toolCallId: string,
    toolName: string,
    input: Record<string, unknown>,
    resultValue: unknown,
  ): [Message, ToolMessage] => [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId,
          toolName,
          input,
        },
      ],
    },
    {
      role: 'tool',
      toolCallId,
      toolName,
      content: [
        {
          type: 'json',
          value: resultValue as JSONValue,
        },
      ],
    },
  ]

  test('removes non-important tool call pairs not in last 30 messages when over limit', () => {
    // Create messages with a mix of important and non-important tool calls
    // PASS 2 removes non-important tool pairs not in the last 30 messages
    // Use a LOW token limit to trigger pruning passes
    const messages: Message[] = []

    // Add 50 code_search tool pairs (100 messages, most outside last 30)
    for (let i = 0; i < 50; i++) {
      messages.push(...createToolCallPair(
        `search-${i}`,
        'code_search',
        { pattern: `pattern${i}` },
        { results: [] },
      ))
    }

    // Add 10 read_files tool pairs at the end (important - should be kept)
    for (let i = 0; i < 10; i++) {
      messages.push(...createToolCallPair(
        `read-${i}`,
        'read_files',
        { paths: [`file${i}.ts`] },
        { content: 'file content' },
      ))
    }

    // Add 5 write_file tool pairs at the end (important - should be kept)
    for (let i = 0; i < 5; i++) {
      messages.push(...createToolCallPair(
        `write-${i}`,
        'write_file',
        { path: `file${i}.ts`, content: 'new content' },
        { success: true },
      ))
    }

    // Total: 130 messages (50*2 + 10*2 + 5*2)
    expect(messages.length).toBe(130)

    // Use low token limit (5000) to force pruning to trigger
    const results = runHandleSteps(messages, 5000)
    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages

    // Should have removed old non-important tool pairs (not in last 30)
    expect(resultMessages.length).toBeLessThan(130)

    // Important tools (read_files, write_file) should still be present
    const hasReadFiles = resultMessages.some(
      (m: any) => m.role === 'tool' && m.toolName === 'read_files',
    )
    const hasWriteFile = resultMessages.some(
      (m: any) => m.role === 'tool' && m.toolName === 'write_file',
    )
    expect(hasReadFiles).toBe(true)
    expect(hasWriteFile).toBe(true)
  })

  test('preserves non-important tool calls in last 30 messages', () => {
    // Non-important tool pairs in the last 30 messages should be preserved
    const messages: Message[] = []

    // Add 10 code_search tool pairs (20 messages total, all in last 30)
    for (let i = 0; i < 10; i++) {
      messages.push(...createToolCallPair(
        `search-${i}`,
        'code_search',
        { pattern: `pattern${i}` },
        { results: [] },
      ))
    }

    // Total: 20 messages (all within last 30)
    expect(messages.length).toBe(20)

    // These should all be preserved since they're in the last 30 messages
    const results = runHandleSteps(messages, 200000)
    const resultMessages = results[0].input.messages

    // All code_search tool pairs should remain (in last 30 messages)
    const codeSearchCount = resultMessages.filter(
      (m: any) => m.role === 'tool' && m.toolName === 'code_search',
    ).length

    expect(codeSearchCount).toBe(10)
  })

  test('preserves str_replace and write_todos as important tools', () => {
    const messages: Message[] = []

    // Add many find_files calls (non-important)
    for (let i = 0; i < 60; i++) {
      messages.push(...createToolCallPair(
        `find-${i}`,
        'find_files',
        { pattern: '*.ts' },
        { files: [] },
      ))
    }

    // Add str_replace calls (important)
    for (let i = 0; i < 5; i++) {
      messages.push(...createToolCallPair(
        `replace-${i}`,
        'str_replace',
        { path: 'file.ts', old: 'old', new: 'new' },
        { success: true },
      ))
    }

    // Add write_todos calls (important)
    for (let i = 0; i < 3; i++) {
      messages.push(...createToolCallPair(
        `todos-${i}`,
        'write_todos',
        { todos: [] },
        { success: true },
      ))
    }

    // Total: 136 messages
    expect(messages.length).toBe(136)

    const results = runHandleSteps(messages)
    const resultMessages = results[0].input.messages

    // str_replace and write_todos should be preserved
    const strReplaceCount = resultMessages.filter(
      (m: any) => m.role === 'tool' && m.toolName === 'str_replace',
    ).length
    const writeTodosCount = resultMessages.filter(
      (m: any) => m.role === 'tool' && m.toolName === 'write_todos',
    ).length

    expect(strReplaceCount).toBe(5)
    expect(writeTodosCount).toBe(3)
  })

  test('limits placeholder messages to maximum of 2', () => {
    // Create many messages that will trigger lots of pruning
    const largeText = 'x'.repeat(10000)
    const messages: Message[] = []

    // Create 50 user/assistant pairs that will get pruned
    for (let i = 0; i < 50; i++) {
      messages.push(createMessage('user', `Message ${i}: ${largeText}`))
      messages.push(createMessage('assistant', `Response ${i}: ${largeText}`))
    }

    // With a low token limit, many messages will be pruned
    const results = runHandleSteps(messages, 50000)
    const resultMessages = results[0].input.messages

    // Count placeholder messages
    const placeholderCount = resultMessages.filter(
      (m: any) =>
        Array.isArray(m.content) &&
        m.content.some(
          (part: any) =>
            part.type === 'text' &&
            part.text?.includes('Previous message(s) omitted'),
        ),
    ).length

    // Should have at most 2 placeholders
    expect(placeholderCount).toBeLessThanOrEqual(2)
  })

  test('preserves tool calls in last 30 messages regardless of importance', () => {
    // Create messages where all tool calls are within the last 30 messages
    const messages: Message[] = []

    // Add 10 code_search tool pairs (20 messages total, all in last 30)
    for (let i = 0; i < 10; i++) {
      messages.push(...createToolCallPair(
        `search-${i}`,
        'code_search',
        { pattern: `pattern${i}` },
        { results: [] },
      ))
    }

    // Total: 20 messages (all within last 30)
    expect(messages.length).toBe(20)

    // With high token limit, all should be preserved (within last 30)
    const results = runHandleSteps(messages, 200000)
    const resultMessages = results[0].input.messages

    // All code_search tool pairs should be preserved (in last 30 messages)
    const codeSearchCount = resultMessages.filter(
      (m: any) => m.role === 'tool' && m.toolName === 'code_search',
    ).length

    expect(codeSearchCount).toBe(10)
  })
})

describe('context-pruner PASS 4 most aggressive pruning', () => {
  let mockAgentState: any

  beforeEach(() => {
    mockAgentState = {
      messageHistory: [] as Message[],
    }
  })

  const runHandleSteps = (messages: Message[], maxContextLength?: number) => {
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
      params: maxContextLength ? { maxContextLength } : {},
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

  const createMessage = (
    role: 'user' | 'assistant',
    content: string,
  ): Message => ({
    role,
    content: [{ type: 'text', text: content }],
  })

  test('PASS 4 removes all messages from front when PASS 3 is insufficient', () => {
    // Create messages where PASS 3 cannot remove enough
    // (all messages are user messages or tool pairs, which PASS 3 preserves)
    const largeText = 'x'.repeat(30000) // ~10k tokens each
    
    // Create only user messages - PASS 3 won't remove any of these
    const messages: Message[] = []
    for (let i = 0; i < 20; i++) {
      messages.push(createMessage('user', `User message ${i}: ${largeText}`))
    }

    // With 50k limit and ~200k tokens, PASS 3 can't help (won't remove user messages)
    // PASS 4 should remove messages from the front
    const results = runHandleSteps(messages, 50000)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages

    // Should have fewer messages (PASS 4 removed from front)
    expect(resultMessages.length).toBeLessThan(20)

    // Should have a placeholder at the start
    const hasPlaceholder = resultMessages[0]?.content?.[0]?.text?.includes('omitted')
    expect(hasPlaceholder).toBe(true)

    // Remaining messages should be from the END of the original list
    const lastRemainingText = resultMessages[resultMessages.length - 1]?.content?.[0]?.text
    expect(lastRemainingText).toContain('User message 19') // Last original message
  })

  test('PASS 4 triggers when user messages and tool pairs exceed limit', () => {
    const largeText = 'x'.repeat(20000)
    const messages: Message[] = []

    // Add large user messages interspersed with tool pairs
    for (let i = 0; i < 10; i++) {
      messages.push(createMessage('user', `Request ${i}: ${largeText}`))
      messages.push({
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: `call-${i}`,
            toolName: 'read_files',
            input: { paths: ['file.ts'] },
          },
        ],
      })
      messages.push({
        role: 'tool',
        toolCallId: `call-${i}`,
        toolName: 'read_files',
        content: [{ type: 'json', value: { content: largeText } }],
      } as ToolMessage)
    }

    // 30 messages total, all protected by PASS 3 (user messages + tool pairs)
    expect(messages.length).toBe(30)

    // Use very low limit to force PASS 4
    const results = runHandleSteps(messages, 20000)
    const resultMessages = results[0].input.messages

    // PASS 4 should have removed messages from the front
    expect(resultMessages.length).toBeLessThan(30)
  })
})

describe('context-pruner PASS 0 instructions removal', () => {
  let mockAgentState: any

  beforeEach(() => {
    mockAgentState = {
      messageHistory: [] as Message[],
    }
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
      params: {},
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

  test('removes messages with INSTRUCTIONS_PROMPT tag', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'First message' }],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Instructions prompt message' }],
        tags: ['INSTRUCTIONS_PROMPT'],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
      },
    ]

    const results = runHandleSteps(messages)
    const resultMessages = results[0].input.messages

    // Should have removed the INSTRUCTIONS_PROMPT message
    expect(resultMessages.length).toBe(2)
    expect(
      resultMessages.every(
        (m: any) => !m.tags?.includes('INSTRUCTIONS_PROMPT'),
      ),
    ).toBe(true)
  })

  test('removes messages with SUBAGENT_SPAWN tag', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'First message' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Spawning subagent...' }],
        tags: ['SUBAGENT_SPAWN'],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Follow up' }],
      },
    ]

    const results = runHandleSteps(messages)
    const resultMessages = results[0].input.messages

    // Should have removed the SUBAGENT_SPAWN message
    expect(resultMessages.length).toBe(2)
    expect(
      resultMessages.every((m: any) => !m.tags?.includes('SUBAGENT_SPAWN')),
    ).toBe(true)
  })

  test('removes both INSTRUCTIONS_PROMPT and SUBAGENT_SPAWN messages', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Start' }],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Instructions' }],
        tags: ['INSTRUCTIONS_PROMPT'],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Spawning...' }],
        tags: ['SUBAGENT_SPAWN'],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'End' }],
      },
    ]

    const results = runHandleSteps(messages)
    const resultMessages = results[0].input.messages

    // Should have removed both tagged messages
    expect(resultMessages.length).toBe(2)
    const texts = resultMessages.map((m: any) => m.content[0].text)
    expect(texts).toContain('Start')
    expect(texts).toContain('End')
  })
})

describe('context-pruner orphan removal', () => {
  let mockAgentState: any

  beforeEach(() => {
    mockAgentState = {
      messageHistory: [] as Message[],
    }
  })

  const runHandleSteps = (messages: Message[], maxContextLength?: number) => {
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
      params: maxContextLength ? { maxContextLength } : {},
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

  test('removes orphaned tool results after aggressive pruning', () => {
    const largeText = 'x'.repeat(30000)
    const messages: Message[] = [
      // Tool call that will be removed by PASS 4
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'orphan-call',
            toolName: 'code_search',
            input: { pattern: 'test' },
          },
        ],
      },
      // Many large user messages to trigger PASS 4
      ...Array.from({ length: 10 }, (_, i) => ({
        role: 'user' as const,
        content: [{ type: 'text' as const, text: `Message ${i}: ${largeText}` }],
      })),
      // Tool result at the end - will become orphaned when tool call is removed
      {
        role: 'tool',
        toolCallId: 'orphan-call',
        toolName: 'code_search',
        content: [{ type: 'json', value: { results: [] } }],
      } as ToolMessage,
    ]

    // Low limit to trigger aggressive pruning
    const results = runHandleSteps(messages, 30000)
    const resultMessages = results[0].input.messages

    // Should not have any orphaned tool results
    const toolResults = resultMessages.filter((m: any) => m.role === 'tool')
    for (const result of toolResults) {
      // Each tool result should have a matching tool call
      const hasMatchingCall = resultMessages.some(
        (m: any) =>
          m.role === 'assistant' &&
          Array.isArray(m.content) &&
          m.content.some(
            (c: any) =>
              c.type === 'tool-call' && c.toolCallId === result.toolCallId,
          ),
      )
      expect(hasMatchingCall).toBe(true)
    }
  })

  test('removes orphaned tool calls after aggressive pruning', () => {
    const largeText = 'x'.repeat(30000)
    const messages: Message[] = [
      // Tool result that will be removed by PASS 4 (at the front)
      {
        role: 'tool',
        toolCallId: 'orphan-result',
        toolName: 'read_files',
        content: [{ type: 'json', value: { content: largeText } }],
      } as ToolMessage,
      // Many large user messages
      ...Array.from({ length: 10 }, (_, i) => ({
        role: 'user' as const,
        content: [{ type: 'text' as const, text: `Message ${i}: ${largeText}` }],
      })),
      // Tool call at the end - will become orphaned when result is removed
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'orphan-result',
            toolName: 'read_files',
            input: { paths: ['file.ts'] },
          },
        ],
      },
    ]

    // Low limit to trigger aggressive pruning
    const results = runHandleSteps(messages, 30000)
    const resultMessages = results[0].input.messages

    // Should not have any orphaned tool calls
    const assistantMessages = resultMessages.filter(
      (m: any) =>
        m.role === 'assistant' &&
        Array.isArray(m.content) &&
        m.content.some((c: any) => c.type === 'tool-call'),
    )

    for (const assistant of assistantMessages) {
      for (const part of assistant.content) {
        if (part.type === 'tool-call') {
          // Each tool call should have a matching tool result
          const hasMatchingResult = resultMessages.some(
            (m: any) => m.role === 'tool' && m.toolCallId === part.toolCallId,
          )
          expect(hasMatchingResult).toBe(true)
        }
      }
    }
  })

  test('handles multiple orphaned pairs correctly', () => {
    const largeText = 'x'.repeat(20000)
    const messages: Message[] = [
      // First orphan pair (call at start, result at end)
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'orphan-1',
            toolName: 'find_files',
            input: {},
          },
        ],
      },
      // Second orphan pair (result at start, call at end)
      {
        role: 'tool',
        toolCallId: 'orphan-2',
        toolName: 'code_search',
        content: [{ type: 'json', value: {} }],
      } as ToolMessage,
      // Large content in the middle
      ...Array.from({ length: 8 }, (_, i) => ({
        role: 'user' as const,
        content: [{ type: 'text' as const, text: `Msg ${i}: ${largeText}` }],
      })),
      // Matching results/calls at the end (will become orphans)
      {
        role: 'tool',
        toolCallId: 'orphan-1',
        toolName: 'find_files',
        content: [{ type: 'json', value: {} }],
      } as ToolMessage,
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'orphan-2',
            toolName: 'code_search',
            input: {},
          },
        ],
      },
    ]

    const results = runHandleSteps(messages, 25000)
    const resultMessages = results[0].input.messages

    // No orphaned tool results
    const toolResults = resultMessages.filter((m: any) => m.role === 'tool')
    for (const result of toolResults) {
      const hasMatchingCall = resultMessages.some(
        (m: any) =>
          m.role === 'assistant' &&
          Array.isArray(m.content) &&
          m.content.some(
            (c: any) =>
              c.type === 'tool-call' && c.toolCallId === result.toolCallId,
          ),
      )
      expect(hasMatchingCall).toBe(true)
    }

    // No orphaned tool calls
    for (const msg of resultMessages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'tool-call') {
            const hasMatchingResult = resultMessages.some(
              (m: any) => m.role === 'tool' && m.toolCallId === part.toolCallId,
            )
            expect(hasMatchingResult).toBe(true)
          }
        }
      }
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

  // Helper to create a tool call + tool result pair for edge case tests
  const createTerminalToolPair = (
    toolCallId: string,
    command: string,
    output: string,
  ): [Message, ToolMessage] => [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId,
          toolName: 'run_terminal_command',
          input: { command },
        },
      ],
    },
    {
      role: 'tool',
      toolCallId,
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
    },
  ]

  const createToolPair = (
    toolCallId: string,
    toolName: string,
    resultValue: unknown,
  ): [Message, ToolMessage] => [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId,
          toolName,
          input: {},
        },
      ],
    },
    {
      role: 'tool',
      toolCallId,
      toolName,
      content: [
        {
          type: 'json',
          value: resultValue as JSONValue,
        },
      ],
    },
  ]

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
      ...createTerminalToolPair('term-1', 'npm test', '[Output omitted]'),
      ...createTerminalToolPair('term-2', 'ls -la', 'file1.txt\nfile2.txt'),
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

    const messages = [
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      ...createToolPair('tool-1', 'test1', { data: 'a'.repeat(500) }), // Small
      ...createToolPair('tool-2', 'test2', { data: 'a'.repeat(999) }), // Just under 1000 when stringified
      // Use 'read_files' (an important tool) so it won't be removed in PASS 2
      ...createToolPair('tool-3', 'read_files', { data: 'a'.repeat(2000) }), // Large
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = (results[0] as any).input.messages

    // Check that some tool result processing occurred
    const hasToolResults = resultMessages.some((m: any) => m.role === 'tool')
    expect(hasToolResults).toBe(true)

    // Check that large tool result replacement occurred (for important tool read_files)
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
