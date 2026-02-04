import { describe, test, expect, beforeEach } from 'bun:test'

import contextPruner from '../context-pruner'

import type { AgentState } from '../types/agent-definition'
import type { JSONValue, Message, ToolMessage } from '../types/util-types'

// Helper to create a minimal mock AgentState for testing
function createMockAgentState(
  messageHistory: Message[],
  contextTokenCount: number,
): AgentState {
  return {
    agentId: 'test-agent',
    runId: 'test-run',
    parentId: undefined,
    messageHistory,
    output: undefined,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount,
  }
}

/**
 * Regression test: Verify handleSteps can be serialized and run in isolation.
 * This catches bugs like CACHE_EXPIRY_MS not being defined when the function
 * is stringified and executed in a QuickJS sandbox.
 *
 * The handleSteps function is serialized to a string and executed in a sandbox
 * at runtime. Any variables referenced from outside the function scope will
 * cause "X is not defined" errors. This test ensures all constants and helper
 * functions are defined inside handleSteps.
 */
describe('context-pruner handleSteps serialization', () => {
  test('handleSteps works when serialized and executed in isolation (regression test for external variable references)', () => {
    // Get the handleSteps function and convert it to a string, just like the SDK does
    const handleStepsString = contextPruner.handleSteps!.toString()

    // Verify it's a valid generator function string
    expect(handleStepsString).toMatch(/^function\*\s*\(/)

    // Create a new function from the string to simulate sandbox isolation.
    // This will fail if handleSteps references any external variables
    // (like CACHE_EXPIRY_MS was before the fix).
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const isolatedFunction = new Function(`return (${handleStepsString})`)()

    // Create minimal mock data to run the function
    const mockAgentState = createMockAgentState(
      [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there!' }],
        },
      ],
      100, // Under the limit, so it won't prune
    )

    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }

    // Run the isolated function - this will throw if any external variables are undefined
    const generator = isolatedFunction({
      agentState: mockAgentState,
      logger: mockLogger,
      params: { maxContextLength: 200000 },
    })

    // Consume the generator to ensure all code paths execute
    const results: unknown[] = []
    let result = generator.next()
    while (!result.done) {
      results.push(result.value)
      result = generator.next()
    }

    // Should have produced a result (set_messages call)
    expect(results.length).toBeGreaterThan(0)
  })

  test('handleSteps works in isolation when pruning is triggered', () => {
    // Get the handleSteps function and convert it to a string
    const handleStepsString = contextPruner.handleSteps!.toString()

    // Create a new function from the string to simulate sandbox isolation
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const isolatedFunction = new Function(`return (${handleStepsString})`)()

    // Create mock data that will trigger pruning (context over limit)
    const mockAgentState = createMockAgentState(
      [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Please help me with a task' }],
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Sure, I can help with that' },
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
          toolCallId: 'call-1',
          toolName: 'read_files',
          content: [{ type: 'json', value: { content: 'file content' } }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Thanks!' }],
        },
      ],
      250000, // Over the limit, will trigger pruning
    )

    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }

    // Run the isolated function - exercises all the helper functions like
    // truncateLongText, estimateTokens, getTextContent, summarizeToolCall
    const generator = isolatedFunction({
      agentState: mockAgentState,
      logger: mockLogger,
      params: { maxContextLength: 200000 },
    })

    // Consume the generator
    const results: any[] = []
    let result = generator.next()
    while (!result.done) {
      results.push(result.value)
      result = generator.next()
    }

    // Should have produced a result
    expect(results.length).toBeGreaterThan(0)

    // The result should contain a summary
    const setMessagesCall = results[0]
    expect(setMessagesCall.toolName).toBe('set_messages')
    expect(setMessagesCall.input.messages[0].content[0].text).toContain(
      '<conversation_summary>',
    )
  })
})

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
  value: JSONValue,
): ToolMessage => ({
  role: 'tool',
  toolCallId,
  toolName,
  content: [
    {
      type: 'json',
      value,
    },
  ],
})

