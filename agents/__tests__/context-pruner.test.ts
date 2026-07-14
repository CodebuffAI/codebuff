import { describe, test, expect, beforeEach } from 'bun:test'

import contextPruner from '../context-pruner'

import type { AgentState } from '../types/agent-definition'
import type { JSONValue, Message, ToolMessage } from '../types/util-types'

function withCommittedReceipt(value: any): any {
  const receiptId = `${value.operationId}:receipt`
  return {
    ...value,
    receiptId,
    authorityReceipt: {
      kind: 'commit_receipt',
      version: 1,
      receiptId,
      operationId: value.operationId,
      callId: `${value.operationId}:call`,
      authorityTier: value.authorityTier,
      status: 'committed',
      actions: value.actions.map((action: any) => ({
        ...action,
        status: 'committed',
      })),
      finalHashes: Object.fromEntries(
        value.actions.map((action: any) => [action.path, action.afterHash]),
      ),
    },
  }
}

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
    budgets?: {
      assistantToolBudget?: number
      userBudget?: number
      toolFactsBudget?: number
    },
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
      params: {
        ...(maxContextLength ? { maxContextLength } : {}),
        ...budgets,
      },
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

  test('does not summarize on cache-TTL expiry alone when under token threshold (M1 regression)', () => {
    // M1: cache-TTL expiry (cacheWillMiss) must no longer trigger
    // summarization. Only token-pressure triggers summarization. This
    // preserves stable cache prefixes instead of destroying them on every
    // 5-min idle gap — the root cause of the "cache fills up fast" symptom.
    const now = Date.now()
    const messages = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Earlier turn' }],
        sentAt: now - 10 * 60 * 1000,
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Earlier response' }],
        sentAt: now - 9 * 60 * 1000,
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'User message after a long pause' }],
        tags: ['USER_PROMPT'],
        sentAt: now,
      },
    ] as Message[]

    // Token count well under threshold (1000 << 140000 default). The 9-min
    // gap between the USER_PROMPT and the preceding assistant message makes
    // cacheWillMiss true. Don't pass maxContextLength so STEP 0 doesn't strip
    // the USER_PROMPT (params would be empty, not removing any tags).
    const results = runHandleSteps(messages, 1000)

    expect(results).toHaveLength(1)
    expect(results[0].toolName).toBe('set_messages')

    // History is preserved — NOT collapsed into a single summary blob.
    const resultMessages = results[0].input.messages
    expect(resultMessages.length).toBeGreaterThan(1)
    expect(resultMessages[0].content[0].text).not.toContain(
      '<conversation_summary>',
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

    // Should use a memory artifact format, not transcript role markers
    expect(content).toContain('<historical_memory>')
    expect(content).toContain('[USER]')
    expect(content).toContain('Progress note:')
    expect(content).not.toContain('[ASSISTANT]')
  })

  test('includes tool call summaries in the output', () => {
    const messages = [
      createMessage('user', 'Read these files'),
      createToolCallMessage('call-1', 'read_files', {
        paths: ['file1.ts', 'file2.ts'],
      }),
      createToolResultMessage('call-1', 'read_files', {
        content: 'file data',
      } as JSONValue),
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
    expect(content).toContain('inspected files: file1.ts, file2.ts')
    expect(content).toContain('edited file: file1.ts')
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

    expect(content).toContain('wrote file: new-file.ts')
    expect(content).toContain('ran command: npm test')
    expect(content).toContain('code search for "function"')
    expect(content).toContain('delegated agents:')
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

    expect(content).toContain('Tool error from read_files: File not found')
  })

  test('records only successfully read paths from a mixed read_files result', () => {
    const messages = [
      createMessage('user', 'Inspect both files'),
      createToolCallMessage('call-1', 'read_files', {
        paths: ['good.ts', 'missing.ts'],
      }),
      createToolResultMessage('call-1', 'read_files', [
        { summary: { ok: 1, failed: 1, requested: 2 } },
        { path: 'good.ts', content: 'export const good = true' },
        {
          path: 'missing.ts',
          content: '[FILE_DOES_NOT_EXIST] File not found',
        },
      ]),
    ]

    const results = runHandleSteps(messages, 50000, 10000)
    const content = results[0].input.messages[0].content[0].text
    const knowledgeMemory =
      content.match(/<knowledge_memory>([\s\S]*?)<\/knowledge_memory>/)?.[1] ??
      ''

    expect(knowledgeMemory).toContain('good.ts')
    expect(knowledgeMemory).not.toContain('missing.ts')
    expect(content).toContain(
      'Tool error from read_files: 1 of 2 requested read(s) failed.',
    )
    expect(content).toContain('[FILE_DOES_NOT_EXIST] File not found')
  })

  test('uses canonical read status and preserves typed error details', () => {
    const messages = [
      createMessage('user', 'Inspect both files'),
      createToolCallMessage('call-1', 'read_files', {
        paths: ['good.ts', 'missing.ts'],
      }),
      createToolResultMessage('call-1', 'read_files', {
        kind: 'read_files_result',
        version: 1,
        status: 'partial',
        summary: {
          requested: 2,
          ok: 1,
          partial: 0,
          failed: 1,
          uniquePaths: 2,
        },
        results: [
          {
            selector: 'file',
            requestIndex: 0,
            path: 'good.ts',
            status: 'ok',
            content: 'export const good = true',
            complete: true,
            template: false,
          },
          {
            selector: 'file',
            requestIndex: 1,
            path: 'missing.ts',
            status: 'error',
            error: {
              code: 'not_found',
              message: 'missing.ts does not exist',
              retryable: true,
              recovery: 'discover_path',
            },
          },
        ],
      }),
    ]

    const results = runHandleSteps(messages, 50000, 10000)
    const content = results[0].input.messages[0].content[0].text
    const knowledgeMemory =
      content.match(/<knowledge_memory>([\s\S]*?)<\/knowledge_memory>/)?.[1] ??
      ''

    expect(knowledgeMemory).toContain('good.ts')
    expect(knowledgeMemory).not.toContain('missing.ts')
    expect(content).toContain('missing.ts does not exist')
  })

  test('requires a matching successful result before persisting read/edit facts', () => {
    const longFailure =
      'ATOMIC_FAILURE_HEAD\n' +
      'x'.repeat(3000) +
      '\nRECOVERY_TAIL: re-read the exact range'
    const messages = [
      createMessage('user', 'Read and edit the file'),
      createToolCallMessage('read-call', 'read_files', {
        paths: ['never-read.ts'],
      }),
      createToolResultMessage('different-read-call', 'read_files', {
        content: 'orphan result',
      }),
      createToolCallMessage('failed-edit', 'str_replace', {
        path: 'unchanged.ts',
        replacements: [],
      }),
      createToolResultMessage('failed-edit', 'str_replace', {
        file: 'unchanged.ts',
        errorMessage: longFailure,
      }),
      createToolCallMessage('successful-edit', 'write_file', {
        path: 'changed.ts',
        content: 'export const changed = true',
      }),
      createToolResultMessage(
        'successful-edit',
        'write_file',
        withCommittedReceipt({
          kind: 'file_mutation_result',
          version: 1,
          operationId: 'successful-edit',
          outcome: 'applied',
          authorityTier: 'portable_path',
          actions: [
            {
              actionId: 'successful-edit:0',
              index: 0,
              action: 'create',
              path: 'changed.ts',
              outcome: 'applied',
              beforeHash: null,
              afterHash: 'after',
            },
          ],
          errors: [],
          freshCapabilities: [],
        }),
      ),
    ]

    const results = runHandleSteps(messages, 50000, 10000)
    const content = results[0].input.messages[0].content[0].text
    const knowledgeMemory =
      content.match(/<knowledge_memory>([\s\S]*?)<\/knowledge_memory>/)?.[1] ??
      ''

    expect(knowledgeMemory).not.toContain('never-read.ts')
    expect(knowledgeMemory).not.toContain('unchanged.ts')
    expect(knowledgeMemory).toContain('changed.ts: write_file')
    expect(content).toContain(
      'Tool error from str_replace: ATOMIC_FAILURE_HEAD',
    )
    expect(content).toContain('RECOVERY_TAIL: re-read the exact range')
    expect(content).toContain('[...truncated')
    expect(content).not.toContain('x'.repeat(2500))
  })

  test('treats applied false edit results as failures, not edits made', () => {
    const messages = [
      createMessage('user', 'Apply the smart patch'),
      createToolCallMessage('call-1', 'apply_smart_patch', {
        path: 'src/conflict.ts',
        patch: '@@ -1 +1 @@\n-old\n+new',
      }),
      createToolResultMessage('call-1', 'apply_smart_patch', {
        file: 'src/conflict.ts',
        applied: false,
        message: 'Smart patch conflict. No changes were written.',
      }),
    ]

    const results = runHandleSteps(messages, 50000, 10000)
    const content = results[0].input.messages[0].content[0].text
    const knowledgeMemory =
      content.match(/<knowledge_memory>([\s\S]*?)<\/knowledge_memory>/)?.[1] ??
      ''

    expect(knowledgeMemory).not.toContain('src/conflict.ts')
    expect(content).toContain(
      'Tool error from apply_smart_patch: Smart patch conflict.',
    )
    expect(content).toContain('Edit result from apply_smart_patch:')
  })

  test('does not classify negated success wording as an applied edit', () => {
    const messages = [
      createMessage('user', 'Apply the patch'),
      createToolCallMessage('call-negated', 'apply_patch', {
        operation: {
          type: 'update_file',
          path: 'src/not-applied.ts',
          diff: '@@ -1 +1 @@\n-old\n+new',
        },
      }),
      createToolResultMessage('call-negated', 'apply_patch', {
        file: 'src/not-applied.ts',
        message: 'Patch was not applied successfully.',
      }),
    ]

    const results = runHandleSteps(messages, 50000, 10000)
    const content = results[0].input.messages[0].content[0].text
    const knowledgeMemory =
      content.match(/<knowledge_memory>([\s\S]*?)<\/knowledge_memory>/)?.[1] ??
      ''

    expect(knowledgeMemory).not.toContain('src/not-applied.ts')
    expect(content).toContain(
      'Tool error from apply_patch: Patch was not applied successfully.',
    )
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

    expect(content).toContain('[USER] [image(s) were attached]')
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

  test('preserves tagged live user prompt as a real message after summary', () => {
    const liveUserPrompt: Message = {
      role: 'user',
      content: [{ type: 'text', text: 'LATEST LIVE REQUEST' }],
      tags: ['USER_PROMPT'],
    }
    const instructionsPrompt: Message = {
      role: 'user',
      content: [{ type: 'text', text: 'Parent instructions' }],
      tags: ['INSTRUCTIONS_PROMPT'],
    }
    const prunerParamsPrompt: Message = {
      role: 'user',
      content: [{ type: 'text', text: '{"maxContextLength":200000}' }],
      tags: ['USER_PROMPT'],
    }
    const messages: Message[] = [
      createMessage('user', 'Older request'),
      createMessage('assistant', 'Older answer'),
      liveUserPrompt,
      instructionsPrompt,
      prunerParamsPrompt,
    ]

    const results = runHandleSteps(messages, 250000, 200000)
    const resultMessages = results[0].input.messages

    expect(resultMessages).toHaveLength(2)
    const summaryContent = (resultMessages[0].content[0] as { text: string })
      .text
    expect(summaryContent).toContain('Older request')
    expect(summaryContent).toContain('Goal:\n  LATEST LIVE REQUEST')
    expect(
      summaryContent.replace(
        /<knowledge_memory>[\s\S]*?<\/knowledge_memory>/g,
        '',
      ),
    ).not.toContain('LATEST LIVE REQUEST')
    expect(resultMessages[1]).toEqual(
      expect.objectContaining({
        role: 'user',
        tags: ['USER_PROMPT'],
      }),
    )
    expect((resultMessages[1].content[0] as { text: string }).text).toBe(
      'LATEST LIVE REQUEST',
    )
  })

  test('keeps live user prompt in memory and adds continuation prompt when pruning mid-turn', () => {
    const liveUserPrompt: Message = {
      role: 'user',
      content: [{ type: 'text', text: 'PLEASE FIX THE BUG' }],
      tags: ['USER_PROMPT'],
    }
    const prunerParamsPrompt: Message = {
      role: 'user',
      content: [{ type: 'text', text: '{"maxContextLength":200000}' }],
      tags: ['USER_PROMPT'],
    }
    const messages: Message[] = [
      liveUserPrompt,
      createMessage('assistant', 'I found the likely issue.'),
      createToolCallMessage('call-1', 'read_files', {
        paths: ['src/bug.ts'],
      }),
      createToolResultMessage('call-1', 'read_files', {
        content: 'buggy code',
      }),
      prunerParamsPrompt,
    ]

    const results = runHandleSteps(messages, 250000, 200000)
    const resultMessages = results[0].input.messages

    expect(resultMessages).toHaveLength(2)
    const summaryContent = (resultMessages[0].content[0] as { text: string })
      .text
    expect(summaryContent).toContain('PLEASE FIX THE BUG')
    expect(summaryContent).toContain('I found the likely issue.')
    expect(summaryContent).toContain('inspected files: src/bug.ts')

    expect(resultMessages[1].role).toBe('user')
    expect(resultMessages[1].tags).toBeUndefined()
    const continuationText = (resultMessages[1].content[0] as { text: string })
      .text
    expect(continuationText).toContain('Continue the existing assistant turn')
    expect(continuationText).toContain('Do not restart completed work')
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

    expect(content).toContain('delegated agent file-picker')
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
      'ran command: npm run build -- --config=production --verbose --o...',
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

    expect(content).toContain('used tool unknown_tool_name')
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
    expect(content).toContain('inspected files: a.ts')
    expect(content).toContain('inspected files: b.ts')
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
    expect(content).toContain('inspected files: test.ts')
  })

  test('pins literal reviewer blocker lines under tight budgets and repeated compaction', () => {
    const firstMessages = [
      createMessage('user', 'Implement the feature'),
      createMessage(
        'user',
        [
          'Harness pinned active-work state (controlling state; do not ignore):',
          'Open reviewer blockers/feedback (verbatim; controlling next action):',
          'BLOCKING: Preserve this exact reviewer blocker text.',
          'NON_BLOCKING: Also preserve this exact suggestion.',
          'Changed files: src/feature.ts',
          'Touched files: src/feature.ts, src/feature.test.ts',
          'Next required action: Resolve the reviewer feedback below before any unrelated work.',
        ].join('\n'),
      ),
      createMessage('assistant', 'x'.repeat(2000)),
    ]

    const firstResults = runHandleSteps(firstMessages, 250000, 200000, {
      assistantToolBudget: 1,
      userBudget: 1,
    })
    const firstContent = firstResults[0].input.messages[0].content[0].text
    expect(firstContent).toContain('<pinned_active_work_state>')
    expect(firstContent).toContain(
      'BLOCKING: Preserve this exact reviewer blocker text.',
    )
    expect(firstContent).not.toContain(
      'NON_BLOCKING: Also preserve this exact suggestion.',
    )

    const secondResults = runHandleSteps(
      [
        firstResults[0].input.messages[0],
        createMessage('assistant', 'more work'),
      ],
      250000,
      200000,
      { assistantToolBudget: 1, userBudget: 1 },
    )
    const secondContent = secondResults[0].input.messages[0].content[0].text
    expect(secondContent).toContain(
      'BLOCKING: Preserve this exact reviewer blocker text.',
    )
    expect(secondContent).not.toContain(
      'NON_BLOCKING: Also preserve this exact suggestion.',
    )
    expect(
      secondContent.match(
        /BLOCKING: Preserve this exact reviewer blocker text\./g,
      ),
    ).toHaveLength(1)
  })

  test('pins plan-declared open questions (header + Q\d bullets) across compaction', () => {
    const firstMessages = [
      createMessage('user', 'Resume the harness review'),
      createMessage(
        'user',
        [
          'Harness pinned active-work state (controlling state; do not ignore):',
          'Open questions (block Milestone 4):',
          '- Q2 \u2014 docs/harness-card.md: top-level contributor doc or per-agent artifact?',
          '- Q3 \u2014 should Fix B live in base2 gate-state or run-agent-step?',
          'Next required action: Resolve Q2 with the user before starting Milestone 4.',
        ].join('\n'),
      ),
      createMessage('assistant', 'x'.repeat(2000)),
    ]

    const firstResults = runHandleSteps(firstMessages, 250000, 200000, {
      assistantToolBudget: 1,
      userBudget: 1,
    })
    const firstContent = firstResults[0].input.messages[0].content[0].text
    expect(firstContent).toContain('<pinned_active_work_state>')
    expect(firstContent).toContain('Open questions (block Milestone 4):')
    expect(firstContent).toContain(
      '- Q2 \u2014 docs/harness-card.md: top-level contributor doc or per-agent artifact?',
    )
    expect(firstContent).toContain(
      '- Q3 \u2014 should Fix B live in base2 gate-state or run-agent-step?',
    )
    expect(firstContent).toContain(
      'Next required action: Resolve Q2 with the user before starting Milestone 4.',
    )

    const secondResults = runHandleSteps(
      [
        firstResults[0].input.messages[0],
        createMessage('assistant', 'more work'),
      ],
      250000,
      200000,
      { assistantToolBudget: 1, userBudget: 1 },
    )
    const secondContent = secondResults[0].input.messages[0].content[0].text
    expect(secondContent).toContain('Open questions (block Milestone 4):')
    expect(secondContent).toContain(
      '- Q2 \u2014 docs/harness-card.md: top-level contributor doc or per-agent artifact?',
    )
    expect(secondContent).toContain(
      'Next required action: Resolve Q2 with the user before starting Milestone 4.',
    )
  })

  test('pins structured <knowledge_memory> block verbatim across repeated compaction (M5 regression)', () => {
    // M5: A structured <knowledge_memory> block (Goal, Decisions, Files
    // Inspected, Edits Made, Validation Results, Blockers, Next Action) must be
    // emitted on compaction and preserved verbatim across a second compaction.
    // This is the root-cause fix for post-compaction amnesia: the extractive
    // summary dropped file bodies and evidence, leaving only path stubs.
    const firstMessages = [
      createMessage(
        'user',
        'Refactor the cache-control anchors in messages.ts',
      ),
      createMessage(
        'assistant',
        [
          'Decision: use a 3-anchor stable-prefix strategy instead of 4 volatile-tail anchors.',
          'I will read the current anchor code, then rewrite the loop.',
        ].join('\n'),
      ),
      createToolCallMessage('call-1', 'read_files', {
        paths: ['common/src/util/messages.ts'],
      }),
      createToolResultMessage('call-1', 'read_files', {
        ok: 1,
      }),
      createToolCallMessage('call-2', 'str_replace', {
        path: 'common/src/util/messages.ts',
        replacements: [],
      }),
      createToolResultMessage(
        'call-2',
        'str_replace',
        withCommittedReceipt({
          kind: 'file_mutation_result',
          version: 1,
          operationId: 'call-2',
          outcome: 'applied',
          authorityTier: 'portable_path',
          actions: [
            {
              actionId: 'call-2:0',
              index: 0,
              action: 'update',
              path: 'common/src/util/messages.ts',
              outcome: 'applied',
              beforeHash: 'before',
              afterHash: 'after',
            },
          ],
          errors: [],
          freshCapabilities: [],
        }),
      ),
      createToolCallMessage('call-3', 'run_terminal_command', {
        command: 'bun test util/__tests__/messages.test.ts',
      }),
      createToolResultMessage('call-3', 'run_terminal_command', {
        exitCode: 0,
        command: 'bun test util/__tests__/messages.test.ts',
      }),
      createMessage('assistant', 'x'.repeat(2000)),
    ]

    const firstResults = runHandleSteps(firstMessages, 250000, 200000, {
      assistantToolBudget: 1,
      userBudget: 1,
    })
    const firstContent = firstResults[0].input.messages[0].content[0].text

    // The <knowledge_memory> block is emitted.
    expect(firstContent).toContain('<knowledge_memory>')
    expect(firstContent).toContain('</knowledge_memory>')
    // Structured fields are populated from the tool calls above.
    expect(firstContent).toContain('Goal:')
    expect(firstContent).toMatch(/Decision:.*stable-prefix strategy/)
    expect(firstContent).toContain('Files Inspected:')
    expect(firstContent).toContain('common/src/util/messages.ts')
    expect(firstContent).toContain('Edits Made:')
    expect(firstContent).toContain('Validation Results:')
    expect(firstContent).toContain('exit 0')

    // Second compaction: feed the first summary back in. The structured
    // block must survive verbatim (parsed and re-emitted), not be lost.
    const secondResults = runHandleSteps(
      [
        firstResults[0].input.messages[0],
        createMessage('assistant', 'more work'),
      ],
      250000,
      200000,
      { assistantToolBudget: 1, userBudget: 1 },
    )
    const secondContent = secondResults[0].input.messages[0].content[0].text
    expect(secondContent).toContain('<knowledge_memory>')
    expect(secondContent).toContain('Goal:')
    expect(secondContent).toMatch(/Decision:.*stable-prefix strategy/)
    expect(secondContent).toContain('common/src/util/messages.ts')
    expect(secondContent).toContain('exit 0')
    // No duplicate emission of the block (RISK2: rolling eviction keeps one).
    expect(secondContent.match(/<knowledge_memory>/g)).toHaveLength(1)
  })

  test('does not pin edited file and task ledger entries without active harness blockers', () => {
    const messages = [
      createMessage('user', 'Implement ledger preservation'),
      createToolCallMessage('call-1', 'read_files', {
        paths: ['agents/base2/base2.ts'],
      }),
      createToolCallMessage('call-2', 'str_replace', {
        path: 'agents/base2/base2.ts',
        replacements: [],
      }),
      createToolResultMessage('call-2', 'str_replace', {
        file: 'agents/base2/base2.ts',
        success: true,
      }),
      createToolCallMessage('call-3', 'write_todos', {
        todos: [
          { task: 'Track active work state', completed: true },
          { task: 'Resolve reviewer blockers', completed: false },
        ],
      }),
      createMessage('assistant', 'y'.repeat(2000)),
    ]

    const results = runHandleSteps(messages, 250000, 200000, {
      assistantToolBudget: 1,
      userBudget: 1,
    })
    const content = results[0].input.messages[0].content[0].text

    expect(content).not.toContain('<pinned_active_work_state>')
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
    maxContextLength?: number,
    budgets?: {
      assistantToolBudget?: number
      userBudget?: number
      toolFactsBudget?: number
    },
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
      params: {
        ...(maxContextLength !== undefined ? { maxContextLength } : {}),
        ...budgets,
      },
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
    // Create a message that exceeds the user message token limit (~13k tokens = ~39k chars)
    const longText = 'A'.repeat(45000)
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

    expect(content).toContain('code search for "myFunction" (-g *.ts -i)')
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

    expect(content).toContain('User answered: Option B was selected')
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

    expect(content).toContain('User answered: Caching, Logging, Monitoring')
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

    expect(content).toContain('User skipped question')
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

    expect(content).toContain('Command failed with exit code: 1')
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

    expect(content).not.toContain('Command failed with exit code')
  })
})

describe('context-pruner spawn_agents with prompt and params', () => {
  let mockAgentState: AgentState

  beforeEach(() => {
    mockAgentState = createMockAgentState([], 0)
  })

  const runHandleSteps = (
    messages: Message[],
    contextTokenCount = 250000,
    maxContextLength = 200000,
    budgets?: {
      assistantToolBudget?: number
      userBudget?: number
      toolFactsBudget?: number
    },
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
      params: { maxContextLength, ...budgets },
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

  test('forces above-threshold discovery compaction and preserves facts for resumed work', () => {
    const constraint =
      'CONSTRAINT_CONTEXT_RECALL: semantic compaction must run before mechanical trimming.'
    const messages = [
      createMessage(
        'user',
        `Find authentication implementation files. ${constraint}`,
      ),
      createToolCallMessage('call-picker', 'spawn_agents', {
        agents: [
          {
            agent_type: 'file-picker',
            prompt: 'Find authentication implementation files',
          },
        ],
      }),
      createToolResultMessage('call-picker', 'spawn_agents', [
        {
          agentType: 'file-picker',
          value: {
            type: 'structuredOutput',
            value: {
              files: [
                {
                  path: 'src/auth/session.ts',
                  summary: 'Owns session creation and refresh behavior.',
                },
              ],
            },
          },
        },
      ]),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('src/auth/session.ts')
    expect(content).toContain('Owns session creation and refresh behavior.')
    expect(content).toContain('(discovered by file-picker)')
    expect(content).toContain(constraint)

    const resumed = runHandleSteps(
      [
        createMessage('user', content),
        createMessage(
          'user',
          'Continue implementation using the retained discovery evidence.',
        ),
      ],
      250000,
      200000,
    )[0].input.messages[0].content[0].text
    expect(resumed).toContain('src/auth/session.ts')
    expect(resumed).toContain(constraint)
    expect(resumed).toContain('(discovered by file-picker)')
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

    // Should be truncated to the compact spawn prompt limit + ...
    expect(content).toContain('...')
    expect(content).not.toContain(longPrompt) // Full prompt should not be there
  })

  test('preserves actionable reviewer findings without generic agent results', () => {
    const messages: Message[] = [
      createMessage('user', 'Review the edits'),
      createToolCallMessage('call-1', 'spawn_agents', {
        agents: [
          { agent_type: 'code-reviewer' },
          { agent_type: 'security-reviewer' },
        ],
      }),
      createToolResultMessage('call-1', 'spawn_agents', [
        {
          agentType: 'code-reviewer',
          value: {
            type: 'object',
            value: {
              findings: [
                {
                  severity: 'BLOCKING',
                  summary:
                    'BLOCKING: Fix src/review.ts null guard before finalizing.',
                },
              ],
            },
          },
        },
        {
          agentType: 'security-reviewer',
          value: {
            type: 'object',
            value: {
              findings: [
                {
                  severity: 'SECURITY',
                  summary: 'SECURITY: Escape redirect target in src/auth.ts.',
                },
              ],
            },
          },
        },
      ]),
    ]

    const results = runHandleSteps(messages, 250000, 200000, {
      assistantToolBudget: 1,
      userBudget: 1,
      toolFactsBudget: 1,
    })
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('Reviewer findings from code-reviewer:')
    expect(content).toContain(
      'BLOCKING: Fix src/review.ts null guard before finalizing.',
    )
    expect(content).toContain('Reviewer findings from security-reviewer:')
    expect(content).toContain(
      'SECURITY: Escape redirect target in src/auth.ts.',
    )
    expect(content).toContain('<knowledge_memory>')
    expect(content).toContain('Blockers:')
    expect(content).toContain(
      'code-reviewer: BLOCKING: Fix src/review.ts null guard before finalizing.',
    )
    expect(content).toContain(
      'security-reviewer: SECURITY: Escape redirect target in src/auth.ts.',
    )
    expect(content).not.toContain('Agent results:')
  })

  test('limits long todo summaries to active tasks', () => {
    const todos = Array.from({ length: 12 }, (_, i) => ({
      task: `Todo ${i + 1}`,
      completed: false,
    }))
    const messages = [
      createMessage('user', 'Plan the work'),
      createToolCallMessage('call-1', 'write_todos', { todos }),
      createToolResultMessage('call-1', 'write_todos', { success: true }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('Todos: 0/12 complete')
    expect(content).toContain('- Todo 8')
    expect(content).toContain('- ...4 more not shown')
    expect(content).not.toContain('- Todo 9')
  })

  test('does not pin stale completed todos or historical completed work', () => {
    const messages = [
      createMessage(
        'assistant',
        [
          'Todos: 417/821 complete',
          '- Old completed task',
          'Remaining: none',
          'Historical changed files: src/old.ts',
          'Historical touched files: src/old.ts',
          'Latest work summary: Previous completed work touched: src/old.ts',
          'Harness pinned active-work state (controlling state; do not ignore):',
          'Current phase: final_response_allowed',
        ].join('\n'),
      ),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).not.toContain('<pinned_active_work_state>')
    expect(content).not.toContain('Todos: 417/821 complete')
    expect(content).not.toContain('Remaining: none')
    expect(content).not.toContain('Historical changed files: src/old.ts')
    expect(content).not.toContain(
      'Latest work summary: Previous completed work',
    )
  })

  test('preserves incomplete workflow todo progress even when gate phase is final-response allowed', () => {
    const messages = [
      createMessage(
        'user',
        [
          'Harness pinned active-work state (controlling state; do not ignore):',
          'This generated state survives context compaction and overrides stale summarized dialogue.',
          'Current phase: final_response_allowed',
          'Workflow todo progress (authoritative resumable state):',
          'Completed 1/3.',
          'Next workflow action: Apply a targeted guard/fix with focused regression coverage',
          'Continue from this item; do not restart earlier completed workflow steps. Mark this item complete with write_todos once it is actually completed before moving to a different workflow item.',
        ].join('\n'),
      ),
      createMessage('assistant', 'y'.repeat(2000)),
    ]

    const results = runHandleSteps(messages, 250000, 200000, {
      assistantToolBudget: 1,
      userBudget: 1,
    })
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('<pinned_active_work_state>')
    expect(content).toContain('Current phase: final_response_allowed')
    expect(content).toContain(
      'Workflow todo progress (authoritative resumable state):',
    )
    expect(content).toContain('Completed 1/3.')
    expect(content).toContain(
      'Next workflow action: Apply a targeted guard/fix with focused regression coverage',
    )
    expect(content).toContain(
      'Continue from this item; do not restart earlier completed workflow steps.',
    )
    expect(content.match(/Next workflow action:/g)).toHaveLength(1)
  })

  test('does not preserve completed workflow todo progress in final-response allowed state', () => {
    const messages = [
      createMessage(
        'user',
        [
          'Harness pinned active-work state (controlling state; do not ignore):',
          'Current phase: final_response_allowed',
          'Workflow todo progress (authoritative resumable state):',
          'Completed 3/3.',
          'Next workflow action:',
          'Continue from this item; do not restart earlier completed workflow steps. Mark this item complete with write_todos once it is actually completed before moving to a different workflow item.',
        ].join('\n'),
      ),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).not.toContain('<pinned_active_work_state>')
    expect(content).not.toContain('Workflow todo progress')
    expect(content).not.toContain('Completed 3/3.')
    expect(content).not.toContain('Next workflow action:')
  })

  test('does not preserve user-message NON_BLOCKING-only active work as pinned or regular summary text', () => {
    const messages = [
      createMessage(
        'user',
        [
          'Harness pinned active-work state (controlling state; do not ignore):',
          'Current phase: final_response_allowed',
          'Open reviewer blockers/feedback (verbatim; controlling next action):',
          'NON_BLOCKING: Consider a follow-up polish pass.',
          'Pending validation/reviewer gate files: src/stale.ts',
          'Next required action: Resolve stale feedback before finalizing.',
          'Last validation summary: Automated validation and reviewer gate passed.',
          'Todos: 10/10 complete',
          '- Old completed task',
        ].join('\n'),
      ),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).not.toContain('<pinned_active_work_state>')
    expect(content).not.toContain('Harness pinned active-work state')
    expect(content).not.toContain(
      'NON_BLOCKING: Consider a follow-up polish pass.',
    )
    expect(content).not.toContain(
      'Pending validation/reviewer gate files: src/stale.ts',
    )
    expect(content).not.toContain(
      'Next required action: Resolve stale feedback before finalizing.',
    )
    expect(content).not.toContain('Current phase: final_response_allowed')
    expect(content).not.toContain('Todos: 10/10 complete')
    expect(content).not.toContain('- Old completed task')
  })

  test('preserves current pending state when stale finalization text appears earlier in the same user summary', () => {
    const messages = [
      createMessage(
        'user',
        [
          'Harness pinned active-work state (controlling state; do not ignore):',
          'Current phase: final_response_allowed',
          'Pending validation/reviewer gate files: src/stale.ts',
          'Next required action: Stale finalization action.',
          'Harness pinned active-work state (controlling state; do not ignore):',
          'Current phase: awaiting_validation',
          'Pending validation/reviewer gate files: src/current.ts',
          'Next required action: Run validation for current work.',
        ].join('\n'),
      ),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('<pinned_active_work_state>')
    expect(content).toContain('Current phase: awaiting_validation')
    expect(content).toContain(
      'Pending validation/reviewer gate files: src/current.ts',
    )
    expect(content).toContain(
      'Next required action: Run validation for current work.',
    )
    expect(content).not.toContain('Current phase: final_response_allowed')
    expect(content).not.toContain(
      'Pending validation/reviewer gate files: src/stale.ts',
    )
    expect(content).not.toContain(
      'Next required action: Stale finalization action.',
    )
  })

  test('pins active harness phase and blocker lines', () => {
    const messages = [
      createMessage(
        'assistant',
        [
          'Harness pinned active-work state (controlling state; do not ignore):',
          'Current phase: blocked',
          'Open reviewer blockers/feedback (verbatim; controlling next action):',
          'BLOCKING: Fix src/current.ts before finalizing.',
          'Pending validation/reviewer gate files: src/current.ts',
          'Next required action: Resolve the reviewer feedback.',
          'Historical changed files: src/old.ts',
          'Latest work summary: Old completed edit',
        ].join('\n'),
      ),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('<pinned_active_work_state>')
    expect(content).toContain('Current phase: blocked')
    expect(content).toContain('BLOCKING: Fix src/current.ts before finalizing.')
    expect(content).toContain(
      'Pending validation/reviewer gate files: src/current.ts',
    )
    expect(content).toContain(
      'Next required action: Resolve the reviewer feedback.',
    )
    expect(content).not.toContain('Historical changed files: src/old.ts')
    expect(content).not.toContain('Latest work summary: Old completed edit')
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
    maxContextLength?: number,
    budgets?: {
      assistantToolBudget?: number
      userBudget?: number
      toolFactsBudget?: number
    },
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
      params: {
        ...(maxContextLength !== undefined ? { maxContextLength } : {}),
        ...budgets,
      },
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

  test('preserves reviewer blockers across repeated tight compaction', () => {
    const simulateCompaction = (
      inputMessages: Message[],
      budgets: {
        assistantToolBudget: number
        userBudget: number
        toolFactsBudget: number
      },
    ): Message => {
      const result = runHandleSteps(inputMessages, 250000, 200000, budgets)
      return result[0].input.messages[0]
    }

    const tightBudgets = {
      assistantToolBudget: 1,
      userBudget: 1,
      toolFactsBudget: 1,
    }
    const reviewerMessages: Message[] = [
      createMessage('user', 'Review the current implementation'),
      createToolCallMessage('call-1', 'spawn_agents', {
        agents: [
          { agent_type: 'code-reviewer' },
          { agent_type: 'security-reviewer' },
        ],
      }),
      createToolResultMessage('call-1', 'spawn_agents', [
        {
          agentType: 'code-reviewer',
          value: {
            type: 'object',
            value: {
              findings: [
                {
                  severity: 'BLOCKING',
                  summary:
                    'BLOCKING: Fix src/rerun.ts aux flag reset before finalizing.',
                },
              ],
            },
          },
        },
        {
          agentType: 'security-reviewer',
          value: {
            type: 'object',
            value: {
              findings: [
                {
                  severity: 'SECURITY',
                  summary:
                    'SECURITY: Validate src/auth.ts token audience before merge.',
                },
              ],
            },
          },
        },
      ]),
      createMessage('user', 'Large follow-up ' + 'x'.repeat(2000)),
      createMessage('assistant', 'Large response ' + 'y'.repeat(2000)),
    ]

    const summary1 = simulateCompaction(reviewerMessages, tightBudgets)
    const summary2 = simulateCompaction(
      [
        summary1,
        createMessage('user', 'Another large follow-up ' + 'z'.repeat(2000)),
        createMessage(
          'assistant',
          'Another large response ' + 'q'.repeat(2000),
        ),
      ],
      tightBudgets,
    )
    const summary3 = simulateCompaction(
      [
        summary2,
        createMessage('user', 'Final large follow-up ' + 'r'.repeat(2000)),
        createMessage('assistant', 'Final large response ' + 's'.repeat(2000)),
      ],
      tightBudgets,
    )
    const summary3Text = (summary3.content[0] as { type: 'text'; text: string })
      .text

    expect(summary3Text).toContain('<knowledge_memory>')
    expect(summary3Text).toContain('Blockers:')
    expect(summary3Text).toContain(
      'code-reviewer: BLOCKING: Fix src/rerun.ts aux flag reset before finalizing.',
    )
    expect(summary3Text).toContain(
      'security-reviewer: SECURITY: Validate src/auth.ts token audience before merge.',
    )
    expect(summary3Text).toContain('Reviewer findings from code-reviewer:')
    expect(summary3Text).toContain(
      'BLOCKING: Fix src/rerun.ts aux flag reset before finalizing.',
    )
    expect(summary3Text).toContain('Reviewer findings from security-reviewer:')
    expect(summary3Text).toContain(
      'SECURITY: Validate src/auth.ts token audience before merge.',
    )
    expect(summary3Text).not.toContain('Agent results:')
  })

  test('drops old entries each cycle when budgets are tight', () => {
    const simulateCompaction = (
      inputMessages: Message[],
      budgets: {
        assistantToolBudget: number
        userBudget: number
        toolFactsBudget?: number
      },
    ): Message => {
      const result = runHandleSteps(inputMessages, 250000, 200000, budgets)
      return result[0].input.messages[0]
    }

    const tightBudgets = { assistantToolBudget: 20, userBudget: 15 }

    // === CYCLE 1: 3 pairs of messages, tight budgets drop the oldest ===
    const cycle1Messages = [
      createMessage('user', 'Cycle1-Request-A'),
      createMessage('assistant', 'Cycle1-Response-A'),
      createMessage('user', 'Cycle1-Request-B'),
      createMessage('assistant', 'Cycle1-Response-B'),
      createMessage('user', 'Cycle1-Request-C'),
      createMessage('assistant', 'Cycle1-Response-C'),
    ]
    const summary1 = simulateCompaction(cycle1Messages, tightBudgets)
    const summary1Text = (summary1.content[0] as { type: 'text'; text: string })
      .text

    // Most recent entries should survive
    expect(summary1Text).toContain('Cycle1-Request-C')
    expect(summary1Text).toContain('Cycle1-Response-C')
    // Oldest entries should be dropped from the entry walk. M5 may pin the
    // earliest user message as the Goal in <knowledge_memory>; strip that
    // pinned block before asserting entry-level drops.
    const summary1Body = summary1Text.replace(
      /<knowledge_memory>[\s\S]*?<\/knowledge_memory>/g,
      '',
    )
    expect(summary1Body).not.toContain('Cycle1-Request-A')
    expect(summary1Body).not.toContain('Cycle1-Response-A')

    // === CYCLE 2: Add new messages, compact again ===
    const cycle2Messages = [
      summary1,
      createMessage('user', 'Cycle2-Request-D'),
      createMessage('assistant', 'Cycle2-Response-D'),
    ]
    const summary2 = simulateCompaction(cycle2Messages, tightBudgets)
    const summary2Text = (summary2.content[0] as { type: 'text'; text: string })
      .text

    // Newest entries from cycle 2 should survive
    expect(summary2Text).toContain('Cycle2-Request-D')
    expect(summary2Text).toContain('Cycle2-Response-D')
    // Cycle 1's oldest survivors should now be dropped from the entry walk.
    // Strip the M5 pinned <knowledge_memory> block (which may retain the
    // original Goal) before asserting entry-level drops.
    const summary2Body = summary2Text.replace(
      /<knowledge_memory>[\s\S]*?<\/knowledge_memory>/g,
      '',
    )
    expect(summary2Body).not.toContain('Cycle1-Request-A')
    expect(summary2Body).not.toContain('Cycle1-Response-A')

    // === CYCLE 3: Add more, compact again ===
    const cycle3Messages = [
      summary2,
      createMessage('user', 'Cycle3-Request-E'),
      createMessage('assistant', 'Cycle3-Response-E'),
    ]
    const summary3 = simulateCompaction(cycle3Messages, tightBudgets)
    const summary3Text = (summary3.content[0] as { type: 'text'; text: string })
      .text

    // Newest entries from cycle 3 should survive
    expect(summary3Text).toContain('Cycle3-Request-E')
    expect(summary3Text).toContain('Cycle3-Response-E')
    // Very old entries should definitely be gone from the entry walk. Strip
    // the M5 pinned <knowledge_memory> block (which may retain the original
    // Goal) before asserting entry-level drops.
    const summary3Body = summary3Text.replace(
      /<knowledge_memory>[\s\S]*?<\/knowledge_memory>/g,
      '',
    )
    expect(summary3Body).not.toContain('Cycle1-Request-A')
    expect(summary3Body).not.toContain('Cycle1-Response-A')

    // Verify only one conversation_summary tag (no nesting)
    const summaryTagCount = (
      summary3Text.match(/<conversation_summary>/g) || []
    ).length
    expect(summaryTagCount).toBe(1)
  })

  test('keeps multi-part tool entries grouped across compaction cycles', () => {
    const simulateCompaction = (inputMessages: Message[]): Message => {
      const result = runHandleSteps(inputMessages, 250000, 200000)
      return result[0].input.messages[0]
    }

    // Create a tool result that produces multiple entryParts:
    // both an error AND a non-zero exit code
    const cycle1Messages: Message[] = [
      createMessage('user', 'Run tests'),
      createToolCallMessage('call-1', 'run_terminal_command', {
        command: 'npm test',
      }),
      createToolResultMessage('call-1', 'run_terminal_command', {
        errorMessage: 'Test suite failed',
        exitCode: 1,
      }),
      createMessage('user', 'Fix the tests'),
      createMessage('assistant', 'I will fix them'),
    ]

    // Cycle 1: compact
    const summary1 = simulateCompaction(cycle1Messages)
    const summary1Text = (summary1.content[0] as { type: 'text'; text: string })
      .text

    // Both parts should be present in cycle 1
    expect(summary1Text).toContain(
      'Tool error from run_terminal_command: Test suite failed',
    )
    expect(summary1Text).toContain('Command failed with exit code: 1')

    // Cycle 2: re-compact — the multi-part entry should stay as one entry
    const cycle2Messages: Message[] = [
      summary1,
      createMessage('user', 'Try again'),
      createMessage('assistant', 'Running tests again'),
    ]
    const summary2 = simulateCompaction(cycle2Messages)
    const summary2Text = (summary2.content[0] as { type: 'text'; text: string })
      .text

    // Both parts should still be present together after re-compaction
    expect(summary2Text).toContain(
      'Tool error from run_terminal_command: Test suite failed',
    )
    expect(summary2Text).toContain('Command failed with exit code: 1')

    // They should be within the same --- delimited chunk (not split apart)
    const separator = '\n\n---\n\n'
    const chunks = summary2Text
      .replace(/<conversation_summary>[\s\S]*?\n\n/, '')
      .replace(/<\/conversation_summary>[\s\S]*/, '')
      .split(separator)
    const errorChunk = chunks.find((c) => c.includes('Tool error from'))
    expect(errorChunk).toBeDefined()
    expect(errorChunk).toContain('Command failed with exit code: 1')
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
    maxContextLength?: number,
    budgets?: {
      assistantToolBudget?: number
      userBudget?: number
      toolFactsBudget?: number
    },
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
      params: {
        ...(maxContextLength !== undefined ? { maxContextLength } : {}),
        ...budgets,
      },
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

  test.each([
    [128_000, 96_000],
    [200_000, 160_000],
    [262_144, 209_715],
    [500_000, 400_000],
    [1_000_000, 800_000],
  ])(
    'scales the default semantic threshold for a %i-token context window',
    (contextWindowTokens, triggerBudgetTokens) => {
      mockAgentState.contextWindowTokens = contextWindowTokens
      const messages = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi'),
      ]

      const under = runHandleSteps(messages, triggerBudgetTokens - 1_000)
      expect(under[0].input.messages).toHaveLength(2)

      const over = runHandleSteps(messages, triggerBudgetTokens)
      expect(over[0].input.messages[0].content[0].text).toContain(
        '<conversation_summary>',
      )
    },
  )

  test('uses the conservative fallback when the model context window is unknown', () => {
    mockAgentState.contextWindowTokens = undefined
    const messages = [
      createMessage('user', 'Hello'),
      createMessage('assistant', 'Hi'),
    ]

    const under = runHandleSteps(messages, 139_000)
    expect(under[0].input.messages).toHaveLength(2)

    const over = runHandleSteps(messages, 140_000)
    expect(over[0].input.messages[0].content[0].text).toContain(
      '<conversation_summary>',
    )
  })

  test('retains materially more history in the scaled one-million-token target', () => {
    const messages = Array.from({ length: 8 }, (_, index) =>
      createMessage(
        'user',
        `HISTORY_MARKER_${index} ` + String(index).repeat(30_000),
      ),
    )

    mockAgentState.contextWindowTokens = 200_000
    const compactTarget = runHandleSteps(messages, 160_000)
    const compactText = compactTarget[0].input.messages[0].content[0].text

    mockAgentState.contextWindowTokens = 1_000_000
    const largeTarget = runHandleSteps(messages, 800_000)
    const largeText = largeTarget[0].input.messages[0].content[0].text

    expect(compactText).not.toContain('HISTORY_MARKER_0')
    expect(largeText).toContain('HISTORY_MARKER_0')
    expect(largeText.length).toBeGreaterThan(compactText.length * 2)
  })

  test('keeps other categories when the newest user entry exhausts only the user budget', () => {
    const messages: Message[] = [
      createToolCallMessage('edit-1', 'write_file', {
        path: 'src/preserved.ts',
      }),
      createToolResultMessage(
        'edit-1',
        'write_file',
        withCommittedReceipt({
          kind: 'file_mutation_result',
          version: 1,
          operationId: 'edit-1',
          authorityTier: 'portable_path',
          outcome: 'applied',
          actions: [
            {
              index: 0,
              actionId: 'edit-1:0',
              action: 'write',
              path: 'src/preserved.ts',
              outcome: 'applied',
              afterHash: 'after',
            },
          ],
          errors: [],
          freshCapabilities: [],
        }),
      ),
      createMessage('user', 'x'.repeat(5_000)),
    ]

    const results = runHandleSteps(messages, 250_000, 200_000, {
      userBudget: 1,
      assistantToolBudget: 2_000,
      toolFactsBudget: 2_000,
    })
    const content = results[0].input.messages[0].content[0].text
    expect(content).toContain('Edit result from write_file')
    expect(content).toContain('src/preserved.ts')
  })

  test('refreshes the pinned goal from the latest live user request', () => {
    const latest: Message = {
      ...createMessage('user', 'Implement the corrected compaction behavior'),
      tags: ['USER_PROMPT'],
    }
    const results = runHandleSteps(
      [
        createMessage('user', 'Old request that has been superseded'),
        createMessage('assistant', 'Working on the old request'),
        latest,
      ],
      250_000,
      200_000,
    )
    const content = results[0].input.messages[0].content[0].text
    expect(content).toContain(
      'Goal:\n  Implement the corrected compaction behavior',
    )
  })

  test('preserves both the requirements prefix and trailing action in a long live request', () => {
    const latest: Message = {
      ...createMessage(
        'user',
        [
          'REQUIREMENT: keep reviewer context isolated from the orchestrator.',
          'diagnostic '.repeat(500),
          'FINAL ACTION: fix compaction without weakening deterministic edit guards.',
        ].join('\n'),
      ),
      tags: ['USER_PROMPT'],
    }

    const results = runHandleSteps([latest], 250_000, 200_000)
    const content = results[0].input.messages[0].content[0].text
    const knowledgeMemory = content.match(
      /<knowledge_memory>[\s\S]*?<\/knowledge_memory>/,
    )?.[0]

    expect(knowledgeMemory).toContain(
      'REQUIREMENT: keep reviewer context isolated from the orchestrator.',
    )
    expect(knowledgeMemory).toContain(
      'FINAL ACTION: fix compaction without weakening deterministic edit guards.',
    )
    expect(knowledgeMemory!.length).toBeLessThan(3_000)
    expect(knowledgeMemory).not.toContain('diagnostic '.repeat(500))
  })

  test('preserves a structured inline reviewer receipt with the full fingerprint', () => {
    const fingerprint = 'a'.repeat(64)
    const messages: Message[] = [
      createToolCallMessage('review-1', 'spawn_agent_inline', {
        agent_type: 'dependency-reviewer',
      }),
      createToolResultMessage('review-1', 'spawn_agent_inline', {
        schemaVersion: 3,
        family: 'reviewer',
        verdict: 'NON_BLOCKING',
        snapshotFingerprint: fingerprint,
        reviewedFiles: ['package.json'],
        coverage: 'covered',
        dimensions: { manifest: 'pass' },
        findings: [
          {
            id: 'dependency-reviewer:manifest:lockfile',
            severity: 'low',
            dimension: 'manifest',
            summary: 'Lockfile is consistent.',
            evidence: ['package.json matches bun.lock'],
            correction: 'No action required.',
          },
        ],
        requirementCoverage: [],
      }),
    ]

    const results = runHandleSteps(messages, 250_000, 200_000)
    const summary = results[0].input.messages[0]
    const content = summary.content[0].text
    expect(summary.keepDuringTruncation).toBe(true)
    expect(content).toContain('Review Receipts:')
    expect(content).toContain('dependency-reviewer: verdict=NON_BLOCKING')
    expect(content).toContain(`snapshot=${fingerprint}`)
    expect(content).toContain(
      'findingIds=dependency-reviewer:manifest:lockfile',
    )
  })

  test('records stale snapshot reviews as refresh signals, not blockers', () => {
    const staleSnapshot = 'c'.repeat(64)
    const messages: Message[] = [
      createToolCallMessage('review-stale', 'spawn_agent_inline', {
        agent_type: 'compatibility-reviewer',
      }),
      createToolResultMessage('review-stale', 'spawn_agent_inline', {
        schemaVersion: 1,
        family: 'reviewer',
        verdict: 'BLOCKING',
        snapshotFingerprint: staleSnapshot,
        reviewedFiles: ['src/public.ts'],
        coverage: 'missing',
        dimensions: { compatibility: 'block' },
        findings: [
          {
            id: 'compatibility-reviewer:compatibility:stale-snapshot',
            severity: 'critical',
            dimension: 'compatibility',
            summary: 'The supplied snapshot is stale and does not match.',
            evidence: ['Expected a newer snapshot.'],
            correction: 'Refresh the review bundle.',
          },
        ],
        requirementCoverage: [],
      }),
    ]

    const results = runHandleSteps(messages, 250_000, 200_000)
    const content = results[0].input.messages[0].content[0].text
    const knowledgeMemory = content.match(
      /<knowledge_memory>[\s\S]*?<\/knowledge_memory>/,
    )?.[0]

    expect(knowledgeMemory).toContain('verdict=STALE_SNAPSHOT')
    expect(knowledgeMemory).toContain(
      'stale snapshot review discarded; refresh the review bundle before retrying',
    )
    expect(knowledgeMemory).not.toContain('Blockers:')
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

  test('includes str_replace result in summary', () => {
    const messages = [
      createMessage('user', 'Edit this file'),
      createToolCallMessage('call-1', 'str_replace', {
        path: 'src/utils.ts',
        replacements: [{ old: 'foo', new: 'bar' }],
      }),
      createToolResultMessage('call-1', 'str_replace', {
        file: 'src/utils.ts',
        message: 'Updated file',
        unifiedDiff:
          '--- a/src/utils.ts\n+++ b/src/utils.ts\n@@ -1,1 +1,1 @@\n-foo\n+bar',
      }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('Edit result from str_replace:')
    expect(content).toContain('unifiedDiff')
    expect(content).toContain('-foo')
    expect(content).toContain('+bar')
  })

  test('includes write_file result in summary', () => {
    const messages = [
      createMessage('user', 'Create a new file'),
      createToolCallMessage('call-1', 'write_file', {
        path: 'src/new-file.ts',
        content: 'export const hello = "world"',
      }),
      createToolResultMessage('call-1', 'write_file', {
        file: 'src/new-file.ts',
        message: 'Created file',
        unifiedDiff:
          '--- /dev/null\n+++ b/src/new-file.ts\n@@ -0,0 +1 @@\n+export const hello = "world"',
      }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('Edit result from write_file:')
    expect(content).toContain('export const hello')
  })

  test('truncates very long str_replace results', () => {
    const longDiff = 'X'.repeat(3000)
    const messages = [
      createMessage('user', 'Make big changes'),
      createToolCallMessage('call-1', 'str_replace', {
        path: 'src/big-file.ts',
        replacements: [],
      }),
      createToolResultMessage('call-1', 'str_replace', {
        file: 'src/big-file.ts',
        message: 'Updated file',
        unifiedDiff: longDiff,
      }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('Edit result from str_replace:')
    expect(content).toContain('...')
    // Should not contain the full diff
    expect(content).not.toContain(longDiff)
  })

  test('truncates very large tool entries to 5k token limit', () => {
    // spawn_agents with multiple non-blacklisted agents producing large outputs
    // Each agent output is capped before the overall TOOL_ENTRY_LIMIT cap.
    // Use enough agents to exceed the 5k token (~15k char) entry limit after
    // per-agent compaction.
    const largeAgentResults = Array.from({ length: 7 }, (_, i) => ({
      agentType: `editor`,
      value: {
        type: 'string',
        value: `AGENT_${i}_START_` + 'X'.repeat(4000) + `_AGENT_${i}_END`,
      },
    }))

    const messages: Message[] = [
      createMessage('user', 'Spawn many agents'),
      createToolCallMessage('call-1', 'spawn_agents', {
        agents: [
          { agent_type: 'editor' },
          { agent_type: 'editor' },
          { agent_type: 'editor' },
          { agent_type: 'editor' },
          { agent_type: 'editor' },
          { agent_type: 'editor' },
          { agent_type: 'editor' },
        ],
      }),
      {
        role: 'tool',
        toolCallId: 'call-1',
        toolName: 'spawn_agents',
        content: [{ type: 'json', value: largeAgentResults }],
      } as ToolMessage,
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    // Should contain truncation notice from the TOOL_ENTRY_LIMIT cap
    expect(content).toContain('[...truncated')
    // The first agent's start should survive (80% prefix), while full raw
    // agent payloads should not be embedded in the compacted context.
    expect(content).toContain('AGENT_0_START_')
    expect(content.length).toBeLessThan(
      JSON.stringify(largeAgentResults).length,
    )
    expect(content).not.toContain('AGENT_3_END')
  })

  test('includes all result properties even without unifiedDiff', () => {
    const messages = [
      createMessage('user', 'Edit file'),
      createToolCallMessage('call-1', 'str_replace', {
        path: 'src/file.ts',
        replacements: [],
      }),
      createToolResultMessage('call-1', 'str_replace', {
        file: 'src/file.ts',
        errorMessage: 'No match found for old string',
      }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    // Should have both the tool call summary and the full result
    expect(content).toContain('edited file: src/file.ts')
    expect(content).toContain('Edit result from str_replace:')
    expect(content).toContain('errorMessage')
    expect(content).toContain('No match found for old string')
  })

  test('preserves bounded head-and-tail diagnostics for every edit tool', () => {
    const toolInputs: Array<[string, Record<string, unknown>]> = [
      [
        'edit_transaction',
        {
          edits: [
            {
              type: 'str_replace',
              path: 'src/transaction.ts',
              replacements: [],
            },
          ],
        },
      ],
      [
        'apply_patch',
        { operation: { type: 'update_file', path: 'src/patch.ts', diff: '' } },
      ],
      ['apply_smart_patch', { path: 'src/smart.ts', patch: '' }],
      [
        'replace_range',
        { path: 'src/range.ts', startLine: 1, endLine: 1, newContent: '' },
      ],
      [
        'rewrite_symbol',
        { path: 'src/symbol.ts', symbol: 'target', content: '' },
      ],
    ]
    const messages: Message[] = [createMessage('user', 'Try the edits')]
    toolInputs.forEach(([toolName, input], index) => {
      const toolCallId = `edit-${index}`
      messages.push(createToolCallMessage(toolCallId, toolName, input))
      messages.push(
        createToolResultMessage(toolCallId, toolName, {
          errorMessage:
            `HEAD_${toolName}\n` +
            'x'.repeat(2400) +
            `\nTAIL_${toolName}: deterministic recovery`,
        }),
      )
    })

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    for (const [toolName] of toolInputs) {
      expect(content).toContain(`Edit result from ${toolName}:`)
      expect(content).toContain(`HEAD_${toolName}`)
      expect(content).toContain(`TAIL_${toolName}: deterministic recovery`)
    }
    expect(content).toContain('[...truncated')
    expect(content).not.toContain('x'.repeat(2000))
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

  test('summarizes glob tool with pattern', () => {
    const messages = [
      createMessage('user', 'Find files'),
      createToolCallMessage('call-1', 'glob', {
        pattern: '**/*.ts',
      }),
      createToolResultMessage('call-1', 'glob', { files: [] }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('glob search for **/*.ts')
  })

  test('summarizes list_directory tool with path', () => {
    const messages = [
      createMessage('user', 'List directories'),
      createToolCallMessage('call-1', 'list_directory', {
        path: 'src',
      }),
      createToolResultMessage('call-1', 'list_directory', { entries: [] }),
    ]

    const results = runHandleSteps(messages)
    const content = results[0].input.messages[0].content[0].text

    expect(content).toContain('listed directory: src')
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

    expect(content).toContain('inspected subtrees: src/components, src/utils')
  })
})

describe('context-pruner dual-budget behavior', () => {
  let mockAgentState: AgentState

  beforeEach(() => {
    mockAgentState = createMockAgentState([], 0)
  })

  const runHandleSteps = (
    messages: Message[],
    contextTokenCount: number,
    maxContextLength: number,
    budgets?: {
      assistantToolBudget?: number
      userBudget?: number
      toolFactsBudget?: number
    },
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
      params: { maxContextLength, ...budgets },
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

  test('includes recent messages in summary and drops older ones', () => {
    const messages = [
      createMessage('user', 'Old user message 1'),
      createMessage('assistant', 'Old assistant response 1'),
      createMessage('user', 'Old user message 2'),
      createMessage('assistant', 'Old assistant response 2'),
      createMessage('user', 'Recent user message'),
      createMessage('assistant', 'Recent assistant response'),
    ]

    // Small budgets on summarized sizes: only the most recent entries fit
    const results = runHandleSteps(messages, 250000, 200000, {
      assistantToolBudget: 15,
      userBudget: 15,
    })

    const resultMessages = results[0].input.messages

    // Should be a single summary message (no verbatim messages)
    expect(resultMessages).toHaveLength(1)

    const content = (resultMessages[0].content[0] as { text: string }).text
    expect(content).toContain('<conversation_summary>')

    // Recent messages should be in the summary
    expect(content).toContain('Recent user message')
    expect(content).toContain('Recent assistant response')

    // Older messages should be dropped from the entry walk. M5 may pin the
    // earliest user message as Goal in <knowledge_memory>; strip that block
    // before asserting entry-level drops.
    const entryBody = content.replace(
      /<knowledge_memory>[\s\S]*?<\/knowledge_memory>/g,
      '',
    )
    expect(entryBody).not.toContain('Old user message 1')
    expect(entryBody).not.toContain('Old assistant response 1')
    expect(entryBody).not.toContain('Old user message 2')
    expect(entryBody).not.toContain('Old assistant response 2')
  })

  test('summarizes all messages when they fit within budgets', () => {
    const messages = [
      createMessage('user', 'Hello'),
      createMessage('assistant', 'Hi there!'),
      createMessage('user', 'How are you?'),
      createMessage('assistant', 'I am fine!'),
    ]

    // Large budgets: all messages fit in summary
    const results = runHandleSteps(messages, 250000, 200000, {
      assistantToolBudget: 20000,
      userBudget: 50000,
    })

    const resultMessages = results[0].input.messages

    // All messages summarized into one
    expect(resultMessages).toHaveLength(1)

    const content = (resultMessages[0].content[0] as { text: string }).text
    expect(content).toContain('Hello')
    expect(content).toContain('Hi there!')
    expect(content).toContain('How are you?')
    expect(content).toContain('I am fine!')
  })

  test('skips an oversized recent entry and retains older compact evidence from the same role', () => {
    const oversizedRecentResponse =
      'OVERSIZED_RECENT_RESPONSE_' + 'X'.repeat(900)
    const messages = [
      createMessage('user', 'Keep useful evidence when compacting'),
      createMessage('assistant', 'OLDER_COMPACT_EVIDENCE'),
      createMessage('assistant', oversizedRecentResponse),
    ]

    const results = runHandleSteps(messages, 250000, 200000, {
      assistantToolBudget: 20,
      userBudget: 100,
    })

    const content = (
      results[0].input.messages[0].content[0] as { text: string }
    ).text
    expect(content).toContain('OLDER_COMPACT_EVIDENCE')
    expect(content).not.toContain('OVERSIZED_RECENT_RESPONSE_')
  })

  test('respects user budget separately from assistant+tool budget', () => {
    const largeUserText = 'U'.repeat(600) // ~200 tokens
    const messages = [
      createMessage('user', largeUserText),
      createMessage('assistant', 'Short response'),
      createMessage('user', 'Recent short question'),
      createMessage('assistant', 'Recent short answer'),
    ]

    // User budget small enough to exclude the large user message
    // Assistant budget large enough to include all assistant messages
    const results = runHandleSteps(messages, 250000, 200000, {
      assistantToolBudget: 5000,
      userBudget: 100,
    })

    const resultMessages = results[0].input.messages
    expect(resultMessages).toHaveLength(1)

    const content = (resultMessages[0].content[0] as { text: string }).text
    expect(content).toContain('<conversation_summary>')
    // The large user message should be dropped from the entry walk. M5 may
    // pin the earliest user message as Goal in <knowledge_memory>; strip that
    // block before asserting entry-level drops.
    const entryBody2 = content.replace(
      /<knowledge_memory>[\s\S]*?<\/knowledge_memory>/g,
      '',
    )
    expect(entryBody2).not.toContain(largeUserText)
    // Recent messages should be in the summary
    expect(content).toContain('Recent short question')
    expect(content).toContain('Recent short answer')
  })

  test('drops tool entries beyond budget at the cutoff boundary', () => {
    const messages = [
      createMessage('user', 'Old message'),
      createToolCallMessage('call-1', 'read_files', { paths: ['old.ts'] }),
      createToolResultMessage('call-1', 'read_files', { content: 'old file' }),
      createMessage('user', 'Recent message'),
      createMessage('assistant', 'Recent response'),
    ]

    // Budget that excludes the older tool call entry
    const results = runHandleSteps(messages, 250000, 200000, {
      assistantToolBudget: 15,
      userBudget: 15,
    })

    const resultMessages = results[0].input.messages
    expect(resultMessages).toHaveLength(1)

    const content = (resultMessages[0].content[0] as { text: string }).text

    // Recent messages should be in the summary
    expect(content).toContain('Recent message')
    expect(content).toContain('Recent response')

    // Tool call summary should be dropped (beyond budget). M5 may pin the
    // earliest user message as Goal in <knowledge_memory>; strip that block
    // before asserting entry-level drops.
    const entryBody3 = content.replace(
      /<knowledge_memory>[\s\S]*?<\/knowledge_memory>/g,
      '',
    )
    expect(entryBody3).not.toContain('old.ts')
  })

  test('reserves tool-facts budget independent of assistant budget (SPEC R7)', () => {
    // Use str_replace with a large result — M6 routes edit results to the
    // reserved tool_facts budget so they survive even when the assistant
    // budget is tiny.
    const largeDiff = 'LARGE_DIFF_CONTENT_' + 'X'.repeat(900)
    const messages = [
      createMessage('user', 'Do something'),
      createToolCallMessage('call-1', 'str_replace', {
        path: 'big.ts',
        replacements: [],
      }),
      createToolResultMessage('call-1', 'str_replace', {
        file: 'big.ts',
        message: 'Updated',
        unifiedDiff: largeDiff,
      }),
      createMessage('user', 'Recent question'),
      createMessage('assistant', 'Recent answer'),
    ]

    // Assistant budget is tiny, but the tool result is charged to the reserved
    // toolFactsBudget — so the large edit result survives compaction.
    const results = runHandleSteps(messages, 250000, 200000, {
      assistantToolBudget: 100,
      userBudget: 5000,
      toolFactsBudget: 5000,
    })

    const resultMessages = results[0].input.messages
    expect(resultMessages).toHaveLength(1)

    const content = (resultMessages[0].content[0] as { text: string }).text
    expect(content).toContain('<conversation_summary>')
    // Recent messages should be in the summary
    expect(content).toContain('Recent question')
    expect(content).toContain('Recent answer')
    // M6: the large edit result survives because it is charged to the reserved
    // tool_facts budget, not the assistant budget.
    expect(content).toContain('LARGE_DIFF_CONTENT_')
  })

  test('drops tool-facts entries when the reserved tool-facts budget is exceeded', () => {
    const largeDiff = 'LARGE_DIFF_CONTENT_' + 'X'.repeat(900)
    const messages = [
      createMessage('user', 'Do something'),
      createToolCallMessage('call-1', 'str_replace', {
        path: 'big.ts',
        replacements: [],
      }),
      createToolResultMessage('call-1', 'str_replace', {
        file: 'big.ts',
        message: 'Updated',
        unifiedDiff: largeDiff,
      }),
      createMessage('user', 'Recent question'),
      createMessage('assistant', 'Recent answer'),
    ]

    // Both assistant and tool-facts budgets are tiny — the edit result is
    // dropped by the reserved tool-facts budget.
    const results = runHandleSteps(messages, 250000, 200000, {
      assistantToolBudget: 100,
      userBudget: 5000,
      toolFactsBudget: 100,
    })

    const resultMessages = results[0].input.messages
    expect(resultMessages).toHaveLength(1)

    const content = (resultMessages[0].content[0] as { text: string }).text
    expect(content).toContain('<conversation_summary>')
    expect(content).toContain('Recent question')
    expect(content).toContain('Recent answer')
    // Large edit result entry is dropped (exceeds reserved tool-facts budget)
    expect(content).not.toContain('LARGE_DIFF_CONTENT_')
  })

  test('drops older messages and includes recent ones in summary', () => {
    const messages = [
      createMessage('user', 'First request about feature A'),
      createMessage('assistant', 'Working on feature A'),
      createMessage('user', 'Second request about feature B'),
      createMessage('assistant', 'Working on feature B'),
    ]

    // Budget only fits the last pair of summarized entries
    const results = runHandleSteps(messages, 250000, 200000, {
      assistantToolBudget: 15,
      userBudget: 15,
    })

    const resultMessages = results[0].input.messages
    expect(resultMessages).toHaveLength(1)

    const content = (resultMessages[0].content[0] as { text: string }).text
    expect(content).toContain('<conversation_summary>')

    // Recent messages should be in the summary
    expect(content).toContain('Second request about feature B')
    expect(content).toContain('Working on feature B')

    // Older messages should be dropped from the entry walk. M5 may pin the
    // earliest user message as Goal in <knowledge_memory>; strip that block
    // before asserting entry-level drops.
    const entryBody4 = content.replace(
      /<knowledge_memory>[\s\S]*?<\/knowledge_memory>/g,
      '',
    )
    expect(entryBody4).not.toContain('First request about feature A')
    expect(entryBody4).not.toContain('Working on feature A')
  })

  test('excludes STEP_PROMPT tagged messages from budget calculation', () => {
    const largeStepPrompt = 'S'.repeat(900) // ~300 tokens
    const messages: Message[] = [
      createMessage('user', 'User request'),
      createMessage('assistant', 'Assistant response'),
      {
        role: 'user',
        content: [{ type: 'text', text: largeStepPrompt }],
        tags: ['STEP_PROMPT'],
      },
      createMessage('user', 'Recent question'),
      createMessage('assistant', 'Recent answer'),
    ]

    // Budget is small but the STEP_PROMPT should NOT count against it,
    // so both real user messages and both assistant messages should fit
    const results = runHandleSteps(messages, 250000, 200000, {
      assistantToolBudget: 200,
      userBudget: 200,
    })

    const resultMessages = results[0].input.messages
    expect(resultMessages).toHaveLength(1)

    const content = (resultMessages[0].content[0] as { text: string }).text
    // Both real messages should be in the summary
    expect(content).toContain('User request')
    expect(content).toContain('Assistant response')
    expect(content).toContain('Recent question')
    expect(content).toContain('Recent answer')
    // STEP_PROMPT content should NOT be in the summary
    expect(content).not.toContain(largeStepPrompt)
  })

  test('excludes SUBAGENT_SPAWN tagged messages from budget calculation', () => {
    const messages: Message[] = [
      createMessage('user', 'User request'),
      createMessage('assistant', 'First response'),
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'A'.repeat(900) }],
        tags: ['SUBAGENT_SPAWN'],
      },
      createMessage('user', 'Follow up'),
      createMessage('assistant', 'Second response'),
    ]

    // Budget is small but SUBAGENT_SPAWN should NOT count against it
    const results = runHandleSteps(messages, 250000, 200000, {
      assistantToolBudget: 200,
      userBudget: 200,
    })

    const resultMessages = results[0].input.messages
    expect(resultMessages).toHaveLength(1)

    const content = (resultMessages[0].content[0] as { text: string }).text
    expect(content).toContain('User request')
    expect(content).toContain('First response')
    expect(content).toContain('Follow up')
    expect(content).toContain('Second response')
  })

  test('charges old summary entries against their correct budgets', () => {
    // Previous summary with a large [USER] entry that exceeds user budget
    const largeUserContent = 'X'.repeat(900)
    const previousSummary: Message = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `<conversation_summary>\nThis is a summary of the conversation so far. The original messages have been condensed to save context space.\n\n[USER]\n${largeUserContent}\n\n---\n\n[ASSISTANT]\nOld assistant response\n</conversation_summary>`,
        },
      ],
    }

    const messages: Message[] = [
      previousSummary,
      createMessage('user', 'After summary request'),
      createMessage('assistant', 'After summary response'),
    ]

    // User budget is small — the large [USER] entry from the old summary
    // should be dropped because it exceeds the user budget.
    // The [ASSISTANT] entry from the old summary charges against assistant budget.
    const results = runHandleSteps(messages, 250000, 200000, {
      assistantToolBudget: 5000,
      userBudget: 50,
    })

    const resultMessages = results[0].input.messages
    expect(resultMessages).toHaveLength(1)

    const content = (resultMessages[0].content[0] as { text: string }).text
    // Recent messages should be in the summary
    expect(content).toContain('After summary request')
    expect(content).toContain('After summary response')
    // The old [ASSISTANT] entry fits the assistant budget and is after the cutoff
    expect(content).toContain('Old assistant response')
    // The large old [USER] entry should be dropped (exceeded user budget)
    expect(content).not.toContain(largeUserContent)
  })

  test('drops old summary entries individually based on budget walk', () => {
    // Previous summary with identifiable oldest and middle entries
    const previousSummary: Message = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `<conversation_summary>\nThis is a summary of the conversation so far. The original messages have been condensed to save context space.\n\n[USER]\nOLDEST_USER_ENTRY\n\n---\n\n[ASSISTANT]\nOLDEST_ASSISTANT_ENTRY\n\n---\n\n[USER]\nMIDDLE_USER_ENTRY\n\n---\n\n[ASSISTANT]\nMIDDLE_ASSISTANT_ENTRY\n</conversation_summary>`,
        },
      ],
    }

    const messages: Message[] = [
      previousSummary,
      createMessage('user', 'Recent request'),
      createMessage('assistant', 'Recent response'),
    ]

    // Budget large enough for middle + recent entries but not oldest
    const results = runHandleSteps(messages, 250000, 200000, {
      assistantToolBudget: 30,
      userBudget: 16,
    })

    const resultMessages = results[0].input.messages
    expect(resultMessages).toHaveLength(1)

    const content = (resultMessages[0].content[0] as { text: string }).text
    // Middle and recent entries should survive
    expect(content).toContain('MIDDLE_USER_ENTRY')
    expect(content).toContain('MIDDLE_ASSISTANT_ENTRY')
    expect(content).toContain('Recent request')
    expect(content).toContain('Recent response')
    // Oldest entries should be dropped
    expect(content).not.toContain('OLDEST_USER_ENTRY')
    expect(content).not.toContain('OLDEST_ASSISTANT_ENTRY')
  })

  test('handles complex scenario with long messages of all types and previous summary', () => {
    // Previous summary with 4 identifiable entries
    const previousSummary: Message = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `<conversation_summary>\nThis is a summary of the conversation so far. The original messages have been condensed to save context space.\n\n[USER]\nOLD_USER_REQUEST_1: The user asked about setting up authentication with OAuth2 and JWT tokens for the API.\n\n---\n\n[ASSISTANT]\nOLD_ASSISTANT_RESPONSE_1: Explained OAuth2 flow and implemented JWT token generation.\nTools: Read files: src/auth.ts, src/middleware.ts; Edited file: src/auth.ts\n\n---\n\n[USER]\nOLD_USER_REQUEST_2: Asked for unit tests for the auth module.\n\n---\n\n[ASSISTANT]\nOLD_ASSISTANT_RESPONSE_2: Created comprehensive test suite for authentication.\nTools: Wrote file: src/__tests__/auth.test.ts\n</conversation_summary>`,
        },
      ],
    }

    // Long user message (~45k chars, exceeds USER_MESSAGE_LIMIT of 13k tokens = 39k chars)
    // Middle marker placed ~85% through so it falls in the truncated gap
    // (past the 80% prefix but before the 20% suffix)
    const longUserMessage =
      'LONG_USER_START_' +
      'Here is a detailed specification for the new feature. '.repeat(650) +
      '_LONG_USER_MIDDLE_MARKER_' +
      'Here is a detailed specification for the new feature. '.repeat(150)

    // Long assistant message with text (~8k chars, exceeds ASSISTANT_MESSAGE_LIMIT of 1.3k tokens = 3.9k chars)
    // plus multiple tool calls. Middle marker placed ~60% through so it falls in the truncated gap.
    const longAssistantText =
      'LONG_ASSISTANT_START_' +
      'I will implement this step by step, starting with the data model changes. '.repeat(
        60,
      ) +
      '_LONG_ASST_MIDDLE_MARKER_' +
      'I will implement this step by step, starting with the data model changes. '.repeat(
        40,
      )
    const assistantWithToolCalls: Message = {
      role: 'assistant',
      content: [
        { type: 'text', text: longAssistantText },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'read_files',
          input: { paths: ['src/model.ts', 'src/service.ts'] },
        },
        {
          type: 'tool-call',
          toolCallId: 'call-2',
          toolName: 'str_replace',
          input: { path: 'src/model.ts', replacements: [] },
        },
        {
          type: 'tool-call',
          toolCallId: 'call-3',
          toolName: 'spawn_agents',
          input: {
            agents: [
              { agent_type: 'editor' },
              { agent_type: 'editor' },
              { agent_type: 'editor' },
              { agent_type: 'editor' },
              { agent_type: 'editor' },
            ],
          },
        },
      ],
    }

    // str_replace result with a large diff (~3k chars, exceeds 2k truncation limit)
    const largeDiff =
      'DIFF_START_MARKER_' + '+added line\n'.repeat(250) + '_DIFF_END_MARKER'

    // spawn_agents result with 5 non-blacklisted agents producing large outputs
    // Each ~4k chars, total ~20k, exceeds TOOL_ENTRY_LIMIT of 5k tokens = 15k chars
    const largeAgentResults = Array.from({ length: 5 }, (_, i) => ({
      agentType: 'editor',
      value: {
        type: 'string',
        value:
          `AGENT_${i}_OUTPUT_START_` +
          'Implementation details. '.repeat(160) +
          `_AGENT_${i}_OUTPUT_END`,
      },
    }))

    const messages: Message[] = [
      previousSummary,
      createMessage('user', longUserMessage),
      assistantWithToolCalls,
      createToolResultMessage('call-1', 'read_files', {
        content: 'file data',
      } as JSONValue),
      createToolResultMessage('call-2', 'str_replace', {
        file: 'src/model.ts',
        message: 'Updated',
        unifiedDiff: largeDiff,
      }),
      {
        role: 'tool',
        toolCallId: 'call-3',
        toolName: 'spawn_agents',
        content: [{ type: 'json', value: largeAgentResults }],
      } as ToolMessage,
      createMessage('user', 'FINAL_USER_REQUEST: Now run the tests'),
      createMessage('assistant', 'FINAL_ASSISTANT_RESPONSE: Running tests now'),
    ]

    // Use default budgets — everything should fit
    const results = runHandleSteps(messages, 250000, 200000)
    const resultMessages = results[0].input.messages
    expect(resultMessages).toHaveLength(1)

    const content = (resultMessages[0].content[0] as { text: string }).text

    // === Structure checks ===
    expect(content).toContain('<conversation_summary>')
    expect(content).toContain('</conversation_summary>')
    const summaryTagCount = (content.match(/<conversation_summary>/g) || [])
      .length
    expect(summaryTagCount).toBe(1)

    // === Previous summary entries preserved ===
    expect(content).toContain('OLD_USER_REQUEST_1')
    expect(content).toContain('OLD_ASSISTANT_RESPONSE_1')
    expect(content).toContain('OLD_USER_REQUEST_2')
    expect(content).toContain('OLD_ASSISTANT_RESPONSE_2')

    // === Long user message: truncated with 80/20 split ===
    expect(content).toContain('LONG_USER_START_')
    expect(content).not.toContain('_LONG_USER_MIDDLE_MARKER_') // Middle marker falls in truncated gap
    expect(content).toContain('[...truncated')

    // === Long assistant text: truncated ===
    expect(content).toContain('LONG_ASSISTANT_START_')
    expect(content).not.toContain('_LONG_ASST_MIDDLE_MARKER_') // Middle marker falls in truncated gap

    // === Tool call summaries present ===
    expect(content).toContain('inspected files: src/model.ts, src/service.ts')
    expect(content).toContain('edited file: src/model.ts')
    expect(content).toContain('delegated agents:')

    // === str_replace result: bounded at 2k chars with head and tail retained ===
    expect(content).toContain('Edit result from str_replace:')
    expect(content).toContain('DIFF_START_MARKER_')
    expect(content).toContain('_DIFF_END_MARKER')

    // === spawn_agents tool entry: truncated by TOOL_ENTRY_LIMIT ===
    expect(content).toContain('AGENT_0_OUTPUT_START_') // First agent's start in 80% prefix
    expect(content).toContain('[...truncated')
    expect(content).not.toContain('AGENT_2_OUTPUT_END_') // Full raw agent payloads are not embedded

    // === Final messages present ===
    expect(content).toContain('FINAL_USER_REQUEST')
    expect(content).toContain('FINAL_ASSISTANT_RESPONSE')

    // === Entries are separated by --- ===
    expect(content).toContain('---')
  })

  test('with tight budgets, backfills compact old summary evidence around oversized entries', () => {
    // Same setup but with tight budgets: new entries survive, oversized old
    // entries are skipped, and one compact older assistant entry backfills the
    // otherwise unused category budget.
    const previousSummary: Message = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `<conversation_summary>\nThis is a summary of the conversation so far. The original messages have been condensed to save context space.\n\n[USER]\nOLD_DROPPED_USER: ${'X'.repeat(600)}\n\n---\n\n[ASSISTANT]\nOLD_DROPPED_ASSISTANT: ${'Y'.repeat(600)}\n\n---\n\n[USER]\nOLD_DROPPED_USER_2: ${'Asked about deployment. '.repeat(40)}\n\n---\n\n[ASSISTANT]\nOLD_DROPPED_ASSISTANT_2: ${'Explained deployment process. '.repeat(80)}\n</conversation_summary>`,
        },
      ],
    }

    // Long user message (~12k chars, under truncation limit but uses significant budget)
    const longUserMessage =
      'SURVIVED_USER_START_' +
      'Feature request details. '.repeat(400) +
      '_SURVIVED_USER_END'

    // Assistant with tool calls
    const assistantMsg: Message = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'SURVIVED_ASSISTANT: Working on it' },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'str_replace',
          input: { path: 'src/app.ts', replacements: [] },
        },
      ],
    }

    // Tool result with a diff
    const toolResult = createToolResultMessage('call-1', 'str_replace', {
      file: 'src/app.ts',
      message: 'Updated file',
      unifiedDiff:
        '--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+SURVIVED_DIFF_CONTENT',
    })

    const messages: Message[] = [
      previousSummary,
      createMessage('user', longUserMessage),
      assistantMsg,
      toolResult,
      createMessage('user', 'SURVIVED_FINAL_USER'),
      createMessage('assistant', 'SURVIVED_FINAL_ASSISTANT'),
    ]

    // Tight budgets: enough for new entries but not old summary entries
    // New assistant entries: ~25 (assistant text+tool) + ~56 (edit result JSON) + ~13 (final) = ~94 tokens
    // Old assistant entries: ~20 for OLD_DROPPED_ASSISTANT_2 would push over budget of 100
    const results = runHandleSteps(messages, 250000, 200000, {
      assistantToolBudget: 400,
      userBudget: 3400,
    })

    const resultMessages = results[0].input.messages
    expect(resultMessages).toHaveLength(1)

    const content = (resultMessages[0].content[0] as { text: string }).text

    // === New entries survived ===
    expect(content).toContain('SURVIVED_USER_START_')
    expect(content).toContain('SURVIVED_ASSISTANT')
    expect(content).toContain('SURVIVED_DIFF_CONTENT')
    expect(content).toContain('SURVIVED_FINAL_USER')
    expect(content).toContain('SURVIVED_FINAL_ASSISTANT')

    // === Old summary entries are independently budgeted ===
    expect(content).not.toContain('OLD_DROPPED_USER:')
    expect(content).toContain('OLD_DROPPED_ASSISTANT:')
    expect(content).not.toContain('OLD_DROPPED_USER_2:')
    expect(content).not.toContain('OLD_DROPPED_ASSISTANT_2:')
  })

  test('fully includes conversation summary when it fits within user budget', () => {
    const previousSummary: Message = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `<conversation_summary>\nThis is a summary of the conversation so far. The original messages have been condensed to save context space.\n\n[USER]\nOld request about feature A\n\n---\n\n[ASSISTANT]\nWorked on feature A\n</conversation_summary>`,
        },
      ],
    }

    const messages: Message[] = [
      previousSummary,
      createMessage('user', 'New request about feature B'),
      createMessage('assistant', 'Working on feature B'),
    ]

    // Large budget — everything fits
    const results = runHandleSteps(messages, 250000, 200000, {
      assistantToolBudget: 20000,
      userBudget: 50000,
    })

    const resultMessages = results[0].input.messages
    expect(resultMessages).toHaveLength(1)

    const content = (resultMessages[0].content[0] as { text: string }).text
    // Previous summary content should be fully included
    expect(content).toContain('Old request about feature A')
    expect(content).toContain('Worked on feature A')
    // New messages should also be included
    expect(content).toContain('New request about feature B')
    expect(content).toContain('Working on feature B')
  })
})
