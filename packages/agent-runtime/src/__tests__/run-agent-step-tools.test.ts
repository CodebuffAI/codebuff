import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as analytics from '@codebuff/common/analytics'
import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { promptSuccess } from '@codebuff/common/util/error'
import { assistantMessage, userMessage } from '@codebuff/common/util/messages'

import { handleWriteTodos } from '../tools/handlers/tool/write-todos'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

import { runAgentStep } from '../run-agent-step'
import { clearAgentGeneratorCache } from '../run-programmatic-step'
import { createToolCallChunk } from './test-utils'
import { asUserMessage } from '../util/messages'

import type { AgentTemplate } from '../templates/types'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import { REPEATED_STEP_LOOP_LIMIT } from '../util/step-loop-guard'

type WriteTodosOutput = {
  message: string
  todoSummary: {
    totalCount: number
    completedCount: number
    remainingCount: number
  }
  currentTodos: { task: string; completed: boolean }[]
  persistedHistoricalSummary: {
    totalCount: number
  }
}

describe('write_todos tool', () => {
  it('returns current incoming todos as the visible active summary', async () => {
    const previousCwd = process.cwd()
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'write-todos-test-'))
    try {
      process.chdir(tempDir)
      const stateDir = path.join(tempDir, '.omx/state')
      fs.mkdirSync(stateDir, { recursive: true })
      fs.writeFileSync(
        path.join(stateDir, 'todos-session.json'),
        JSON.stringify(
          Array.from({ length: 821 }, (_, i) => ({
            task: `Historical task ${i + 1}`,
            completed: i < 417,
          })),
        ),
      )

      const output = await handleWriteTodos({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolName: 'write_todos',
          input: {
            todos: [
              { task: 'Implement current fix', completed: true },
              { task: 'Update focused tests', completed: false },
            ],
          },
        } as CodebuffToolCall<'write_todos'>,
      })
      const value = output.output[0].value as unknown as WriteTodosOutput

      expect(value.message).toContain(
        'Current active progress: 1/2 tasks completed',
      )
      expect(value.message).not.toContain('417/821 tasks completed')
      expect(value.todoSummary).toMatchObject({
        totalCount: 2,
        completedCount: 1,
        remainingCount: 1,
      })
      expect(value.currentTodos).toEqual([
        { task: 'Implement current fix', completed: true },
        { task: 'Update focused tests', completed: false },
      ])
      expect(value.persistedHistoricalSummary.totalCount).toBe(823)
    } finally {
      process.chdir(previousCwd)
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})