describe('context-pruner handleSteps', () => {
  let mockAgentState: AgentState

  beforeEach(() => {
    mockAgentState = createMockAgentState([], 0)
  })

  const runHandleSteps = (
    messages: Message[],
    contextTokenCount?: number,
    maxContextLength?: number,
  ) => {
    mockAgentState.messageHistory = messages
    // If contextTokenCount not provided, estimate from messages
    mockAgentState.contextTokenCount =
      contextTokenCount ?? Math.ceil(JSON.stringify(messages).length / 3)
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

  test('does nothing when context is under max limit', () => {
    const messages = [
      createMessage('user', 'Hello'),
      createMessage('assistant', 'Hi there!'),
    ]

    // Context under max limit - should not trigger pruning
    const results = runHandleSteps(messages, 199000, 200000)

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

  test('summarizes conversation when context exceeds max limit', () => {
    const messages = [
      createMessage('user', 'Please help me with this task'),
      createMessage('assistant', 'Sure, I can help you with that'),
      createMessage('user', 'Thanks for your help'),
    ]

    // Set contextTokenCount higher than max limit to trigger pruning
    const results = runHandleSteps(messages, 210000, 200000)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages

    // Should have a single summarized message
    expect(resultMessages).toHaveLength(1)
    expect(resultMessages[0].role).toBe('user')

    // Should be wrapped in conversation_summary tags
    const content = resultMessages[0].content[0].text
    expect(content).toContain('<conversation_summary>')
    expect(content).toContain('</conversation_summary>')

    // Should contain the user and assistant markers
    expect(content).toContain('[USER]')
    expect(content).toContain('[ASSISTANT]')
  })

  test('includes tool call summaries in the output', () => {
    const messages = [
      createMessage('user', 'Read these files'),
      createToolCallMessage('call-1', 'read_files', {
        paths: ['file1.ts', 'file2.ts'],
      }),
      createToolResultMessage('call-1', 'read_files', { content: 'file data' } as JSONValue),
      createMessage('user', 'Now edit this file'),
      createToolCallMessage('call-2', 'str_replace', {
        path: 'file1.ts',
        replacements: [],
      }),
      createToolResultMessage('call-2', 'str_replace', { success: true }),
    ]

    const results = runHandleSteps(messages, 50000, 10000)
    const content = results[0].input.messages[0].content[0].text

    // Should contain tool summaries
    expect(content).toContain('Read files: file1.ts, file2.ts')
    expect(content).toContain('Edited file: file1.ts')
  })

  test('summarizes various tool types correctly', () => {
    const messages = [
      createMessage('user', 'Do various tasks'),
      createToolCallMessage('call-1', 'write_file', {
        path: 'new-file.ts',
        content: 'code',
      }),
      createToolResultMessage('call-1', 'write_file', { success: true }),
      createToolCallMessage('call-2', 'run_terminal_command', {
        command: 'npm test',
      }),
      createToolResultMessage('call-2', 'run_terminal_command', {
        stdout: 'pass',
      }),
      createToolCallMessage('call-3', 'code_search', { pattern: 'function' }),
      createToolResultMessage('call-3', 'code_search', { results: [] }),
      createToolCallMessage('call-4', 'spawn_agents', {
        agents: [{ agent_type: 'file-picker' }, { agent_type: 'commander' }],
      }),
      createToolResultMessage('call-4', 'spawn_agents', { success: true }),
    ]

    const results = runHandleSteps(messages, 50000, 10000)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('Wrote file: new-file.ts')
    expect(content).toContain('Ran command: npm test')
    expect(content).toContain('Code search: "function"')
    expect(content).toContain('Spawned agents:')
    expect(content).toContain('- file-picker')
    expect(content).toContain('- commander')
  })

  test('includes tool errors in summary', () => {
    const messages = [
      createMessage('user', 'Try to read a file'),
      createToolCallMessage('call-1', 'read_files', { paths: ['missing.ts'] }),
      createToolResultMessage('call-1', 'read_files', {
        errorMessage: 'File not found',
      }),
    ]

    const results = runHandleSteps(messages, 50000, 10000)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('[TOOL ERROR: read_files] File not found')
  })

  test('notes when user messages have images', () => {
    const messageWithImage: Message = {
      role: 'user',
      content: [
        { type: 'text', text: 'Look at this image' },
        { type: 'image', image: 'base64data', mediaType: 'image/png' },
      ],
    }

    const messages = [messageWithImage, createMessage('assistant', 'I see it')]

    const results = runHandleSteps(messages, 50000, 10000)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('[USER] [with image(s)]')
  })

  test('truncates summary when it exceeds target size', () => {
    // Create many messages to generate a large summary
    const messages: Message[] = []
    for (let i = 0; i < 100; i++) {
      messages.push(
        createMessage(
          'user',
          `User message number ${i} with some additional content to make it longer`,
        ),
      )
      messages.push(
        createMessage(
          'assistant',
          `Assistant response number ${i} with detailed explanation`,
        ),
      )
    }

    // Use a very small max context to force truncation
    const results = runHandleSteps(messages, 500000, 5000)
    const content = results[0].input.messages[0].content[0].text

    // Should contain truncation notice
    expect(content).toContain('[CONVERSATION TRUNCATED')

    // Should still have the wrapper tags
    expect(content).toContain('<conversation_summary>')
    expect(content).toContain('</conversation_summary>')
  })

  test('removes only INSTRUCTIONS_PROMPT and SUBAGENT_SPAWN when under context limit', () => {
    const messages: Message[] = [
      createMessage('user', 'Hello'),
      {
        role: 'user',
        content: [{ type: 'text', text: 'Instructions prompt' }],
        tags: ['INSTRUCTIONS_PROMPT'],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Spawning...' }],
        tags: ['SUBAGENT_SPAWN'],
      },
      createMessage('assistant', 'Response'),
    ]

    // Under threshold - should remove INSTRUCTIONS_PROMPT and SUBAGENT_SPAWN only
    const results = runHandleSteps(messages, 100, 200000)
    const resultMessages = results[0].input.messages

    // Should have removed the context-pruner specific tags but kept everything else
    expect(resultMessages).toHaveLength(2)
    expect(resultMessages[0]).toEqual(messages[0]) // 'Hello' message
    expect(resultMessages[1]).toEqual(messages[3]) // 'Response' message
  })

  test('removes INSTRUCTIONS_PROMPT and SUBAGENT_SPAWN when summarizing', () => {
    const messages: Message[] = [
      createMessage('user', 'Hello'),
      {
        role: 'user',
        content: [{ type: 'text', text: 'Instructions prompt' }],
        tags: ['INSTRUCTIONS_PROMPT'],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Spawning...' }],
        tags: ['SUBAGENT_SPAWN'],
      },
      createMessage('user', 'Follow up'),
    ]

    // Over threshold - should summarize and exclude tagged messages
    const results = runHandleSteps(messages, 250000, 200000)
    const resultMessages = results[0].input.messages

    // Should have summarized to single message (no remaining INSTRUCTIONS_PROMPT after step 0 removal)
    expect(resultMessages).toHaveLength(1)
    const content = (resultMessages[0].content[0] as { text: string }).text

    // Should NOT contain the tagged message content in summary
    expect(content).not.toContain('Instructions prompt')
    expect(content).not.toContain('Spawning...')

    // Should contain the non-tagged messages
    expect(content).toContain('Hello')
    expect(content).toContain('Follow up')
  })

  test('preserves last remaining INSTRUCTIONS_PROMPT as second message when summarizing', () => {
    const messages: Message[] = [
      createMessage('user', 'Hello'),
      {
        role: 'user',
        content: [{ type: 'text', text: 'Parent agent instructions' }],
        tags: ['INSTRUCTIONS_PROMPT'],
      },
      createMessage('assistant', 'Working on it'),
      {
        role: 'user',
        content: [{ type: 'text', text: 'Context pruner instructions' }],
        tags: ['INSTRUCTIONS_PROMPT'],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Spawning context pruner' }],
        tags: ['SUBAGENT_SPAWN'],
      },
    ]

    // Over threshold - should summarize
    const results = runHandleSteps(messages, 250000, 200000)
    const resultMessages = results[0].input.messages

    // Should have 2 messages: summary + the parent agent's INSTRUCTIONS_PROMPT
    expect(resultMessages).toHaveLength(2)

    // First message should be the summary
    const summaryContent = (resultMessages[0].content[0] as { text: string })
      .text
    expect(summaryContent).toContain('<conversation_summary>')
    expect(summaryContent).toContain('Hello')
    expect(summaryContent).toContain('Working on it')
    // Should NOT contain any instructions prompt content in summary
    expect(summaryContent).not.toContain('Parent agent instructions')
    expect(summaryContent).not.toContain('Context pruner instructions')

    // Second message should be the parent agent's INSTRUCTIONS_PROMPT (the first one, after last one was removed)
    const secondMessage = resultMessages[1]
    expect(secondMessage.tags).toContain('INSTRUCTIONS_PROMPT')
    const instructionsContent = (secondMessage.content[0] as { text: string })
      .text
    expect(instructionsContent).toBe('Parent agent instructions')
  })

  test('handles empty message history', () => {
    const messages: Message[] = []

    const results = runHandleSteps(messages, 0, 200000)

    expect(results).toHaveLength(1)
    expect(results[0].input.messages).toEqual([])
  })

  test('preserves all user message content in summary', () => {
    const messages = [
      createMessage('user', 'First user request with important details'),
      createMessage('assistant', 'First response'),
      createMessage('user', 'Second user request'),
      createMessage('assistant', 'Second response'),
      createMessage('user', 'Third user request'),
    ]

    const results = runHandleSteps(messages, 50000, 10000)
    const content = results[0].input.messages[0].content[0].text

    // All user messages should be in the summary
    expect(content).toContain('First user request with important details')
    expect(content).toContain('Second user request')
    expect(content).toContain('Third user request')
  })

  test('preserves assistant text content in summary', () => {
    const messages = [
      createMessage('user', 'Question'),
      createMessage('assistant', 'Here is my detailed answer to your question'),
    ]

    const results = runHandleSteps(messages, 50000, 10000)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('Here is my detailed answer to your question')
  })

  test('handles write_todos tool with completion status and remaining tasks', () => {
    const messages = [
      createMessage('user', 'Create a plan'),
      createToolCallMessage('call-1', 'write_todos', {
        todos: [
          { task: 'Task 1', completed: true },
          { task: 'Task 2', completed: true },
          { task: 'Task 3 - still to do', completed: false },
          { task: 'Task 4 - also remaining', completed: false },
        ],
      }),
      createToolResultMessage('call-1', 'write_todos', { success: true }),
    ]

    const results = runHandleSteps(messages, 250000, 200000)
    const content = results[0].input.messages[0].content[0].text

    // Should show completed count and list remaining tasks
    expect(content).toContain('Todos: 2/4 complete')
    expect(content).toContain('- Task 3 - still to do')
    expect(content).toContain('- Task 4 - also remaining')
  })

  test('handles spawn_agent_inline tool', () => {
    const messages = [
      createMessage('user', 'Spawn an agent'),
      createToolCallMessage('call-1', 'spawn_agent_inline', {
        agent_type: 'file-picker',
      }),
      createToolResultMessage('call-1', 'spawn_agent_inline', { output: {} }),
    ]

    const results = runHandleSteps(messages, 50000, 10000)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('Spawned agent: file-picker')
  })

  test('handles long terminal commands by truncating', () => {
    const longCommand =
      'npm run build -- --config=production --verbose --output=/very/long/path/to/output/directory'
    const messages = [
      createMessage('user', 'Run build'),
      createToolCallMessage('call-1', 'run_terminal_command', {
        command: longCommand,
      }),
      createToolResultMessage('call-1', 'run_terminal_command', { stdout: '' }),
    ]

    const results = runHandleSteps(messages, 50000, 10000)
    const content = results[0].input.messages[0].content[0].text

    // Should truncate to 50 chars + ...
    expect(content).toContain(
      'Ran command: npm run build -- --config=production --verbose --o...',
    )
  })

  test('handles unknown tools gracefully', () => {
    const messages = [
      createMessage('user', 'Use some tool'),
      createToolCallMessage('call-1', 'unknown_tool_name', { param: 'value' }),
      createToolResultMessage('call-1', 'unknown_tool_name', { result: 'ok' }),
    ]

    const results = runHandleSteps(messages, 50000, 10000)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('Used tool: unknown_tool_name')
  })

  test('handles multiple tool calls in single assistant message', () => {
    const multiToolMessage: Message = {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'read_files',
          input: { paths: ['a.ts'] },
        },
        {
          type: 'tool-call',
          toolCallId: 'call-2',
          toolName: 'read_files',
          input: { paths: ['b.ts'] },
        },
      ],
    }

    const messages = [
      createMessage('user', 'Read files'),
      multiToolMessage,
      createToolResultMessage('call-1', 'read_files', { content: 'a' }),
      createToolResultMessage('call-2', 'read_files', { content: 'b' }),
    ]

    const results = runHandleSteps(messages, 50000, 10000)
    const content = results[0].input.messages[0].content[0].text

    // Both tool calls should be in the summary
    expect(content).toContain('Read files: a.ts')
    expect(content).toContain('Read files: b.ts')
  })

  test('handles mixed text and tool calls in assistant message', () => {
    const mixedMessage: Message = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me read that file for you' },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'read_files',
          input: { paths: ['test.ts'] },
        },
      ],
    }

    const messages = [
      createMessage('user', 'Read test.ts'),
      mixedMessage,
      createToolResultMessage('call-1', 'read_files', { content: 'data' }),
    ]

    const results = runHandleSteps(messages, 50000, 10000)
    const content = results[0].input.messages[0].content[0].text

    // Should have both text and tool summary
    expect(content).toContain('Let me read that file for you')
    expect(content).toContain('Read files: test.ts')
  })
})

