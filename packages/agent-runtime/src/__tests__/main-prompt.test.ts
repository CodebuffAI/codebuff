import * as bigquery from '@codebuff/bigquery'
import * as analytics from '@codebuff/common/analytics'
import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getToolCallString } from '@codebuff/common/tools/utils'
import {
  AgentTemplateTypes,
  getInitialSessionState,
} from '@codebuff/common/types/session-state'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

import * as checkTerminalCommandModule from '../check-terminal-command'
import { disableLiveUserInputCheck } from '../live-user-inputs'
import * as liveUserInputs from '../live-user-inputs'
import { mainPrompt } from '../main-prompt'
import * as processFileBlockModule from '../process-file-block'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { RequestToolCallFn } from '@codebuff/common/types/contracts/client'
import type { ParamsOf } from '@codebuff/common/types/function-params'
import type { ProjectFileContext } from '@codebuff/common/util/file'

let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps

const mockAgentStream = (streamOutput: string) => {
  agentRuntimeImpl.promptAiSdkStream = async function* ({}) {
    yield { type: 'text' as const, text: streamOutput }
    return 'mock-message-id'
  }
}

describe('mainPrompt', () => {
  let mockLocalAgentTemplates: Record<string, any>

  beforeAll(() => {
    disableLiveUserInputCheck()
  })

  beforeEach(() => {
    agentRuntimeImpl = { ...TEST_AGENT_RUNTIME_IMPL }

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
        toolNames: ['write_file', 'run_terminal_command'],
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
        toolNames: ['write_file', 'run_terminal_command'],
        spawnableAgents: [],
        systemPrompt: '',
        instructionsPrompt: '',
        stepPrompt: '',
      } satisfies AgentTemplate,
    }

    // Mock analytics and tracing
    spyOn(analytics, 'initAnalytics').mockImplementation(() => {})
    analytics.initAnalytics(agentRuntimeImpl) // Initialize the mock
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})
    spyOn(bigquery, 'insertTrace').mockImplementation(() =>
      Promise.resolve(true),
    ) // Return Promise<boolean>

    // Mock processFileBlock
    spyOn(processFileBlockModule, 'processFileBlock').mockImplementation(
      async (params) => {
        return {
          tool: 'write_file' as const,
          path: params.path,
          content: params.newContent,
          patch: undefined,
          messages: [],
        }
      },
    )

    // Mock LLM APIs
    mockAgentStream('Test response')

    // Mock websocket actions
    agentRuntimeImpl.requestFiles = async ({ filePaths }) => {
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

    agentRuntimeImpl.requestOptionalFile = async ({ filePath }) => {
      if (filePath === 'test.txt') {
        return 'mock content for test.txt'
      }
      return null
    }

    agentRuntimeImpl.requestToolCall = mock(
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

    spyOn(
      checkTerminalCommandModule,
      'checkTerminalCommand',
    ).mockImplementation(async () => null)

    // Mock live user inputs
    spyOn(liveUserInputs, 'checkLiveUserInput').mockImplementation(() => true)
  })

  afterEach(() => {
    // Clear all mocks after each test
    mock.restore()
  })

  class MockWebSocket {
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
    },
  }

  it('should handle direct terminal command', async () => {
    // Override the mock to return a terminal command
    spyOn(
      checkTerminalCommandModule,
      'checkTerminalCommand',
    ).mockImplementation(async () => 'ls -la')

    const sessionState = getInitialSessionState(mockFileContext)
    const action = {
      type: 'prompt' as const,
      prompt: 'ls -la',
      sessionState,
      fingerprintId: 'test',
      costMode: 'max' as const,
      promptId: 'test',
      toolResults: [],
    }

    const { sessionState: newSessionState, output } = await mainPrompt({
      ...agentRuntimeImpl,
      repoId: undefined,
      repoUrl: undefined,
      action,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
      localAgentTemplates: mockLocalAgentTemplates,
    })

    // Verify that requestToolCall was called with the terminal command
    const requestToolCallSpy = agentRuntimeImpl.requestToolCall
    expect(requestToolCallSpy).toHaveBeenCalledTimes(1)
    expect(requestToolCallSpy).toHaveBeenCalledWith({
      userInputId: expect.any(String), // userInputId
      toolName: 'run_terminal_command',
      input: expect.objectContaining({
        command: 'ls -la',
        mode: 'user',
        process_type: 'SYNC',
        timeout_seconds: -1,
      }),
    })

    // Verify that the output contains the expected structure
    expect(output.type).toBeDefined()

    // Verify that a tool result was added to message history
    const toolResultMessages =
      newSessionState.mainAgentState.messageHistory.filter(
        (m) => m.role === 'tool',
      )
    expect(toolResultMessages.length).toBeGreaterThan(0)
  })

  it('should handle write_file tool call', async () => {
    // Mock LLM to return a write_file tool call using getToolCallString
    const mockResponse =
      getToolCallString('write_file', {
        path: 'new-file.txt',
        instructions: 'Added Hello World',
        content: 'Hello, world!',
      }) + getToolCallString('end_turn', {})

    mockAgentStream(mockResponse)

    // Get reference to the spy so we can check if it was called
    const requestToolCallSpy = agentRuntimeImpl.requestToolCall

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
      ...agentRuntimeImpl,
      repoId: undefined,
      repoUrl: undefined,
      action,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
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
          toolNames: ['write_file', 'run_terminal_command'],
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
          toolNames: ['write_file', 'run_terminal_command'],
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
      toolName: 'write_file',
      input: expect.objectContaining({
        type: 'file',
        path: 'new-file.txt',
        content: 'Hello, world!',
      }),
    })
  })

  it('should force end of response after MAX_CONSECUTIVE_ASSISTANT_MESSAGES', async () => {
    const sessionState = getInitialSessionState(mockFileContext)

    // Set up message history with many consecutive assistant messages
    sessionState.mainAgentState.stepsRemaining = 0
    sessionState.mainAgentState.messageHistory = [
      { role: 'user', content: 'Initial prompt' },
      ...Array(20).fill({ role: 'assistant', content: 'Assistant response' }),
    ]

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
      ...agentRuntimeImpl,
      repoId: undefined,
      repoUrl: undefined,
      action,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
      localAgentTemplates: mockLocalAgentTemplates,
    })

    expect(output.type).toBeDefined() // Output should exist
  })

  it('should update consecutiveAssistantMessages when new prompt is received', async () => {
    const sessionState = getInitialSessionState(mockFileContext)
    sessionState.mainAgentState.stepsRemaining = 12

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
      ...agentRuntimeImpl,
      repoId: undefined,
      repoUrl: undefined,
      action,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
      localAgentTemplates: mockLocalAgentTemplates,
    })

    // When there's a new prompt, consecutiveAssistantMessages should be set to 1
    expect(newSessionState.mainAgentState.stepsRemaining).toBe(
      sessionState.mainAgentState.stepsRemaining - 1,
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
      ...agentRuntimeImpl,
      repoId: undefined,
      repoUrl: undefined,
      action,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
      localAgentTemplates: mockLocalAgentTemplates,
    })

    // When there's no new prompt, consecutiveAssistantMessages should increment by 1
    expect(newSessionState.mainAgentState.stepsRemaining).toBe(initialCount - 1)
  })

  it('should return no tool calls when LLM response is empty', async () => {
    // Mock the LLM stream to return nothing
    mockAgentStream('')

    const sessionState = getInitialSessionState(mockFileContext)
    const action = {
      type: 'prompt' as const,
      prompt: 'Test prompt leading to empty response',
      sessionState,
      fingerprintId: 'test',
      costMode: 'normal' as const,
      promptId: 'test',
      toolResults: [],
    }

    const { output } = await mainPrompt({
      ...agentRuntimeImpl,
      repoId: undefined,
      repoUrl: undefined,
      action,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
      localAgentTemplates: mockLocalAgentTemplates,
    })

    expect(output.type).toBeDefined() // Output should exist even for empty response
  })

  it('should unescape ampersands in run_terminal_command tool calls', async () => {
    const sessionState = getInitialSessionState(mockFileContext)
    const userPromptText = 'Run the backend tests'
    const escapedCommand = 'cd backend && bun test'
    const expectedCommand = 'cd backend && bun test'

    const mockResponse =
      getToolCallString('run_terminal_command', {
        command: escapedCommand,
        process_type: 'SYNC',
      }) + getToolCallString('end_turn', {})

    mockAgentStream(mockResponse)

    // Get reference to the spy so we can check if it was called
    const requestToolCallSpy = agentRuntimeImpl.requestToolCall

    const action = {
      type: 'prompt' as const,
      prompt: userPromptText,
      sessionState,
      fingerprintId: 'test',
      costMode: 'max' as const,
      promptId: 'test',
      toolResults: [],
    }

    await mainPrompt({
      ...agentRuntimeImpl,
      repoId: undefined,
      repoUrl: undefined,
      action,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
      localAgentTemplates: mockLocalAgentTemplates,
    })

    // Assert that requestToolCall was called exactly once
    expect(requestToolCallSpy).toHaveBeenCalledTimes(1)

    // Verify the run_terminal_command call was made with the correct arguments
    expect(requestToolCallSpy).toHaveBeenCalledWith({
      userInputId: expect.any(String), // userInputId
      toolName: 'run_terminal_command',
      input: expect.objectContaining({
        command: expectedCommand,
        process_type: 'SYNC',
        mode: 'assistant',
      }),
    })
  })
})