describe('runAgentStep - set_output tool', () => {
  let testAgent: AgentTemplate
  let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps
  let runAgentStepBaseParams: ParamsExcluding<
    typeof runAgentStep,
    | 'agentType'
    | 'prompt'
    | 'localAgentTemplates'
    | 'agentState'
    | 'agentTemplate'
  >

  beforeEach(async () => {
    agentRuntimeImpl = { ...TEST_AGENT_RUNTIME_IMPL, sendAction: () => {} }

    // Create a test agent that supports set_output
    testAgent = {
      id: 'test-set-output-agent',
      displayName: 'Test Set Output Agent',
      spawnerPrompt: 'Testing set_output functionality',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'structured_output' as const,
      includeMessageHistory: true,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['set_output', 'end_turn'],
      spawnableAgents: [],
      systemPrompt: 'Test system prompt',
      instructionsPrompt: 'Test instructions prompt',
      stepPrompt: 'Test agent step prompt',
    }

    // Mock analytics
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})

    agentRuntimeImpl.requestFiles = async ({ filePaths }) => {
      const results: Record<string, string | null> = {}
      filePaths.forEach((p) => {
        if (p === 'src/auth.ts') {
          results[p] = 'export function authenticate() { return true; }'
        } else if (p === 'src/user.ts') {
          results[p] = 'export interface User { id: string; name: string; }'
        } else {
          results[p] = null
        }
      })
      return results
    }
    agentRuntimeImpl.requestOptionalFile = async ({ filePath }) => {
      if (filePath === 'src/auth.ts') {
        return 'export function authenticate() { return true; }'
      } else if (filePath === 'src/user.ts') {
        return 'export interface User { id: string; name: string; }'
      }
      return null
    }

    // Don't mock requestToolCall for integration test - let real tool execution happen

    // Mock LLM APIs
    agentRuntimeImpl.promptAiSdk = async function () {
      return promptSuccess('Test response')
    }
    clearAgentGeneratorCache(agentRuntimeImpl)

    runAgentStepBaseParams = {
      ...agentRuntimeImpl,

      additionalToolDefinitions: () => Promise.resolve({}),
      ancestorRunIds: [],
      clientSessionId: 'test-session',
      fileContext: mockFileContext,
      fingerprintId: 'test-fingerprint',
      onResponseChunk: () => {},
      repoId: undefined,
      repoUrl: undefined,
      runId: 'test-run-id',
      signal: new AbortController().signal,
      spawnParams: undefined,
      system: 'Test system prompt',
      tools: {},
      userId: TEST_USER_ID,
      userInputId: 'test-input',
    }
  })

  afterEach(() => {
    mock.restore()
  })

  afterAll(() => {
    clearAgentGeneratorCache(agentRuntimeImpl)
  })

  const mockFileContext: ProjectFileContext = {
    projectRoot: '/test',
    cwd: '/test',
    fileTree: [],
    fileTokenScores: {},
    knowledgeFiles: {},
    gitChanges: {
      status: '',
      diff: '',
      diffCached: '',
      lastCommitMessages: '',
    },
    changesSinceLastChat: {},
    shellConfigFiles: {},
    systemInfo: {
      platform: 'test',
      shell: 'test',
      nodeVersion: 'test',
      arch: 'test',
      homedir: '/home/test',
      cpus: 1,
      chromeAvailable: false,
    },
    agentTemplates: {},
    customToolDefinitions: {},
  }

  it('should set output with simple key-value pair', async () => {
    runAgentStepBaseParams.promptAiSdkStream = async function* ({}) {
      yield createToolCallChunk('set_output', { message: 'Hi' })
      yield { type: 'text' as const, text: '\n\n' }
      yield createToolCallChunk('end_turn', {})
      return promptSuccess('mock-message-id')
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    const localAgentTemplates = {
      'test-set-output-agent': testAgent,
    }

    const result = await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: 'test-set-output-agent',
      localAgentTemplates,
      agentTemplate: testAgent,
      agentState,
      prompt: 'Analyze the codebase',
    })

    expect(result.agentState.output).toEqual({
      message: 'Hi',
    })
    expect(result.shouldEndTurn).toBe(true)
  })

  it('supplies set_output to structured agents that omitted it from toolNames', async () => {
    testAgent = { ...testAgent, toolNames: ['end_turn'] }
    runAgentStepBaseParams.promptAiSdkStream = async function* () {
      yield createToolCallChunk('set_output', { message: 'Recovered output' })
      return promptSuccess('mock-message-id')
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const result = await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: 'test-set-output-agent',
      localAgentTemplates: { 'test-set-output-agent': testAgent },
      agentTemplate: testAgent,
      agentState: sessionState.mainAgentState,
      prompt: 'Return structured output',
    })

    expect(result.agentState.output).toEqual({ message: 'Recovered output' })
    expect(result.shouldEndTurn).toBe(true)
  })

  it('should set output with complex data', async () => {
    runAgentStepBaseParams.promptAiSdkStream = async function* ({}) {
      yield createToolCallChunk('set_output', {
        message: 'Analysis complete',
        status: 'success',
        findings: ['Bug in auth.ts', 'Missing validation'],
      })
      yield createToolCallChunk('end_turn', {})
      return promptSuccess('mock-message-id')
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    const localAgentTemplates = {
      'test-set-output-agent': testAgent,
    }

    const result = await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: 'test-set-output-agent',
      localAgentTemplates,
      agentTemplate: testAgent,
      agentState,
      prompt: 'Analyze the codebase',
    })

    expect(result.agentState.output).toEqual({
      message: 'Analysis complete',
      status: 'success',
      findings: ['Bug in auth.ts', 'Missing validation'],
    })
    expect(result.shouldEndTurn).toBe(true)
  })

  it('should replace existing output data', async () => {
    runAgentStepBaseParams.promptAiSdkStream = async function* ({}) {
      yield createToolCallChunk('set_output', {
        newField: 'new value',
        existingField: 'updated value',
      })
      yield createToolCallChunk('end_turn', {})
      return promptSuccess('mock-message-id')
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    // Pre-populate the output with existing data
    agentState.output = {
      existingField: 'original value',
      anotherField: 'unchanged',
    }
    const localAgentTemplates = {
      'test-set-output-agent': testAgent,
    }

    const result = await runAgentStep({
      ...runAgentStepBaseParams,
      localAgentTemplates,
      agentTemplate: testAgent,
      agentState,
      prompt: 'Update the output',
      agentType: 'test-set-output-agent',
    })

    expect(result.agentState.output).toEqual({
      newField: 'new value',
      existingField: 'updated value',
    })
  })

  it('should handle empty output parameter', async () => {
    runAgentStepBaseParams.promptAiSdkStream = async function* ({}) {
      yield createToolCallChunk('set_output', {})
      yield createToolCallChunk('end_turn', {})
      return promptSuccess('mock-message-id')
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    agentState.output = { existingField: 'value' }
    const localAgentTemplates = {
      'test-set-output-agent': testAgent,
    }

    const result = await runAgentStep({
      ...runAgentStepBaseParams,
      localAgentTemplates,
      agentTemplate: testAgent,
      agentState,
      agentType: 'test-set-output-agent',
      prompt: 'Update with empty object',
    })

    // Should replace with empty object
    expect(result.agentState.output).toEqual({})
  })

  it('blocks suggest_followups when the agent gate has not allowed it yet', async () => {
    const chunks: unknown[] = []
    runAgentStepBaseParams = {
      ...runAgentStepBaseParams,
      onResponseChunk: (chunk) => chunks.push(chunk),
    }
    runAgentStepBaseParams.promptAiSdkStream = async function* ({}) {
      yield createToolCallChunk('suggest_followups', {
        followups: [{ prompt: 'Add tests', label: 'Add tests' }],
      })
      return promptSuccess('mock-message-id')
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState =
      sessionState.mainAgentState as typeof sessionState.mainAgentState & {
        canSuggestFollowups?: boolean
      }
    agentState.canSuggestFollowups = false
    const followupAgent: AgentTemplate = {
      ...testAgent,
      id: 'test-followup-agent',
      toolNames: ['suggest_followups', 'end_turn'],
    }

    await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: 'test-followup-agent',
      localAgentTemplates: { 'test-followup-agent': followupAgent },
      agentTemplate: followupAgent,
      agentState,
      prompt: 'Suggest followups too early',
    })

    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'error',
        message: expect.stringContaining(
          'Tool `suggest_followups` is not available yet',
        ),
      }),
    )
    expect(chunks).not.toContainEqual(
      expect.objectContaining({
        type: 'tool_call',
        toolName: 'suggest_followups',
      }),
    )
  })

  it('allows suggest_followups after the agent gate has allowed it', async () => {
    const chunks: unknown[] = []
    runAgentStepBaseParams = {
      ...runAgentStepBaseParams,
      onResponseChunk: (chunk) => chunks.push(chunk),
    }
    runAgentStepBaseParams.promptAiSdkStream = async function* ({}) {
      yield createToolCallChunk('suggest_followups', {
        followups: [{ prompt: 'Add tests', label: 'Add tests' }],
      })
      return promptSuccess('mock-message-id')
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState =
      sessionState.mainAgentState as typeof sessionState.mainAgentState & {
        canSuggestFollowups?: boolean
      }
    agentState.canSuggestFollowups = true
    const followupAgent: AgentTemplate = {
      ...testAgent,
      id: 'test-followup-agent',
      toolNames: ['suggest_followups', 'end_turn'],
    }

    await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: 'test-followup-agent',
      localAgentTemplates: { 'test-followup-agent': followupAgent },
      agentTemplate: followupAgent,
      agentState,
      prompt: 'Suggest followups after the gate',
    })

    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'tool_call',
        toolName: 'suggest_followups',
      }),
    )
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'tool_result',
        toolName: 'suggest_followups',
      }),
    )
  })

  it('blocks git-committer spawn when the validation/reviewer gate has not passed', async () => {
    const chunks: unknown[] = []
    runAgentStepBaseParams = {
      ...runAgentStepBaseParams,
      onResponseChunk: (chunk) => chunks.push(chunk),
    }
    runAgentStepBaseParams.promptAiSdkStream = async function* ({}) {
      yield createToolCallChunk('spawn_agents', {
        agents: [
          {
            agent_type: 'git-committer',
            prompt: 'Commit the changes',
            params: { owned_paths: ['src/a.ts'] },
          },
        ],
      })
      return promptSuccess('mock-message-id')
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState =
      sessionState.mainAgentState as typeof sessionState.mainAgentState & {
        canSuggestFollowups?: boolean
      }
    // canSuggestFollowups === false means the gate is not green.
    agentState.canSuggestFollowups = false
    const committerAgent: AgentTemplate = {
      ...testAgent,
      id: 'test-committer-agent',
      toolNames: ['spawn_agents', 'end_turn'],
      spawnableAgents: ['git-committer'],
    }

    await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: 'test-committer-agent',
      localAgentTemplates: { 'test-committer-agent': committerAgent },
      agentTemplate: committerAgent,
      agentState,
      prompt: 'Commit before the gate passes',
    })

    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'error',
        message: expect.stringContaining(
          'Spawning `git-committer` is not available yet',
        ),
      }),
    )
    expect(chunks).not.toContainEqual(
      expect.objectContaining({
        type: 'tool_call',
        toolName: 'spawn_agents',
      }),
    )
  })

  it('filters git-committer from a mixed spawn_agents batch while proceeding with other agents', async () => {
    const chunks: unknown[] = []
    runAgentStepBaseParams = {
      ...runAgentStepBaseParams,
      onResponseChunk: (chunk) => chunks.push(chunk),
    }
    const helperAgent: AgentTemplate = {
      ...testAgent,
      id: 'test-helper-agent',
      toolNames: ['end_turn'],
      spawnableAgents: [],
    }
    // The parent yields the mixed spawn_agents batch once; the spawned helper
    // agent re-invokes this same stream, so subsequent calls must end_turn to
    // avoid infinite spawn recursion.
    let streamCallCount = 0
    runAgentStepBaseParams.promptAiSdkStream = async function* ({}) {
      streamCallCount += 1
      if (streamCallCount === 1) {
        yield createToolCallChunk('spawn_agents', {
          agents: [
            {
              agent_type: 'git-committer',
              prompt: 'Commit the changes',
              params: { owned_paths: ['src/a.ts'] },
            },
            {
              agent_type: 'test-helper-agent',
              prompt: 'Do something else',
            },
          ],
        })
      } else {
        yield createToolCallChunk('end_turn', {})
      }
      return promptSuccess('mock-message-id')
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState =
      sessionState.mainAgentState as typeof sessionState.mainAgentState & {
        canSuggestFollowups?: boolean
      }
    // canSuggestFollowups === false means the gate is not green.
    agentState.canSuggestFollowups = false
    const committerAgent: AgentTemplate = {
      ...testAgent,
      id: 'test-committer-agent',
      toolNames: ['spawn_agents', 'end_turn'],
      spawnableAgents: ['git-committer', 'test-helper-agent'],
    }

    await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: 'test-committer-agent',
      localAgentTemplates: {
        'test-committer-agent': committerAgent,
        'test-helper-agent': helperAgent,
      },
      agentTemplate: committerAgent,
      agentState,
      prompt: 'Commit and do other work before the gate passes',
    })

    // The git-committer entry is blocked with an error chunk.
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'error',
        message: expect.stringContaining(
          'Spawning `git-committer` is not available yet',
        ),
      }),
    )
    // The spawn_agents tool_call proceeds with only the helper agent.
    const spawnCall = chunks.find(
      (chunk) =>
        chunk &&
        typeof chunk === 'object' &&
        (chunk as Record<string, unknown>).type === 'tool_call' &&
        (chunk as Record<string, unknown>).toolName === 'spawn_agents',
    ) as Record<string, unknown> | undefined
    expect(spawnCall).toBeDefined()
    const spawnInput = spawnCall?.input as { agents: Array<{ agent_type: string }> }
    expect(spawnInput.agents).toHaveLength(1)
    expect(spawnInput.agents[0]?.agent_type).toBe('test-helper-agent')
  })

  it('warns when a spawn_agents entry exceeds the soft payload size limit', async () => {
    const chunks: unknown[] = []
    runAgentStepBaseParams = {
      ...runAgentStepBaseParams,
      onResponseChunk: (chunk) => chunks.push(chunk),
    }
    // Spy on the logger threaded into executeToolCall so we can assert the
    // soft payload-size warning fires for the oversized entry only.
    const baseLogger = (runAgentStepBaseParams as unknown as {
      logger: { warn: (...args: unknown[]) => void }
    }).logger
    const warnSpy = spyOn(baseLogger, 'warn').mockImplementation(() => {})

    const helperAgent: AgentTemplate = {
      ...testAgent,
      id: 'test-helper-agent',
      toolNames: ['end_turn'],
      spawnableAgents: [],
    }
    // One oversized entry (>4KB serialized) and one small entry. The parent
    // yields the batch once; the spawned helper re-invokes this stream, so
    // subsequent calls end_turn to avoid infinite spawn recursion.
    const largeBody = 'x'.repeat(5000)
    let streamCallCount = 0
    runAgentStepBaseParams.promptAiSdkStream = async function* ({}) {
      streamCallCount += 1
      if (streamCallCount === 1) {
        yield createToolCallChunk('spawn_agents', {
          agents: [
            { agent_type: 'test-helper-agent', prompt: largeBody },
            { agent_type: 'test-helper-agent', prompt: 'small' },
          ],
        })
      } else {
        yield createToolCallChunk('end_turn', {})
      }
      return promptSuccess('mock-message-id')
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    const committerAgent: AgentTemplate = {
      ...testAgent,
      id: 'test-committer-agent',
      toolNames: ['spawn_agents', 'end_turn'],
      spawnableAgents: ['test-helper-agent'],
    }

    await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: 'test-committer-agent',
      localAgentTemplates: {
        'test-committer-agent': committerAgent,
        'test-helper-agent': helperAgent,
      },
      agentTemplate: committerAgent,
      agentState,
      prompt: 'Spawn with a large payload',
    })

    // Exactly the oversized entry triggers the soft payload-size warning.
    const payloadWarnings = warnSpy.mock.calls.filter((call) =>
      String(call[1] ?? '').includes('exceeds the soft payload size limit'),
    )
    expect(payloadWarnings).toHaveLength(1)
  })

  it('blocks suggest_followups after same-step file edits even when the gate started open', async () => {
    const chunks: unknown[] = []
    runAgentStepBaseParams = {
      ...runAgentStepBaseParams,
      onResponseChunk: (chunk) => chunks.push(chunk),
      requestToolCall: async () => ({
        output: [
          {
            type: 'json',
            value: {
              file: 'src/a.ts',
              message: 'File written successfully.',
            },
          },
        ],
      }),
    }
    runAgentStepBaseParams.promptAiSdkStream = async function* ({}) {
      yield createToolCallChunk('write_file', {
        path: 'src/a.ts',
        instructions: 'Write file',
        content: 'export const a = 1\n',
      })
      yield createToolCallChunk('suggest_followups', {
        followups: [{ prompt: 'Add tests', label: 'Add tests' }],
      })
      return promptSuccess('mock-message-id')
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState =
      sessionState.mainAgentState as typeof sessionState.mainAgentState & {
        canSuggestFollowups?: boolean
      }
    agentState.canSuggestFollowups = true
    const followupAgent: AgentTemplate = {
      ...testAgent,
      id: 'test-followup-agent',
      toolNames: ['write_file', 'suggest_followups', 'end_turn'],
    }

    await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: 'test-followup-agent',
      localAgentTemplates: { 'test-followup-agent': followupAgent },
      agentTemplate: followupAgent,
      agentState,
      prompt: 'Edit after the gate and then suggest followups',
    })

    expect(chunks).toContainEqual(
      expect.objectContaining({ type: 'tool_call', toolName: 'write_file' }),
    )
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'error',
        message: expect.stringContaining(
          'Tool `suggest_followups` is not available yet',
        ),
      }),
    )
    expect(chunks).not.toContainEqual(
      expect.objectContaining({
        type: 'tool_call',
        toolName: 'suggest_followups',
      }),
    )
  })

  it('retracts canSuggestFollowups on agentState after a file-changing tool executes', async () => {
    // Regression for Bug 1: canSuggestFollowups is computed once at the top of
    // the orchestrator's loop from the prior gate state. If a file-changing
    // tool executes mid-step, the flag must be immediately retracted on
    // agentState so a later tool-call batch in the same step (or a downstream
    // check reading agentState) cannot see a stale `true` value that bypasses
    // the validation/reviewer gate. The same-batch toolCalls.some() check in
    // tool-executor.ts covers the batch containing the edit; this mutation
    // covers cross-batch and post-step reads.
    runAgentStepBaseParams = {
      ...runAgentStepBaseParams,
      requestToolCall: async () => ({
        output: [
          {
            type: 'json',
            value: {
              file: 'src/a.ts',
              message: 'File written successfully.',
            },
          },
        ],
      }),
    }
    runAgentStepBaseParams.promptAiSdkStream = async function* ({}) {
      yield createToolCallChunk('write_file', {
        path: 'src/a.ts',
        instructions: 'Write file',
        content: 'export const a = 1\n',
      })
      yield createToolCallChunk('end_turn', {})
      return promptSuccess('mock-message-id')
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState =
      sessionState.mainAgentState as typeof sessionState.mainAgentState & {
        canSuggestFollowups?: boolean
      }
    agentState.canSuggestFollowups = true
    const followupAgent: AgentTemplate = {
      ...testAgent,
      id: 'test-followup-agent',
      toolNames: ['write_file', 'end_turn'],
    }

    await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: 'test-followup-agent',
      localAgentTemplates: { 'test-followup-agent': followupAgent },
      agentTemplate: followupAgent,
      agentState,
      prompt: 'Edit a file then end',
    })

    // The write_file execution must have retracted canSuggestFollowups on the
    // agentState object, even though end_turn ended the turn.
    expect(agentState.canSuggestFollowups).toBe(false)
  })

  it('blocks suggest_followups after same-step rewrite_symbol edits when the gate started open', async () => {
    const chunks: unknown[] = []
    runAgentStepBaseParams = {
      ...runAgentStepBaseParams,
      onResponseChunk: (chunk) => chunks.push(chunk),
      requestToolCall: async () => ({
        output: [
          {
            type: 'json',
            value: {
              file: 'src/a.ts',
              message: 'Symbol rewritten successfully.',
            },
          },
        ],
      }),
    }
    runAgentStepBaseParams.promptAiSdkStream = async function* ({}) {
      yield createToolCallChunk('rewrite_symbol', {
        path: 'src/a.ts',
        symbol: 'a',
        content: 'export const a = 1\n',
      })
      yield createToolCallChunk('suggest_followups', {
        followups: [{ prompt: 'Add tests', label: 'Add tests' }],
      })
      return promptSuccess('mock-message-id')
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState =
      sessionState.mainAgentState as typeof sessionState.mainAgentState & {
        canSuggestFollowups?: boolean
      }
    agentState.canSuggestFollowups = true
    const followupAgent: AgentTemplate = {
      ...testAgent,
      id: 'test-followup-agent',
      toolNames: ['rewrite_symbol', 'suggest_followups', 'end_turn'],
    }

    await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: 'test-followup-agent',
      localAgentTemplates: { 'test-followup-agent': followupAgent },
      agentTemplate: followupAgent,
      agentState,
      prompt: 'Rewrite after the gate and then suggest followups',
    })

    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'tool_call',
        toolName: 'rewrite_symbol',
      }),
    )
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'error',
        message: expect.stringContaining(
          'Tool `suggest_followups` is not available yet',
        ),
      }),
    )
    expect(chunks).not.toContainEqual(
      expect.objectContaining({
        type: 'tool_call',
        toolName: 'suggest_followups',
      }),
    )
  })

  it('blocks file edits after same-step suggest_followups in gated final response steps', async () => {
    const chunks: unknown[] = []
    runAgentStepBaseParams = {
      ...runAgentStepBaseParams,
      onResponseChunk: (chunk) => chunks.push(chunk),
    }
    runAgentStepBaseParams.promptAiSdkStream = async function* ({}) {
      yield createToolCallChunk('suggest_followups', {
        followups: [{ prompt: 'Add tests', label: 'Add tests' }],
      })
      yield createToolCallChunk('write_file', {
        path: 'src/a.ts',
        instructions: 'Write file',
        content: 'export const a = 1\n',
      })
      return promptSuccess('mock-message-id')
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState =
      sessionState.mainAgentState as typeof sessionState.mainAgentState & {
        canSuggestFollowups?: boolean
      }
    agentState.canSuggestFollowups = true
    const followupAgent: AgentTemplate = {
      ...testAgent,
      id: 'test-followup-agent',
      toolNames: ['write_file', 'suggest_followups', 'end_turn'],
    }

    await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: 'test-followup-agent',
      localAgentTemplates: { 'test-followup-agent': followupAgent },
      agentTemplate: followupAgent,
      agentState,
      prompt: 'Suggest followups and then try to edit',
    })

    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'tool_call',
        toolName: 'suggest_followups',
      }),
    )
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'error',
        message: expect.stringContaining(
          'File-changing tools are not available after suggest_followups',
        ),
      }),
    )
    expect(chunks).not.toContainEqual(
      expect.objectContaining({ type: 'tool_call', toolName: 'write_file' }),
    )
  })

  it('blocks rewrite_symbol after same-step suggest_followups in gated final response steps', async () => {
    const chunks: unknown[] = []
    runAgentStepBaseParams = {
      ...runAgentStepBaseParams,
      onResponseChunk: (chunk) => chunks.push(chunk),
    }
    runAgentStepBaseParams.promptAiSdkStream = async function* ({}) {
      yield createToolCallChunk('suggest_followups', {
        followups: [{ prompt: 'Add tests', label: 'Add tests' }],
      })
      yield createToolCallChunk('rewrite_symbol', {
        path: 'src/a.ts',
        symbol: 'a',
        content: 'export const a = 1\n',
      })
      return promptSuccess('mock-message-id')
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState =
      sessionState.mainAgentState as typeof sessionState.mainAgentState & {
        canSuggestFollowups?: boolean
      }
    agentState.canSuggestFollowups = true
    const followupAgent: AgentTemplate = {
      ...testAgent,
      id: 'test-followup-agent',
      toolNames: ['rewrite_symbol', 'suggest_followups', 'end_turn'],
    }

    await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: 'test-followup-agent',
      localAgentTemplates: { 'test-followup-agent': followupAgent },
      agentTemplate: followupAgent,
      agentState,
      prompt: 'Suggest followups and then try to rewrite',
    })

    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'tool_call',
        toolName: 'suggest_followups',
      }),
    )
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'error',
        message: expect.stringContaining(
          'File-changing tools are not available after suggest_followups',
        ),
      }),
    )
    expect(chunks).not.toContainEqual(
      expect.objectContaining({
        type: 'tool_call',
        toolName: 'rewrite_symbol',
      }),
    )
  })

  it('should handle handleSteps with one tool call and STEP_ALL', async () => {
    // Create a mock agent template with handleSteps
    const mockAgentTemplate: AgentTemplate = {
      id: 'test-handlesteps-agent',
      displayName: 'Test HandleSteps Agent',
      spawnerPrompt: 'Testing handleSteps functionality',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'structured_output' as const,
      includeMessageHistory: true,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['read_files', 'end_turn'],
      spawnableAgents: [],
      systemPrompt: 'Test system prompt',
      instructionsPrompt: 'Test instructions prompt',
      stepPrompt: 'Test agent step prompt',
      handleSteps: function* ({ agentState, prompt, params }) {
        // Yield one tool call
        yield {
          toolName: 'read_files',
          input: { paths: ['src/test.ts'] },
        }
        // Then yield STEP_ALL to continue processing
        yield 'STEP_ALL'
      },
    }

    // Mock the agent registry to include our test agent
    const mockAgentRegistry = {
      'test-handlesteps-agent': mockAgentTemplate,
    }

    // Mock requestFiles to return test file content
    runAgentStepBaseParams.requestFiles = async ({ filePaths }) => {
      const results: Record<string, string | null> = {}
      filePaths.forEach((p) => {
        if (p === 'src/test.ts') {
          results[p] = 'export function testFunction() { return "test"; }'
        } else {
          results[p] = null
        }
      })
      return results
    }

    // Mock the LLM stream to return a response that doesn't end the turn
    runAgentStepBaseParams.promptAiSdkStream = async function* ({}) {
      yield { type: 'text' as const, text: 'Continuing with the analysis...' } // Non-empty response, no tool calls
      return promptSuccess('mock-message-id')
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState

    // Add the user prompt and instructions that would normally be added by loopAgentSteps
    agentState.messageHistory = [
      ...agentState.messageHistory,
      userMessage({
        content: asUserMessage('Test the handleSteps functionality'),
        keepDuringTruncation: true,
      }),
      userMessage({
        content: 'Test instructions prompt',
        timeToLive: 'userPrompt' as const,
        keepDuringTruncation: true,
      }),
    ]

    const initialMessageCount = agentState.messageHistory.length

    const result = await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: 'test-handlesteps-agent',
      localAgentTemplates: mockAgentRegistry,
      agentTemplate: mockAgentTemplate,
      agentState,
      prompt: 'Test the handleSteps functionality',
    })

    // Should end turn because toolCalls.length === 0 && toolResults.length === 0 from LLM processing
    // (The programmatic step tool results don't count toward this calculation)
    expect(result.shouldEndTurn).toBe(true)

    const finalMessages = result.agentState.messageHistory

    // Verify the exact sequence of messages in the final message history
    const newMessages = finalMessages.slice(initialMessageCount)

    // Check that we have the user prompt in the full message history
    expect(
      finalMessages.some(
        (m) =>
          m.role === 'user' &&
          m.content[0].type === 'text' &&
          m.content[0].text.includes('Test the handleSteps functionality'),
      ),
    ).toBe(true)

    // The test should verify that the LLM response is correctly processed
    expect(
      newMessages.some(
        (m) =>
          m.role === 'assistant' &&
          m.content[0].type === 'text' &&
          m.content[0].text === 'Continuing with the analysis...',
      ),
    ).toBe(true)
  })

  it('should spawn agent inline that deletes last two assistant messages', async () => {
    // Create a mock inline agent template that deletes messages
    const mockInlineAgentTemplate: AgentTemplate = {
      id: 'message-deleter-agent',
      displayName: 'Message Deleter Agent',
      spawnerPrompt: 'Deletes assistant messages',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'structured_output' as const,
      includeMessageHistory: true,
      messageHistoryMode: 'full',
      propagateMessageHistoryChanges: true,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['set_messages', 'end_turn'],
      spawnableAgents: [],
      systemPrompt: 'Delete messages system prompt',
      instructionsPrompt: 'Delete messages instructions prompt',
      stepPrompt: 'Delete messages step prompt',
      handleSteps: function* ({ agentState, prompt, params }) {
        // Delete the last two assistant messages by doing two iterations
        const messages = [...agentState.messageHistory]

        // First iteration: find and remove the last assistant message, which is the tool call to this agent
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant') {
            messages.splice(i, 1)
            break
          }
        }

        // Second iteration: find and remove the next-to-last assistant message
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant') {
            messages.splice(i, 1)
            break
          }
        }

        // Third iteration: find and remove the third assistant message
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant') {
            messages.splice(i, 1)
            break
          }
        }

        // Set the updated messages
        yield {
          toolName: 'set_messages',
          input: { messages },
        }
      },
    }

    // Create a parent agent template that can spawn the inline agent
    const mockParentAgentTemplate: AgentTemplate = {
      id: 'parent-agent',
      displayName: 'Parent Agent',
      spawnerPrompt: 'Parent agent that spawns inline agents',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'structured_output' as const,
      includeMessageHistory: true,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['spawn_agent_inline', 'end_turn'],
      spawnableAgents: ['message-deleter-agent'],
      systemPrompt: 'Parent system prompt',
      instructionsPrompt: 'Parent instructions prompt',
      stepPrompt: 'Parent step prompt',
    }

    // Mock the agent registry to include both agents
    const mockAgentRegistry = {
      'parent-agent': mockParentAgentTemplate,
      'message-deleter-agent': mockInlineAgentTemplate,
    }

    // Mock the LLM stream to spawn the inline agent
    runAgentStepBaseParams.promptAiSdkStream = async function* ({}) {
      yield createToolCallChunk('spawn_agent_inline', {
        agent_type: 'message-deleter-agent',
        prompt: 'Delete the last two assistant messages',
      })
      return promptSuccess('mock-message-id')
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState

    // Add some initial messages including assistant messages to delete
    agentState.messageHistory = [
      userMessage('Hello'),
      assistantMessage('Hi there!'),
      userMessage('How are you?'),
      assistantMessage('I am doing well, thank you!'),
      userMessage('Can you help me?'),
      assistantMessage('Of course, I would be happy to help!'),
      // Add the user prompt and instructions that would normally be added by loopAgentSteps
      userMessage({
        content: 'Spawn an inline agent to clean up messages',
        keepDuringTruncation: true,
      }),
      userMessage({
        content: 'Parent instructions prompt',
        timeToLive: 'userPrompt' as const,
        keepDuringTruncation: true,
      }),
    ]

    const result = await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: 'parent-agent',
      localAgentTemplates: mockAgentRegistry,
      agentTemplate: mockParentAgentTemplate,
      agentState,
      prompt: 'Spawn an inline agent to clean up messages',
    })

    const finalMessages = result.agentState.messageHistory

    // This integration test demonstrates that spawn_agent_inline tool calls are executed successfully!
    // The inline agent runs its handleSteps function and executes tool calls

    // Verify that the inline agent executed and messages were properly deleted
    // After refactoring, the execution flow may be different but the end result should be the same

    // Check that some assistant messages were deleted (we started with 3, should have fewer now)
    const assistantMessagesCount = finalMessages.filter(
      (m) => m.role === 'assistant',
    ).length
    expect(assistantMessagesCount).toBeLessThan(3) // We should have deleted some assistant messages

    // Check that we have the user prompt that triggered the inline agent
    expect(
      finalMessages.some(
        (m) =>
          m.role === 'user' &&
          m.content[0].type === 'text' &&
          m.content[0].text.includes(
            'Spawn an inline agent to clean up messages',
          ),
      ),
    ).toBe(true)

    // The final messages should still contain the core conversation structure
    expect(
      finalMessages.some(
        (m) =>
          m.role === 'user' &&
          m.content[0].type === 'text' &&
          m.content[0].text === 'Hello',
      ),
    ).toBe(true)
    expect(
      finalMessages.some(
        (m) =>
          m.role === 'user' &&
          m.content[0].type === 'text' &&
          m.content[0].text === 'How are you?',
      ),
    ).toBe(true)
    expect(
      finalMessages.some(
        (m) =>
          m.role === 'user' &&
          m.content[0].type === 'text' &&
          m.content[0].text === 'Can you help me?',
      ),
    ).toBe(true)
  })

  it('stops the turn via the no-progress watchdog after REPEATED_STEP_LOOP_LIMIT repeated check_job polling steps', async () => {
    // An agent that polls a single background job with check_job. It has no
    // programmatic handleSteps, does not require task_completed, and uses
    // end_turn only as a fallback tool — the stream never emits end_turn, so
    // the turn must NOT end naturally. The repeated-step-loop guard is the
    // only thing that can stop the turn.
    const pollingAgent: AgentTemplate = {
      id: 'test-polling-agent',
      displayName: 'Test Polling Agent',
      spawnerPrompt: 'Polls a background job until the watchdog stops it',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'last_message' as const,
      includeMessageHistory: true,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['check_job', 'end_turn'],
      spawnableAgents: [],
      systemPrompt: 'Test system prompt',
      instructionsPrompt: 'Test instructions prompt',
      stepPrompt: 'Poll the render job for completion',
    }

    const localAgentTemplates: Record<string, AgentTemplate> = {
      'test-polling-agent': pollingAgent,
    }

    // Each step's check_job call polls the same jobId but varies wait_for,
    // timeout_seconds, and cursor so the raw payloads diverge. The guard's
    // polling normalization collapses these to an identical (toolName, jobId)
    // signature, so the repeat counter ticks once per step.
    let stepIndex = 0
    runAgentStepBaseParams = {
      ...runAgentStepBaseParams,
      promptAiSdkStream: async function* () {
        yield createToolCallChunk('check_job', {
          jobId: 'stuck-render',
          wait_for: stepIndex % 2 === 0 ? 'complete' : 'ready',
          timeout_seconds: 5 + (stepIndex % 3),
          cursor: `cursor-${stepIndex}`,
        })
        yield { type: 'text' as const, text: `Polling step ${stepIndex + 1}` }
        return promptSuccess('mock-message-id')
      },
      requestToolCall: async () => ({
        output: [
          {
            type: 'json',
            value: {
              toolName: 'check_job',
              jobId: 'stuck-render',
              status: 'running',
              chunk: `poll-output-${stepIndex}`,
            },
          },
        ],
      }),
    }

    let sessionState = getInitialSessionState(mockFileContext)
    let agentState = sessionState.mainAgentState
    let resultShouldEndTurn = false
    let resultAgentState = agentState

    for (stepIndex = 0; stepIndex < REPEATED_STEP_LOOP_LIMIT; stepIndex++) {
      const result = await runAgentStep({
        ...runAgentStepBaseParams,
        agentType: 'test-polling-agent',
        localAgentTemplates,
        agentTemplate: pollingAgent,
        agentState,
        prompt: 'Poll the render job for completion',
      })

      resultShouldEndTurn = result.shouldEndTurn
      resultAgentState = result.agentState
      // Thread the returned agentState into the next step so the guard's
      // lastStepProgressSignature / repeatedStepProgressCount accumulate.
      agentState = result.agentState
    }

    expect(stepIndex).toBe(REPEATED_STEP_LOOP_LIMIT)

    // (a) The guard, not a natural turn end, stopped the turn.
    expect(resultShouldEndTurn).toBe(true)

    // (b) A NO_PROGRESS_LOOP_GUARD assistant message was recorded.
    expect(
      resultAgentState.messageHistory.some(
        (m) =>
          m.role === 'assistant' &&
          Array.isArray(m.tags) &&
          m.tags.includes('NO_PROGRESS_LOOP_GUARD'),
      ),
    ).toBe(true)

    // (c) The last step's progress signature is a defined string.
    expect(typeof resultAgentState.lastStepProgressSignature).toBe('string')
    expect(resultAgentState.lastStepProgressSignature).toBeTruthy()

    // (d) The repeat count equals the limit.
    expect(resultAgentState.repeatedStepProgressCount).toBe(
      REPEATED_STEP_LOOP_LIMIT,
    )
  })
})
