import * as bigquery from '@codebuff/bigquery'
import * as analytics from '@codebuff/common/analytics'
import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import * as stringUtils from '@codebuff/common/util/string'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'

import { createToolCallChunk, mockFileContext } from './test-utils'
import { processStream } from '../tools/stream-parser'

import type { StreamChunk } from '@codebuff/common/types/contracts/llm'

import type { AgentTemplate } from '../templates/types'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { ParamsOf } from '@codebuff/common/types/function-params'
import type {
  Message,
  ToolMessage,
} from '@codebuff/common/types/messages/codebuff-message'

let agentRuntimeImpl: AgentRuntimeDeps = { ...TEST_AGENT_RUNTIME_IMPL }

describe('malformed tool call error handling', () => {
  let testAgent: AgentTemplate
  let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps
  let defaultParams: ParamsOf<typeof processStream>

  beforeEach(() => {
    agentRuntimeImpl = { ...TEST_AGENT_RUNTIME_IMPL }

    testAgent = {
      id: 'test-agent',
      displayName: 'Test Agent',
      spawnerPrompt: 'Testing malformed tool calls',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'all_messages' as const,
      includeMessageHistory: true,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['read_files', 'end_turn'],
      spawnableAgents: [],
      systemPrompt: 'Test system prompt',
      instructionsPrompt: 'Test instructions prompt',
      stepPrompt: 'Test agent step prompt',
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState

    defaultParams = {
      ...agentRuntimeImpl,
      stream: createMockStream([]),
      runId: 'test-run-id',
      ancestorRunIds: [],
      agentStepId: 'test-step',
      clientSessionId: 'test-session',
      fingerprintId: 'test-fingerprint',
      userInputId: 'test-input',
      userId: TEST_USER_ID,
      repoId: 'test-repo',
      repoUrl: undefined,
      agentTemplate: testAgent,
      agentState,
      localAgentTemplates: { 'test-agent': testAgent },
      fileContext: mockFileContext,
      messages: [],
      system: 'Test system prompt',
      agentContext: {},
      onResponseChunk: mock(() => {}),
      onCostCalculated: mock(async () => {}),
      fullResponse: '',
      prompt: '',
      signal: new AbortController().signal,
    }

    // Mock analytics and tracing
    spyOn(analytics, 'initAnalytics').mockImplementation(() => {})
    analytics.initAnalytics(TEST_AGENT_RUNTIME_IMPL)
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})
    spyOn(bigquery, 'insertTrace').mockImplementation(() =>
      Promise.resolve(true),
    )

    // Mock websocket actions
    agentRuntimeImpl.requestFiles = async () => ({})
    agentRuntimeImpl.requestOptionalFile = async () => null
    agentRuntimeImpl.requestToolCall = async () => ({
      output: [
        {
          type: 'json',
          value: 'Tool call success',
        },
      ],
    })

    // Mock LLM APIs
    agentRuntimeImpl.promptAiSdk = async function () {
      return 'Test response'
    }

    // Mock generateCompactId for consistent test results
    spyOn(stringUtils, 'generateCompactId').mockReturnValue('test-tool-call-id')
  })

  afterEach(() => {
    mock.restore()
    agentRuntimeImpl = { ...TEST_AGENT_RUNTIME_IMPL }
  })

  function createMockStream(chunks: StreamChunk[]) {
    async function* generator() {
      for (const chunk of chunks) {
        yield chunk
      }
      return 'mock-message-id'
    }
    return generator()
  }

  function textChunk(text: string): StreamChunk {
    return { type: 'text' as const, text }
  }

  test('should add tool result errors to message history after stream completes', async () => {
    // With native tools, malformed tool calls are handled at the API level.
    // This test now verifies that an unknown tool is properly handled.
    const chunks: StreamChunk[] = [
      createToolCallChunk('unknown_tool_xyz', { paths: ['test.ts'] }),
      createToolCallChunk('end_turn', {}),
    ]

    const stream = createMockStream(chunks)

    await processStream({
      ...defaultParams,
      stream,
    })

    // Should have tool result errors in the final message history
    const toolMessages: ToolMessage[] =
      defaultParams.agentState.messageHistory.filter(
        (m: Message) => m.role === 'tool',
      )

    expect(toolMessages.length).toBeGreaterThan(0)

    // Find the error tool result for the unknown tool
    const errorToolResult = toolMessages.find(
      (m) =>
        m.content?.[0]?.type === 'json' &&
        (m.content[0] as any)?.value?.errorMessage,
    )

    expect(errorToolResult).toBeDefined()
    expect(
      (errorToolResult?.content?.[0] as any)?.value?.errorMessage,
    ).toContain('not found')
  })

  test('should handle multiple unknown tool calls', async () => {
    const chunks: StreamChunk[] = [
      createToolCallChunk('unknown_tool_1', { param: 'value1' }),
      textChunk('Some text between calls'),
      createToolCallChunk('unknown_tool_2', { param: 'value2' }),
      createToolCallChunk('end_turn', {}),
    ]

    const stream = createMockStream(chunks)

    await processStream({
      ...defaultParams,
      stream,
    })

    // Should have multiple error tool results
    const toolMessages = defaultParams.agentState.messageHistory.filter(
      (m: Message) => m.role === 'tool',
    ) as ToolMessage[]

    const errorMessages = toolMessages.filter(
      (m) =>
        m.content?.[0]?.type === 'json' &&
        (m.content[0] as any)?.value?.errorMessage,
    )

    expect(errorMessages.length).toBe(2)
  })

  test('should preserve original toolResults array alongside message history', async () => {
    const chunks: StreamChunk[] = [
      createToolCallChunk('unknown_tool_xyz', { param: 'value' }),
      createToolCallChunk('end_turn', {}),
    ]

    const stream = createMockStream(chunks)

    const result = await processStream({
      ...defaultParams,
      stream,
    })

    // Should have error in both toolResults and message history
    expect(result.toolResults.length).toBeGreaterThan(0)

    const errorToolResult = result.toolResults.find(
      (tr) =>
        tr.content?.[0]?.type === 'json' &&
        (tr.content[0] as any)?.value?.errorMessage,
    )

    expect(errorToolResult).toBeDefined()

    const toolMessages = defaultParams.agentState.messageHistory.filter(
      (m: Message) => m.role === 'tool',
    ) as ToolMessage[]

    expect(toolMessages.length).toBeGreaterThan(0)
  })

  test('should handle unknown tool names and add error to message history', async () => {
    const chunks: StreamChunk[] = [
      createToolCallChunk('unknown_tool', { param: 'value' }),
      createToolCallChunk('end_turn', {}),
    ]

    const stream = createMockStream(chunks)

    await processStream({
      ...defaultParams,
      stream,
    })

    const toolMessages = defaultParams.agentState.messageHistory.filter(
      (m: Message) => m.role === 'tool',
    ) as ToolMessage[]

    const errorMessage = toolMessages.find(
      (m) =>
        m.toolName === 'unknown_tool' &&
        m.content?.[0]?.type === 'json' &&
        (m.content[0] as any)?.value?.errorMessage,
    )

    expect(errorMessage).toBeDefined()
    expect((errorMessage?.content?.[0] as any)?.value?.errorMessage).toContain(
      'Tool unknown_tool not found',
    )
  })

  test('should not affect valid tool calls in message history', async () => {
    const chunks: StreamChunk[] = [
      // Valid tool call
      createToolCallChunk('read_files', { paths: ['test.ts'] }),
      // Unknown tool call
      createToolCallChunk('unknown_tool_xyz', { param: 'value' }),
      createToolCallChunk('end_turn', {}),
    ]

    const stream = createMockStream(chunks)

    await processStream({
      ...defaultParams,
      requestFiles: async ({ filePaths }) => {
        return Object.fromEntries(
          filePaths.map((path) => [path, `${path} content`]),
        )
      },
      stream,
    })

    const toolMessages = defaultParams.agentState.messageHistory.filter(
      (m: Message) => m.role === 'tool',
    ) as ToolMessage[]

    // Should have both valid and error tool results
    const validResults = toolMessages.filter(
      (m) =>
        m.toolName === 'read_files' &&
        !(m.content?.[0] as any)?.value?.errorMessage,
    )

    const errorResults = toolMessages.filter(
      (m) =>
        m.content?.[0]?.type === 'json' &&
        (m.content[0] as any)?.value?.errorMessage,
    )

    expect(validResults.length).toBeGreaterThan(0)
    expect(errorResults.length).toBeGreaterThan(0)
  })

  test('should handle stream with only unknown tool calls', async () => {
    const chunks: StreamChunk[] = [
      createToolCallChunk('unknown_tool_1', { param: 'value1' }),
      createToolCallChunk('unknown_tool_2', { param: 'value2' }),
    ]

    const stream = createMockStream(chunks)

    await processStream({
      ...defaultParams,
      stream,
    })

    const toolMessages = defaultParams.agentState.messageHistory.filter(
      (m: Message) => m.role === 'tool',
    ) as ToolMessage[]

    expect(toolMessages.length).toBe(2)
    toolMessages.forEach((msg) => {
      expect(msg.content?.[0]?.type).toBe('json')
      expect((msg.content?.[0] as any)?.value?.errorMessage).toContain(
        'not found',
      )
    })
  })
})