describe('context-pruner long message truncation', () => {
  let mockAgentState: AgentState

  beforeEach(() => {
    mockAgentState = createMockAgentState([], 0)
  })

  const runHandleSteps = (
    messages: Message[],
    contextTokenCount: number,
    maxContextLength: number,
  ) => {
    mockAgentState.messageHistory = messages
    mockAgentState.contextTokenCount = contextTokenCount
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }
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
    return results
  }

  test('truncates very long user messages with 80-20 ratio', () => {
    // Create a message that exceeds 20k chars
    const longText = 'A'.repeat(25000)
    const messages = [
      createMessage('user', longText),
      createMessage('assistant', 'Got it'),
    ]

    const results = runHandleSteps(messages, 250000, 200000)
    const content = results[0].input.messages[0].content[0].text

    // Should contain truncation notice
    expect(content).toContain('[...truncated')
    expect(content).toContain('chars...]')

    // Should have beginning (80%) and end (20%) of the message
    // The beginning should have lots of A's
    expect(content).toContain('AAAAAAAAAA')
  })

  test('truncates very long assistant messages with 80-20 ratio', () => {
    // Create an assistant message that exceeds 5k chars
    const longResponse = 'B'.repeat(8000)
    const messages = [
      createMessage('user', 'Give me a long response'),
      createMessage('assistant', longResponse),
    ]

    const results = runHandleSteps(messages, 250000, 200000)
    const content = results[0].input.messages[0].content[0].text

    // Should contain truncation notice
    expect(content).toContain('[...truncated')
    expect(content).toContain('chars...]')

    // Should have B's from beginning and end
    expect(content).toContain('BBBBBBBBBB')
  })

  test('does not truncate messages under the limit', () => {
    const shortText = 'Short message under 20k chars'
    const messages = [
      createMessage('user', shortText),
      createMessage('assistant', 'Short response under 5k chars'),
    ]

    const results = runHandleSteps(messages, 250000, 200000)
    const content = results[0].input.messages[0].content[0].text

    // Should NOT contain truncation notice
    expect(content).not.toContain('[...truncated')

    // Should contain the full messages
    expect(content).toContain(shortText)
    expect(content).toContain('Short response under 5k chars')
  })
})

