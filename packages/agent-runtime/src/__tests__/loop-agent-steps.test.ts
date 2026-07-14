import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { createTestAgentRuntimeParams } from '@codebuff/common/testing/fixtures/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { promptSuccess } from '@codebuff/common/util/error'
import { assistantMessage, userMessage } from '@codebuff/common/util/messages'
import { afterEach, describe, expect, it, mock } from 'bun:test'

import contextPruner from '../../../../agents/context-pruner'
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

    const result = await loopAgentSteps({
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
    expect(result.agentState.contextWindowTokens).toBe(32_000)
  })

  it('runs semantic programmatic compaction before the mechanical brake', async () => {
    setup()
    const events: any[] = []
    const checkpoints: string[] = []
    agentState.messageHistory = [
      userMessage(
        'Initial implementation request ' + 'old evidence '.repeat(20_000),
      ),
      assistantMessage('I will inspect the relevant files.'),
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'read-call',
            toolName: 'read_files',
            input: { paths: ['src/live-context.ts'] },
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'read-call',
        toolName: 'read_files',
        content: [
          {
            type: 'json',
            value: {
              kind: 'read_files_result',
              version: 1,
              status: 'ok',
              summary: { requested: 1, ok: 1, partial: 0, failed: 0 },
              results: [
                {
                  selector: 'file',
                  requestIndex: 0,
                  path: 'src/live-context.ts',
                  status: 'ok',
                  content: 'export const liveContext = true',
                  complete: true,
                  template: false,
                },
              ],
            },
          },
        ],
      },
      userMessage('Continue with the implementation.'),
    ]
    agentTemplate.handleSteps =
      contextPruner.handleSteps as AgentTemplate['handleSteps']

    const result = await loopAgentSteps({
      ...baseParams,
      agentState,
      // Keep the explicit provider-safe ceiling above the system/tool baseline
      // so this case isolates semantic compaction rather than intentionally
      // exercising the later mechanical emergency brake.
      maxContextLength: 50_000,
      spawnParams: { maxContextLength: 50_000 },
      localAgentTemplates: { 'test-agent': agentTemplate },
      onResponseChunk: (event) => events.push(event),
      onCheckpoint: (state) =>
        checkpoints.push(JSON.stringify(state.messageHistory)),
    })

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'context_compaction',
        action: 'semantic_compaction',
        triggerBudgetTokens: 140_000,
        targetBudgetTokens: 100_000,
        reason: expect.stringContaining('explicit maxContextLength override'),
        retainedKnowledgeMemory: true,
      }),
    )
    expect(events).not.toContainEqual(
      expect.objectContaining({
        type: 'context_compaction',
        action: 'mechanical_trim',
      }),
    )
    const compactedHistory = JSON.stringify(result.agentState.messageHistory)
    expect(compactedHistory).toContain('<knowledge_memory>')
    expect(compactedHistory).toContain('Files Inspected:')
    expect(compactedHistory).toContain('src/live-context.ts')
    expect(
      checkpoints.some((checkpoint) =>
        checkpoint.includes('<knowledge_memory>'),
      ),
    ).toBe(true)
  })

  it('does not report below-trigger semantic reductions as context compaction', async () => {
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
      resolveModelContextWindow: mock(() => 1_000_000),
      localAgentTemplates: { 'test-agent': agentTemplate },
      onResponseChunk: (event) => events.push(event),
    })

    expect(events).not.toContainEqual(
      expect.objectContaining({
        type: 'context_compaction',
        action: 'semantic_compaction',
      }),
    )
    expect(JSON.stringify(result.agentState.messageHistory)).toContain(
      '<knowledge_memory>',
    )
  })

  it('uses the injected small-model semantic budget before the first request', async () => {
    setup()
    const events: any[] = []
    agentState.messageHistory = [
      userMessage('small-window evidence '.repeat(8_000)),
      userMessage('Continue from the retained goal.'),
    ]
    agentTemplate.handleSteps =
      contextPruner.handleSteps as AgentTemplate['handleSteps']

    await loopAgentSteps({
      ...baseParams,
      agentState,
      resolveModelContextWindow: mock(() => 32_000),
      localAgentTemplates: { 'test-agent': agentTemplate },
      onResponseChunk: (event) => events.push(event),
    })

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'context_compaction',
        action: 'semantic_compaction',
        resolvedContextWindowTokens: 32_000,
        triggerBudgetTokens: 18_000,
        targetBudgetTokens: 10_080,
        retainedKnowledgeMemory: true,
      }),
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
        triggerBudgetTokens: 2_000,
        targetBudgetTokens: 2_000,
        reason: expect.stringContaining('provider-safe request budget'),
        retainedKnowledgeMemory: false,
        recovery: expect.stringContaining('Re-gather exact constraints'),
      }),
    )
    expect(JSON.stringify(result.agentState.messageHistory)).toContain(
      '<mechanical_context_recovery>',
    )
  })

  it('uses the structured compaction envelope and newest pinned memory for /compact', async () => {
    setup()
    agentState.messageHistory = [
      userMessage(
        '<knowledge_memory>\nPinned structured knowledge memory.\nGoal: stale goal\n</knowledge_memory>',
      ),
      userMessage(
        '<knowledge_memory>\nPinned structured knowledge memory.\nGoal: current goal\n</knowledge_memory>',
      ),
    ]

    const result = await loopAgentSteps({
      ...baseParams,
      agentState,
      prompt: '/compact',
    })

    const compacted = JSON.stringify(result.agentState.messageHistory)
    expect(compacted).toContain('<conversation_summary>')
    expect(compacted).toContain('<historical_memory>')
    expect(compacted).toContain('Goal: current goal')
    expect(compacted).not.toContain('Goal: stale goal')
  })
})
