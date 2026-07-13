import * as analytics from '@codebuff/common/analytics'
import { createHash } from 'node:crypto'
import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { createTestAgentRuntimeParams } from '@codebuff/common/testing/fixtures/agent-runtime'
import { promptSuccess } from '@codebuff/common/util/error'
import { userMessage } from '@codebuff/common/util/messages'
import {
  AgentTemplateTypes,
  getInitialSessionState,
} from '@codebuff/common/types/session-state'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

import { mainPrompt } from '../main-prompt'
import * as processFileBlockModule from '../process-file-block'
import { createToolCallChunk } from './test-utils'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type {
  RequestFilesFn,
  RequestOptionalFileFn,
  RequestToolCallFn,
} from '@codebuff/common/types/contracts/client'
import type { ParamsOf } from '@codebuff/common/types/function-params'
import type { ProjectFileContext } from '@codebuff/common/util/file'

let mainPromptBaseParams: any

import type { StreamChunk } from '@codebuff/common/types/contracts/llm'

const mockAgentStream = (chunks: StreamChunk[]) => {
  mainPromptBaseParams.promptAiSdkStream = async function* ({}) {
    for (const chunk of chunks) {
      yield chunk
    }
    return 'mock-message-id'
  }
}

describe('mainPrompt', () => {
  let mockLocalAgentTemplates: Record<string, any>

  beforeEach(() => {
    // Setup common mock agent templates
    mockLocalAgentTemplates = {
      [AgentTemplateTypes.base]: {
        id: AgentTemplateTypes.base,
        displayName: 'Base Agent',
        outputMode: 'last_message',
        inputSchema: {},
        spawnerPrompt: '',
        model: 'gpt-4o-mini',
        includeMessageHistory: true,
        inheritParentSystemPrompt: false,
        mcpServers: {},
        toolNames: ['write_file', 'run_terminal_command', 'end_turn'],
        spawnableAgents: [],
        systemPrompt: '',
        instructionsPrompt: '',
        stepPrompt: '',
      } satisfies AgentTemplate,
      [AgentTemplateTypes.base_max]: {
        id: AgentTemplateTypes.base_max,
        displayName: 'Base Max Agent',
        outputMode: 'last_message',
        inputSchema: {},
        spawnerPrompt: '',
        model: 'gpt-4o',
        includeMessageHistory: true,
        inheritParentSystemPrompt: false,
        mcpServers: {},
        toolNames: ['write_file', 'run_terminal_command', 'end_turn'],
        spawnableAgents: [],
        systemPrompt: '',
        instructionsPrompt: '',
        stepPrompt: '',
      } satisfies AgentTemplate,
    }

    mainPromptBaseParams = {
      ...createTestAgentRuntimeParams(),
      repoId: undefined,
      repoUrl: undefined,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
      localAgentTemplates: mockLocalAgentTemplates,
      signal: new AbortController().signal,
      // Mock fetch to return a token count response
      fetch: async () =>
        ({
          ok: true,
          text: async () => JSON.stringify({ inputTokens: 1000 }),
        }) as Response,
    }

    // Mock analytics
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})

    // Mock processFileBlock
    spyOn(processFileBlockModule, 'processFileBlock').mockImplementation(
      async (params) => {
        return promptSuccess({
          tool: 'write_file' as const,
          path: params.path,
          content: params.newContent,
          patch: undefined,
          messages: [],
        })
      },
    )

    // Mock LLM APIs
    mockAgentStream([{ type: 'text', text: 'Test response' }])

    // Mock websocket actions
    mainPromptBaseParams.requestFiles = async ({
      filePaths,
    }: ParamsOf<RequestFilesFn>) => {
      const results: Record<string, string | null> = {}
      filePaths.forEach((p) => {
        if (p === 'test.txt') {
          results[p] = 'mock content for test.txt'
        } else {
          results[p] = null
        }
      })
      return results
    }

    mainPromptBaseParams.requestOptionalFile = async ({
      filePath,
    }: ParamsOf<RequestOptionalFileFn>) => {
      if (filePath === 'test.txt') {
        return 'mock content for test.txt'
      }
      return null
    }

    mainPromptBaseParams.requestToolCall = mock(
      async ({
        toolName,
        input,
      }: ParamsOf<RequestToolCallFn>): ReturnType<RequestToolCallFn> => ({
        output: [
          {
            type: 'json',
            value: `Tool call success: ${{ toolName, input }}`,
          },
        ],
      }),
    )
  })

  afterEach(() => {
    // Clear all mocks after each test
    mock.restore()
  })

  class _MockWebSocket {
    send(msg: string) {}
    close() {}
    on(event: string, listener: (...args: any[]) => void) {}
    removeListener(event: string, listener: (...args: any[]) => void) {}
  }

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
    agentTemplates: {},
    customToolDefinitions: {},
    systemInfo: {
      platform: 'test',
      shell: 'test',
      nodeVersion: 'test',
      arch: 'test',
      homedir: '/home/test',
      cpus: 1,
      chromeAvailable: false,
    },
  }

  it('does not include other local agents in spawnableAgents when agentId is provided', async () => {
    // When a specific agentId is provided, we only use the spawnable agents
    // defined in that agent's template - we don't auto-add all available agents
    const sessionState = getInitialSessionState(mockFileContext)
    const mainAgentId = 'test-main-agent'
    const localAgentId = 'test-local-agent'

    const localAgentTemplates: Record<string, AgentTemplate> = {
      [mainAgentId]: {
        id: mainAgentId,
        displayName: 'Test Main Agent',
        outputMode: 'last_message',
        inputSchema: {},
        spawnerPrompt: '',
        model: 'gpt-4o-mini',
        includeMessageHistory: true,
        inheritParentSystemPrompt: false,
        mcpServers: {},
        toolNames: ['write_file', 'run_terminal_command', 'end_turn'],
        spawnableAgents: [],
        systemPrompt: '',
        instructionsPrompt: '',
        stepPrompt: '',
      },
      [localAgentId]: {
        id: localAgentId,
        displayName: 'Test Local Agent',
        outputMode: 'last_message',
        inputSchema: {},
        spawnerPrompt: '',
        model: 'gpt-4o-mini',
        includeMessageHistory: false,
        inheritParentSystemPrompt: false,
        mcpServers: {},
        toolNames: ['write_file', 'run_terminal_command', 'end_turn'],
        spawnableAgents: [],
        systemPrompt: '',
        instructionsPrompt: '',
        stepPrompt: '',
      },
    }

    const action = {
      type: 'prompt' as const,
      prompt: 'Hello',
      sessionState,
      fingerprintId: 'test',
      costMode: 'normal' as const,
      promptId: 'test',
      toolResults: [],
      agentId: mainAgentId,
    }

    await mainPrompt({
      ...mainPromptBaseParams,
      action,
      localAgentTemplates,
    })

    // When agentId is provided, spawnableAgents should only contain what was
    // explicitly defined in the template (empty in this case)
    expect(localAgentTemplates[mainAgentId].spawnableAgents).not.toContain(
      localAgentId,
    )
    expect(localAgentTemplates[mainAgentId].spawnableAgents).toEqual([])
  })

  it('should handle write_file tool call', async () => {
    // Mock LLM to return a write_file tool call using native tool call chunks
    mockAgentStream([
      createToolCallChunk('write_file', {
        path: 'new-file.txt',
        instructions: 'Added Hello World',
        content: 'Hello, world!',
      }),
      createToolCallChunk('end_turn', {}),
    ])

    // Get reference to the spy so we can check if it was called
    const requestToolCallSpy = mainPromptBaseParams.requestToolCall

    const sessionState = getInitialSessionState(mockFileContext)
    const action = {
      type: 'prompt' as const,
      prompt: 'Write hello world to new-file.txt',
      sessionState,
      fingerprintId: 'test',
      costMode: 'max' as const, // This causes streamGemini25Pro to be called
      promptId: 'test',
      toolResults: [],
    }

    await mainPrompt({
      ...mainPromptBaseParams,
      action,
      localAgentTemplates: {
        [AgentTemplateTypes.base]: {
          id: 'base',
          displayName: 'Base Agent',
          outputMode: 'last_message',
          inputSchema: {},
          spawnerPrompt: '',
          model: 'gpt-4o-mini',
          includeMessageHistory: true,
          inheritParentSystemPrompt: false,
          mcpServers: {},
          toolNames: ['write_file', 'run_terminal_command', 'end_turn'],
          spawnableAgents: [],
          systemPrompt: '',
          instructionsPrompt: '',
          stepPrompt: '',
        },
        [AgentTemplateTypes.base_max]: {
          id: 'base-max',
          displayName: 'Base Max Agent',
          outputMode: 'last_message',
          inputSchema: {},
          spawnerPrompt: '',
          model: 'gpt-4o',
          includeMessageHistory: true,
          inheritParentSystemPrompt: false,
          mcpServers: {},
          toolNames: ['write_file', 'run_terminal_command', 'end_turn'],
          spawnableAgents: [],
          systemPrompt: '',
          instructionsPrompt: '',
          stepPrompt: '',
        },
      },
    })

    // Assert that requestToolCall was called exactly once
    expect(requestToolCallSpy).toHaveBeenCalledTimes(1)

    // Verify the write_file call was made with the correct arguments
    expect(requestToolCallSpy).toHaveBeenCalledWith({
      userInputId: expect.any(String), // userInputId
      callId: expect.any(String),
      toolName: 'write_file',
      input: expect.objectContaining({
        type: 'file',
        path: 'new-file.txt',
        content: 'Hello, world!',
      }),
      signal: expect.any(AbortSignal),
    })
  })

  it('returns a resumable assistant checkpoint when the step cap is reached', async () => {
    const sessionState = getInitialSessionState(mockFileContext)

    sessionState.mainAgentState.stepsRemaining = 0
    sessionState.mainAgentState.messageHistory = [userMessage('Initial prompt')]

    const action = {
      type: 'prompt' as const,
      prompt: '', // No new prompt
      sessionState,
      fingerprintId: 'test',
      costMode: 'max' as const,
      promptId: 'test',
      toolResults: [],
    }

    const { output } = await mainPrompt({
      ...mainPromptBaseParams,
      action,
    })

    expect(output.type).toBe('lastMessage')
    if (output.type === 'lastMessage') {
      const checkpoint = output.value.at(-1)
      expect(checkpoint?.role).toBe('assistant')
      expect(checkpoint?.tags).toContain('STEP_CAP_REACHED')
      expect(JSON.stringify(checkpoint?.content)).toContain(
        'Agent step limit reached',
      )
      expect(JSON.stringify(checkpoint?.content)).not.toContain(
        "I've made quite a few responses",
      )
    }
  })

  it('does not decrement or stop the default unlimited step sentinel', async () => {
    const sessionState = getInitialSessionState(mockFileContext)
    expect(sessionState.mainAgentState.stepsRemaining).toBe(-1)
    sessionState.mainAgentState.lastStepProgressSignature = 'sha256:stale'
    sessionState.mainAgentState.repeatedStepProgressCount = 5

    const { sessionState: nextState } = await mainPrompt({
      ...mainPromptBaseParams,
      action: {
        type: 'prompt' as const,
        prompt: 'Respond normally.',
        sessionState,
        fingerprintId: 'test',
        costMode: 'max' as const,
        promptId: 'test',
        toolResults: [],
      },
      localAgentTemplates: mockLocalAgentTemplates,
    })

    expect(nextState.mainAgentState.stepsRemaining).toBe(-1)
    expect(nextState.mainAgentState.repeatedStepProgressCount).toBe(0)
  })

  it('should update consecutiveAssistantMessages when new prompt is received', async () => {
    const sessionState = getInitialSessionState(mockFileContext)
    sessionState.mainAgentState.stepsRemaining = 12
    const initialStepsRemaining = sessionState.mainAgentState.stepsRemaining

    const action = {
      type: 'prompt' as const,
      prompt: 'New user prompt',
      sessionState,
      fingerprintId: 'test',
      costMode: 'max' as const,
      promptId: 'test',
      toolResults: [],
    }

    const { sessionState: newSessionState } = await mainPrompt({
      ...mainPromptBaseParams,
      action,
      localAgentTemplates: mockLocalAgentTemplates,
    })

    // When there's a new prompt, consecutiveAssistantMessages should be set to 1
    expect(newSessionState.mainAgentState.stepsRemaining).toBe(
      initialStepsRemaining - 1,
    )
  })

  it('should increment consecutiveAssistantMessages when no new prompt', async () => {
    const sessionState = getInitialSessionState(mockFileContext)
    const initialCount = 5
    sessionState.mainAgentState.stepsRemaining = initialCount

    const action = {
      type: 'prompt' as const,
      prompt: '', // No new prompt
      sessionState,
      fingerprintId: 'test',
      costMode: 'max' as const,
      promptId: 'test',
      toolResults: [],
    }

    const { sessionState: newSessionState } = await mainPrompt({
      ...mainPromptBaseParams,
      action,
      localAgentTemplates: mockLocalAgentTemplates,
    })

    // When there's no new prompt, consecutiveAssistantMessages should increment by 1
    expect(newSessionState.mainAgentState.stepsRemaining).toBe(initialCount - 1)
  })

  it('reuses the session system prompt across consecutive same-agent turns', async () => {
    const sessionState = getInitialSessionState(mockFileContext)
    const capturedSystemPrompts: string[] = []

    mainPromptBaseParams.promptAiSdkStream = async function* ({
      system,
    }: Parameters<typeof mainPromptBaseParams.promptAiSdkStream>[0]) {
      capturedSystemPrompts.push(system ?? '')
      yield { type: 'text' as const, text: 'Test response' }
      return 'mock-message-id'
    }

    const firstAction = {
      type: 'prompt' as const,
      prompt: 'First prompt',
      sessionState,
      fingerprintId: 'test',
      costMode: 'normal' as const,
      promptId: 'test-1',
      toolResults: [],
    }

    await mainPrompt({
      ...mainPromptBaseParams,
      action: firstAction,
      localAgentTemplates: mockLocalAgentTemplates,
    })

    const firstSystemPrompt = sessionState.mainAgentState.systemPrompt
    expect(firstSystemPrompt).not.toBe('')

    sessionState.fileContext.knowledgeFiles = {
      'knowledge.md': 'This file changed after the first turn.',
    }

    const secondAction = {
      ...firstAction,
      prompt: 'Second prompt',
      promptId: 'test-2',
    }

    await mainPrompt({
      ...mainPromptBaseParams,
      action: secondAction,
      localAgentTemplates: mockLocalAgentTemplates,
    })

    const hashPromptPrefix = (value: string) =>
      createHash('sha256').update(value.slice(0, 4096)).digest('hex')

    expect(capturedSystemPrompts).toHaveLength(2)
    expect(sessionState.mainAgentState.systemPrompt).toBe(firstSystemPrompt)
    expect(hashPromptPrefix(capturedSystemPrompts[1])).toBe(
      hashPromptPrefix(capturedSystemPrompts[0]),
    )
  })
})
