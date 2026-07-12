import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { createTestAgentRuntimeParams } from '@codebuff/common/testing/fixtures/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { promptSuccess } from '@codebuff/common/util/error'
import { assistantMessage, userMessage } from '@codebuff/common/util/messages'
import { afterEach, describe, expect, it, mock } from 'bun:test'

import { loopAgentSteps } from '../run-agent-step'
import { clearAgentGeneratorCache } from '../run-programmatic-step'
import { createToolCallChunk, mockFileContext } from './test-utils'

import type { AgentTemplate } from '../templates/types'
import type { StepGenerator } from '@codebuff/common/types/agent-template'
import type { AgentState } from '@codebuff/common/types/session-state'

describe('loopAgentSteps', () => {
  let runtimeParams: Omit<
    ReturnType<typeof createTestAgentRuntimeParams>,
    'agentTemplate' | 'localAgentTemplates'
  >
  let agentTemplate: AgentTemplate
  let agentState: AgentState
  let baseParams: Parameters<typeof loopAgentSteps>[0]

  afterEach(() => {
    clearAgentGeneratorCache(runtimeParams)
    mock.restore()
  })

  const setup = () => {
    const {
      agentTemplate: _,
      localAgentTemplates: __,
      ...baseRuntimeParams
    } = createTestAgentRuntimeParams()
    runtimeParams = baseRuntimeParams
    runtimeParams.promptAiSdkStream = mock(async function* () {
      yield { type: 'text' as const, text: 'LLM response\n\n' }
      yield createToolCallChunk('end_turn', {})
      return promptSuccess('mock-message-id')
    })

    agentTemplate = {
      id: 'test-agent',
      displayName: 'Test Agent',
      spawnerPrompt: 'Testing',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'structured_output',
      includeMessageHistory: true,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['read_files', 'write_file', 'end_turn'],
      spawnableAgents: [],
      systemPrompt: 'Test system prompt',
      instructionsPrompt: 'Test user prompt',
      stepPrompt: 'Test agent step prompt',
      handleSteps: undefined,
    } satisfies AgentTemplate as AgentTemplate

    const sessionState = getInitialSessionState(mockFileContext)
    agentState = {
      ...sessionState.mainAgentState,
      agentId: 'test-agent-id',
      messageHistory: [
        userMessage('Initial message'),
        assistantMessage('Initial response'),
      ],
      output: undefined,
      stepsRemaining: 10,
    }

    baseParams = {
      ...runtimeParams,
      agentType: 'test-agent',
      localAgentTemplates: { 'test-agent': agentTemplate },
      repoId: undefined,
      repoUrl: undefined,
      userInputId: 'test-user-input',
      agentState,
      prompt: 'Test prompt',
      spawnParams: undefined,
      fingerprintId: 'test-fingerprint',
      fileContext: mockFileContext,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      ancestorRunIds: [],
      onResponseChunk: () => {},
      signal: new AbortController().signal,
    }
  }

  it('routes spawned subagent model requests by stable agent type', async () => {
    setup()
    let routedAgentId: string | undefined
    runtimeParams.promptAiSdkStream = mock(async function* ({ agentId }) {
      routedAgentId = agentId
      yield { type: 'text' as const, text: 'LLM response\n\n' }
      return promptSuccess('mock-message-id')
    })

    await loopAgentSteps({
      ...baseParams,
      promptAiSdkStream: runtimeParams.promptAiSdkStream,
      agentState: { ...agentState, agentId: 'generated-runtime-agent-id' },
    })

    expect(routedAgentId).toBe('test-agent')
  })

  it('calls the LLM once after STEP', async () => {
    setup()
    let llmCallCount = 0
    runtimeParams.promptAiSdkStream = mock(async function* () {
      llmCallCount++
      yield { type: 'text' as const, text: 'LLM response\n\n' }
      yield createToolCallChunk('end_turn', {})
      return promptSuccess('mock-message-id')
    })
    agentTemplate.handleSteps = function* () {
      yield { toolName: 'read_files', input: { paths: ['file1.txt'] } }
      yield 'STEP'
    } as () => StepGenerator

    await loopAgentSteps({
      ...baseParams,
      promptAiSdkStream: runtimeParams.promptAiSdkStream,
      localAgentTemplates: { 'test-agent': agentTemplate },
    })

    expect(llmCallCount).toBe(1)
  })

  it('reports the resolved BYOK model context window before the LLM request', async () => {
    setup()
    const events: unknown[] = []
    const resolveModelContextWindow = mock(() => 32_000)

    await loopAgentSteps({
      ...baseParams,
      resolveModelContextWindow,
      onResponseChunk: (event) => events.push(event),
    })

    expect(resolveModelContextWindow).toHaveBeenCalledWith({
      agentId: 'test-agent',
      model: 'claude-3-5-sonnet-20241022',
    })
    expect(events).toContainEqual({
      type: 'context_window',
      used: expect.any(Number),
      max: 32_000,
    })
  })

  it('runs semantic programmatic compaction before the mechanical brake', async () => {
    setup()
    const events: any[] = []
    agentState.messageHistory = [userMessage('old evidence '.repeat(4_000))]
    agentTemplate.handleSteps = function* () {
      yield {
        toolName: 'set_messages',
        input: {
          messages: [
            userMessage(
              '<knowledge_memory>\nPinned structured knowledge memory.\nGoal: preserve discovery and resume\n</knowledge_memory>',
            ),
          ],
        },
        includeToolCall: false,
      }
      yield 'STEP'
    } as () => StepGenerator

    const result = await loopAgentSteps({
      ...baseParams,
      agentState,
      maxContextLength: 2_000,
      localAgentTemplates: { 'test-agent': agentTemplate },
      onResponseChunk: (event) => events.push(event),
    })

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'context_compaction',
        action: 'semantic_compaction',
        retainedKnowledgeMemory: true,
      }),
    )
    expect(events).not.toContainEqual(
      expect.objectContaining({
        type: 'context_compaction',
        action: 'mechanical_trim',
      }),
    )
    expect(JSON.stringify(result.agentState.messageHistory)).toContain(
      '<knowledge_memory>',
    )
  })

  it('emits a recovery-rich event when emergency mechanical trim is required', async () => {
    setup()
    const events: any[] = []
    agentState.messageHistory = [
      userMessage('old constraints '.repeat(4_000)),
      assistantMessage('old implementation evidence '.repeat(4_000)),
      userMessage('latest request'),
    ]

    const result = await loopAgentSteps({
      ...baseParams,
      agentState,
      maxContextLength: 2_000,
      onResponseChunk: (event) => events.push(event),
    })

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'context_compaction',
        action: 'mechanical_trim',
        retainedKnowledgeMemory: false,
        recovery: expect.stringContaining('Re-gather exact constraints'),
      }),
    )
    expect(JSON.stringify(result.agentState.messageHistory)).toContain(
      '<mechanical_context_recovery>',
    )
  })
})