describe('context-pruner code_search with flags', () => {
  let mockAgentState: AgentState

  beforeEach(() => {
    mockAgentState = createMockAgentState([], 0)
  })

  const runHandleSteps = (messages: Message[]) => {
    mockAgentState.messageHistory = messages
    mockAgentState.contextTokenCount = 250000
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }
    const generator = contextPruner.handleSteps!({
      agentState: mockAgentState,
      logger: mockLogger,
      params: { maxContextLength: 200000 },
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

  test('includes flags in code_search summary', () => {
    const messages = [
      createMessage('user', 'Search for something'),
      createToolCallMessage('call-1', 'code_search', {
        pattern: 'myFunction',
        flags: '-g *.ts -i',
      }),
      createToolResultMessage('call-1', 'code_search', { results: [] }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('Code search: "myFunction" (-g *.ts -i)')
  })
})

describe('context-pruner ask_user with questions and answers', () => {
  let mockAgentState: AgentState

  beforeEach(() => {
    mockAgentState = createMockAgentState([], 0)
  })

  const runHandleSteps = (messages: Message[]) => {
    mockAgentState.messageHistory = messages
    mockAgentState.contextTokenCount = 250000
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }
    const generator = contextPruner.handleSteps!({
      agentState: mockAgentState,
      logger: mockLogger,
      params: { maxContextLength: 200000 },
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

  test('includes question text in ask_user summary', () => {
    const messages = [
      createMessage('user', 'Help me choose'),
      createToolCallMessage('call-1', 'ask_user', {
        questions: [
          {
            question: 'Which database should we use?',
            options: [{ label: 'PostgreSQL' }, { label: 'MySQL' }],
          },
        ],
      }),
      createToolResultMessage('call-1', 'ask_user', {
        answers: [{ selectedOption: 'PostgreSQL' }],
      }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('Asked user: Which database should we use?')
  })

  test('includes user answer in summary', () => {
    const messages = [
      createMessage('user', 'Help me choose'),
      createToolCallMessage('call-1', 'ask_user', {
        questions: [
          { question: 'Pick one', options: [{ label: 'A' }, { label: 'B' }] },
        ],
      }),
      createToolResultMessage('call-1', 'ask_user', {
        answers: [{ selectedOption: 'Option B was selected' }],
      }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('[USER ANSWERED] Option B was selected')
  })

  test('includes multi-select answers', () => {
    const messages = [
      createMessage('user', 'Pick features'),
      createToolCallMessage('call-1', 'ask_user', {
        questions: [
          { question: 'Select features', options: [], multiSelect: true },
        ],
      }),
      createToolResultMessage('call-1', 'ask_user', {
        answers: [{ selectedOptions: ['Caching', 'Logging', 'Monitoring'] }],
      }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('[USER ANSWERED] Caching, Logging, Monitoring')
  })

  test('shows when user skipped question', () => {
    const messages = [
      createMessage('user', 'Ask me something'),
      createToolCallMessage('call-1', 'ask_user', {
        questions: [{ question: 'Pick one', options: [] }],
      }),
      createToolResultMessage('call-1', 'ask_user', {
        skipped: true,
      }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('[USER SKIPPED QUESTION]')
  })
})

describe('context-pruner terminal command exit codes', () => {
  let mockAgentState: AgentState

  beforeEach(() => {
    mockAgentState = createMockAgentState([], 0)
  })

  const runHandleSteps = (messages: Message[]) => {
    mockAgentState.messageHistory = messages
    mockAgentState.contextTokenCount = 250000
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }
    const generator = contextPruner.handleSteps!({
      agentState: mockAgentState,
      logger: mockLogger,
      params: { maxContextLength: 200000 },
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

  test('shows failed command with exit code', () => {
    const messages = [
      createMessage('user', 'Run tests'),
      createToolCallMessage('call-1', 'run_terminal_command', {
        command: 'npm test',
      }),
      createToolResultMessage('call-1', 'run_terminal_command', {
        stdout: 'Tests failed',
        exitCode: 1,
      }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('[COMMAND FAILED] Exit code: 1')
  })

  test('does not show failure for successful command (exit code 0)', () => {
    const messages = [
      createMessage('user', 'Run tests'),
      createToolCallMessage('call-1', 'run_terminal_command', {
        command: 'npm test',
      }),
      createToolResultMessage('call-1', 'run_terminal_command', {
        stdout: 'All tests passed',
        exitCode: 0,
      }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).not.toContain('[COMMAND FAILED]')
  })
})

describe('context-pruner spawn_agents with prompt and params', () => {
  let mockAgentState: AgentState

  beforeEach(() => {
    mockAgentState = createMockAgentState([], 0)
  })

  const runHandleSteps = (messages: Message[]) => {
    mockAgentState.messageHistory = messages
    mockAgentState.contextTokenCount = 250000
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }
    const generator = contextPruner.handleSteps!({
      agentState: mockAgentState,
      logger: mockLogger,
      params: { maxContextLength: 200000 },
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

  test('includes prompt in spawn_agents summary', () => {
    const messages = [
      createMessage('user', 'Find files'),
      createToolCallMessage('call-1', 'spawn_agents', {
        agents: [
          {
            agent_type: 'file-picker',
            prompt: 'Find all TypeScript files related to authentication',
          },
        ],
      }),
      createToolResultMessage('call-1', 'spawn_agents', { success: true }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('file-picker')
    expect(content).toContain(
      'prompt: "Find all TypeScript files related to authentication"',
    )
  })

  test('includes params in spawn_agents summary', () => {
    const messages = [
      createMessage('user', 'Run a command'),
      createToolCallMessage('call-1', 'spawn_agents', {
        agents: [
          {
            agent_type: 'commander',
            params: { command: 'npm test' },
          },
        ],
      }),
      createToolResultMessage('call-1', 'spawn_agents', { success: true }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('commander')
    expect(content).toContain('params: {"command":"npm test"}')
  })

  test('includes both prompt and params for spawn_agent_inline', () => {
    const messages = [
      createMessage('user', 'Search code'),
      createToolCallMessage('call-1', 'spawn_agent_inline', {
        agent_type: 'code-searcher',
        prompt: 'Find usages of deprecated API',
        params: { searchQueries: [{ pattern: 'oldFunction' }] },
      }),
      createToolResultMessage('call-1', 'spawn_agent_inline', { output: {} }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('Spawned agent: code-searcher')
    expect(content).toContain('prompt: "Find usages of deprecated API"')
    expect(content).toContain('params:')
    expect(content).toContain('oldFunction')
  })

  test('truncates very long prompts (over 1000 chars)', () => {
    const longPrompt = 'X'.repeat(1500)
    const messages = [
      createMessage('user', 'Do something'),
      createToolCallMessage('call-1', 'spawn_agent_inline', {
        agent_type: 'thinker',
        prompt: longPrompt,
      }),
      createToolResultMessage('call-1', 'spawn_agent_inline', { output: {} }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    // Should be truncated to 1000 chars + ...
    expect(content).toContain('...')
    expect(content).not.toContain(longPrompt) // Full prompt should not be there
  })
})

describe('context-pruner repeated compaction', () => {
  let mockAgentState: AgentState

  beforeEach(() => {
    mockAgentState = createMockAgentState([], 0)
  })

  const runHandleSteps = (
    messages: Message[],
    contextTokenCount: number,
    maxContextLength: number,
  ) => {
    mockAgentState.messageHistory = messages
    mockAgentState.contextTokenCount = contextTokenCount
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }
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
    return results
  }

  test('extracts and preserves content from previous summary', () => {
    // Simulate a conversation that was already summarized once
    const previousSummaryMessage: Message = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `<conversation_summary>
This is a summary of the conversation so far. The original messages have been condensed to save context space.

[USER]
First user request from earlier

---

[ASSISTANT]
First assistant response
</conversation_summary>`,
        },
      ],
    }

    const messages = [
      previousSummaryMessage,
      createMessage('user', 'New user message after summary'),
      createMessage('assistant', 'New assistant response'),
    ]

    const results = runHandleSteps(messages, 250000, 200000)
    const content = results[0].input.messages[0].content[0].text

    // Should contain the previous summary content (appended seamlessly)
    expect(content).toContain('First user request from earlier')
    expect(content).toContain('First assistant response')

    // Should also contain the new messages
    expect(content).toContain('New user message after summary')
    expect(content).toContain('New assistant response')
  })

  test('filters out old summary messages when building new summary', () => {
    const previousSummaryMessage: Message = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: '<conversation_summary>\nOld summary content\n</conversation_summary>',
        },
      ],
    }

    const messages = [
      previousSummaryMessage,
      createMessage('user', 'After summary message'),
    ]

    const results = runHandleSteps(messages, 250000, 200000)
    const content = results[0].input.messages[0].content[0].text

    // Should only have ONE conversation_summary tag (the new one)
    const summaryTagCount = (content.match(/<conversation_summary>/g) || [])
      .length
    expect(summaryTagCount).toBe(1)
  })

  test('handles 3+ compaction cycles without nested PREVIOUS SUMMARY markers', () => {
    // Helper to simulate running the context pruner and getting the output
    const simulateCompaction = (inputMessages: Message[]): Message => {
      const result = runHandleSteps(inputMessages, 250000, 200000)
      return result[0].input.messages[0]
    }

    // === CYCLE 1: Initial conversation ===
    const cycle1Messages = [
      createMessage('user', 'Cycle 1: User request about feature A'),
      createMessage('assistant', 'Cycle 1: I will help with feature A'),
    ]
    const summary1 = simulateCompaction(cycle1Messages)
    const summary1Text = (summary1.content[0] as { type: 'text'; text: string })
      .text

    // Verify cycle 1 output
    expect(summary1Text).toContain('Cycle 1: User request about feature A')
    expect(summary1Text).toContain('Cycle 1: I will help with feature A')
    expect(summary1Text).not.toContain('[PREVIOUS SUMMARY]') // No previous summary yet

    // === CYCLE 2: Continue conversation after first summary ===
    const cycle2Messages = [
      summary1,
      createMessage('user', 'Cycle 2: Now work on feature B'),
      createMessage('assistant', 'Cycle 2: Starting feature B work'),
    ]
    const summary2 = simulateCompaction(cycle2Messages)
    const summary2Text = (summary2.content[0] as { type: 'text'; text: string })
      .text

    // Verify cycle 2 preserves cycle 1 content (appended seamlessly)
    expect(summary2Text).toContain('Cycle 1: User request about feature A')
    expect(summary2Text).toContain('Cycle 2: Now work on feature B')

    // === CYCLE 3: Continue conversation after second summary ===
    const cycle3Messages = [
      summary2,
      createMessage('user', 'Cycle 3: Final feature C request'),
      createMessage('assistant', 'Cycle 3: Completing feature C'),
    ]
    const summary3 = simulateCompaction(cycle3Messages)
    const summary3Text = (summary3.content[0] as { type: 'text'; text: string })
      .text

    // Verify cycle 3 preserves ALL previous content (appended seamlessly)
    expect(summary3Text).toContain('Cycle 1: User request about feature A') // From cycle 1
    expect(summary3Text).toContain('Cycle 2: Now work on feature B') // From cycle 2
    expect(summary3Text).toContain('Cycle 3: Final feature C request') // New content

    // === CYCLE 4: One more cycle to be thorough ===
    const cycle4Messages = [
      summary3,
      createMessage('user', 'Cycle 4: Additional request'),
      createMessage('assistant', 'Cycle 4: Final response'),
    ]
    const summary4 = simulateCompaction(cycle4Messages)
    const summary4Text = (summary4.content[0] as { type: 'text'; text: string })
      .text

    // Verify cycle 4 preserves everything (appended seamlessly)
    expect(summary4Text).toContain('Cycle 1: User request about feature A')
    expect(summary4Text).toContain('Cycle 2: Now work on feature B')
    expect(summary4Text).toContain('Cycle 3: Final feature C request')
    expect(summary4Text).toContain('Cycle 4: Additional request')

    // Verify only one conversation_summary tag
    const summaryTagCount = (
      summary4Text.match(/<conversation_summary>/g) || []
    ).length
    expect(summaryTagCount).toBe(1)
  })
})

describe('context-pruner image token counting', () => {
  let mockAgentState: AgentState

  beforeEach(() => {
    mockAgentState = createMockAgentState([], 0)
  })

  const runHandleSteps = (
    messages: Message[],
    contextTokenCount?: number,
    maxContextLength?: number,
  ) => {
    mockAgentState.messageHistory = messages
    mockAgentState.contextTokenCount =
      contextTokenCount ?? Math.ceil(JSON.stringify(messages).length / 3)
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

  test('does not over-count image tokens', () => {
    // Create a message with a large base64 image
    const largeBase64Image = 'x'.repeat(300000) // Would be ~100k tokens if counted as text

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

    // With low contextTokenCount, should not trigger pruning
    const results = runHandleSteps([userMessageWithImage], 1000, 200000)

    expect(results).toHaveLength(1)
    // Message should be preserved without summarization
    expect(results[0].input.messages).toHaveLength(1)
    expect(results[0].input.messages[0].content[0].type).toBe('image')
  })
})

describe('context-pruner threshold behavior', () => {
  let mockAgentState: AgentState

  beforeEach(() => {
    mockAgentState = createMockAgentState([], 0)
  })

  const runHandleSteps = (
    messages: Message[],
    contextTokenCount: number,
    maxContextLength: number,
  ) => {
    mockAgentState.messageHistory = messages
    mockAgentState.contextTokenCount = contextTokenCount
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }
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
    return results
  }

  test('does not prune when under max limit minus fudge factor', () => {
    const messages = [
      createMessage('user', 'Hello'),
      createMessage('assistant', 'Hi'),
    ]

    // Set context to max limit minus fudge factor (1000) - should NOT prune
    // contextTokenCount + 1000 <= maxContextLength => 199000 + 1000 <= 200000
    const results = runHandleSteps(messages, 199000, 200000)

    // Should preserve original messages (not summarized)
    expect(results[0].input.messages).toHaveLength(2)
    expect(results[0].input.messages[0].role).toBe('user')
    expect(results[0].input.messages[1].role).toBe('assistant')
  })

  test('prunes when at max limit due to fudge factor', () => {
    const messages = [
      createMessage('user', 'Hello'),
      createMessage('assistant', 'Hi'),
    ]

    // Set context to exactly max limit - should prune due to 1000 token fudge factor
    // contextTokenCount + 1000 > maxContextLength => 200000 + 1000 > 200000
    const results = runHandleSteps(messages, 200000, 200000)

    // Should have summarized to single message
    expect(results[0].input.messages).toHaveLength(1)
    expect(results[0].input.messages[0].content[0].text).toContain(
      '<conversation_summary>',
    )
  })
})

describe('context-pruner str_replace and write_file tool results', () => {
  let mockAgentState: AgentState

  beforeEach(() => {
    mockAgentState = createMockAgentState([], 0)
  })

  const runHandleSteps = (messages: Message[]) => {
    mockAgentState.messageHistory = messages
    mockAgentState.contextTokenCount = 250000
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }
    const generator = contextPruner.handleSteps!({
      agentState: mockAgentState,
      logger: mockLogger,
      params: { maxContextLength: 200000 },
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

  test('includes str_replace diff in summary', () => {
    const messages = [
      createMessage('user', 'Edit this file'),
      createToolCallMessage('call-1', 'str_replace', {
        path: 'src/utils.ts',
        replacements: [{ old: 'foo', new: 'bar' }],
      }),
      createToolResultMessage('call-1', 'str_replace', {
        diff: '--- a/src/utils.ts\n+++ b/src/utils.ts\n@@ -1,1 +1,1 @@\n-foo\n+bar',
      }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('[EDIT RESULT]')
    expect(content).toContain('-foo')
    expect(content).toContain('+bar')
  })

  test('includes write_file diff in summary', () => {
    const messages = [
      createMessage('user', 'Create a new file'),
      createToolCallMessage('call-1', 'write_file', {
        path: 'src/new-file.ts',
        content: 'export const hello = "world"',
      }),
      createToolResultMessage('call-1', 'write_file', {
        diff: '--- /dev/null\n+++ b/src/new-file.ts\n@@ -0,0 +1 @@\n+export const hello = "world"',
      }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('[WRITE RESULT]')
    expect(content).toContain('+export const hello = "world"')
  })

  test('truncates very long str_replace diffs', () => {
    const longDiff = 'X'.repeat(3000)
    const messages = [
      createMessage('user', 'Make big changes'),
      createToolCallMessage('call-1', 'str_replace', {
        path: 'src/big-file.ts',
        replacements: [],
      }),
      createToolResultMessage('call-1', 'str_replace', {
        diff: longDiff,
      }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('[EDIT RESULT]')
    expect(content).toContain('...')
    // Should not contain the full diff
    expect(content).not.toContain(longDiff)
  })

  test('does not include edit result when no diff is present', () => {
    const messages = [
      createMessage('user', 'Edit file'),
      createToolCallMessage('call-1', 'str_replace', {
        path: 'src/file.ts',
        replacements: [],
      }),
      createToolResultMessage('call-1', 'str_replace', {
        success: true,
      }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    // Should have the tool call summary but not the result
    expect(content).toContain('Edited file: src/file.ts')
    expect(content).not.toContain('[EDIT RESULT]')
  })
})

describe('context-pruner glob and list_directory tools', () => {
  let mockAgentState: AgentState

  beforeEach(() => {
    mockAgentState = createMockAgentState([], 0)
  })

  const runHandleSteps = (messages: Message[]) => {
    mockAgentState.messageHistory = messages
    mockAgentState.contextTokenCount = 50000
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }
    const generator = contextPruner.handleSteps!({
      agentState: mockAgentState,
      logger: mockLogger,
      params: { maxContextLength: 10000 },
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

  test('summarizes glob tool with patterns', () => {
    const messages = [
      createMessage('user', 'Find files'),
      createToolCallMessage('call-1', 'glob', {
        patterns: [{ pattern: '*.ts' }, { pattern: '*.js' }],
      }),
      createToolResultMessage('call-1', 'glob', { files: [] }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('Glob: *.ts, *.js')
  })

  test('summarizes list_directory tool with paths', () => {
    const messages = [
      createMessage('user', 'List directories'),
      createToolCallMessage('call-1', 'list_directory', {
        directories: [{ path: 'src' }, { path: 'lib' }],
      }),
      createToolResultMessage('call-1', 'list_directory', { entries: [] }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('Listed dirs: src, lib')
  })

  test('summarizes read_subtree tool with paths', () => {
    const messages = [
      createMessage('user', 'Read subtree'),
      createToolCallMessage('call-1', 'read_subtree', {
        paths: ['src/components', 'src/utils'],
      }),
      createToolResultMessage('call-1', 'read_subtree', { tree: {} }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('Read subtree: src/components, src/utils')
  })
})
