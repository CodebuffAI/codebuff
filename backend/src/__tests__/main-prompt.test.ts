import * as bigquery from '@codebuff/bigquery'
import * as analytics from '@codebuff/common/analytics'
import { TEST_USER_ID } from '@codebuff/common/constants'
import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import {
  getToolCallString,
  renderToolResults,
} from '@codebuff/common/tools/utils'
import {
  AgentTemplateTypes,
  getInitialSessionState,
} from '@codebuff/common/types/session-state'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

// Mock imports
import * as checkTerminalCommandModule from '../check-terminal-command'
import * as requestFilesPrompt from '../find-files/request-files-prompt'
import * as getDocumentationForQueryModule from '../get-documentation-for-query'
import * as liveUserInputs from '../live-user-inputs'
import * as aisdk from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { mainPrompt } from '../main-prompt'
import * as processFileBlockModule from '../process-file-block'
import * as websocketAction from '../websockets/websocket-action'

import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'bun'

const mockAgentStream = (streamOutput: string) => {
  spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
    yield streamOutput
  })
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
        parentPrompt: '',
        model: 'gpt-4o-mini',
        includeMessageHistory: true,
        toolNames: ['write_file', 'run_terminal_command'],
        subagents: [],
        systemPrompt: '',
        instructionsPrompt: '',
        stepPrompt: '',
      },
      [AgentTemplateTypes.base_max]: {
        id: AgentTemplateTypes.base_max,
        displayName: 'Base Max Agent',
        outputMode: 'last_message',
        inputSchema: {},
        parentPrompt: '',
        model: 'gpt-4o',
        includeMessageHistory: true,
        toolNames: ['write_file', 'run_terminal_command'],
        subagents: [],
        systemPrompt: '',
        instructionsPrompt: '',
        stepPrompt: '',
      },
    }
  })

  beforeAll(() => {
    // Mock logger
    mockModule('@codebuff/backend/util/logger', () => ({
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      withLoggerContext: async (context: any, fn: () => Promise<any>) => fn(),
    }))
  })

  beforeEach(() => {
    // Mock analytics and tracing
    spyOn(analytics, 'initAnalytics').mockImplementation(() => {})
    analytics.initAnalytics() // Initialize the mock
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})
    spyOn(bigquery, 'insertTrace').mockImplementation(() =>
      Promise.resolve(true),
    ) // Return Promise<boolean>

    // Mock processFileBlock
    spyOn(processFileBlockModule, 'processFileBlock').mockImplementation(
      async (path, instructions, contentPromise, newContent) => {
        return {
          tool: 'write_file' as const,
          path,
          instructions,
          content: newContent,
          patch: undefined,
          messages: [],
        }
      },
    )

    // Mock LLM APIs
    spyOn(aisdk, 'promptAiSdk').mockImplementation(() =>
      Promise.resolve('Test response'),
    )
    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield 'Test response'
      return
    })

    // Mock websocket actions
    spyOn(websocketAction, 'requestFiles').mockImplementation(
      async (ws: any, paths: string[]) => {
        const results: Record<string, string | null> = {}
        paths.forEach((p) => {
          if (p === 'test.txt') {
            results[p] = 'mock content for test.txt'
          } else {
            results[p] = null
          }
        })
        return results
      },
    )

    spyOn(websocketAction, 'requestFile').mockImplementation(
      async (ws: any, path: string) => {
        if (path === 'test.txt') {
          return 'mock content for test.txt'
        }
        return null
      },
    )

    spyOn(websocketAction, 'requestToolCall').mockImplementation(
      async (
        ws: WebSocket,
        userInputId: string,
        toolName: string,
        args: Record<string, any>,
        timeout: number = 30_000,
      ) => {
        return {
          success: true,
          result: `Tool call success: ${{ toolName, args }}` as any,
        }
      },
    )

    spyOn(requestFilesPrompt, 'requestRelevantFiles').mockImplementation(
      async () => [],
    )

    spyOn(
      checkTerminalCommandModule,
      'checkTerminalCommand',
    ).mockImplementation(async () => null)

    spyOn(
      getDocumentationForQueryModule,
      'getDocumentationForQuery',
    ).mockImplementation(async () => null)

    // Mock live user inputs
    spyOn(liveUserInputs, 'checkLiveUserInput').mockImplementation(() => true)
  })

  afterEach(() => {
    // Clear all mocks after each test
    mock.restore()
  })

  afterAll(() => {
    clearMockedModules()
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
    systemInfo: {
      platform: 'test',
      shell: 'test',
      nodeVersion: 'test',
      arch: 'test',
      homedir: '/home/test',
      cpus: 1,
    },
    fileVersions: [],
  }

  it('should add file updates to tool results in message history', async () => {
    const sessionState = getInitialSessionState(mockFileContext)
    // Simulate a previous read_files result being in the history
    sessionState.mainAgentState.messageHistory.push({
      role: 'user',
      content: renderToolResults([
        {
          toolCallId: 'prev-read',
          toolName: 'read_files',
          result:
            '<read_file>\n<path>test.txt</path>\n<content>old content</content>\n</read_file>',
        },
      ]),
    })

    const action = {
      type: 'prompt' as const,
      prompt: 'Test prompt causing file update check',
      sessionState,
      fingerprintId: 'test',
      costMode: 'max' as const,
      promptId: 'test',
      toolResults: [], // No *new* tool results for this specific turn
    }

    // Capture the state *after* the prompt call
    const { sessionState: newSessionState } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      action,
      {
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
        localAgentTemplates: {
          [AgentTemplateTypes.base]: {
            id: 'base',
            displayName: 'Base Agent',
            outputMode: 'last_message',
            inputSchema: {},
            parentPrompt: '',
            model: 'gpt-4o-mini',
            includeMessageHistory: true,
            toolNames: ['write_file', 'run_terminal_command'],
            subagents: [],
            systemPrompt: '',
            instructionsPrompt: '',
            stepPrompt: '',
          },
          [AgentTemplateTypes.base_max]: {
            id: 'base_max',
            displayName: 'Base Max Agent',
            outputMode: 'last_message',
            inputSchema: {},
            parentPrompt: '',
            model: 'gpt-4o',
            includeMessageHistory: true,
            toolNames: ['write_file', 'run_terminal_command'],
            subagents: [],
            systemPrompt: '',
            instructionsPrompt: '',
            stepPrompt: '',
          },
        },
      },
    )

    // Find the user message containing tool results added *during* the mainPrompt execution
    // This message should contain the 'file_updates' result.
    // It's usually the message right before the final assistant response.
    const toolResultMessages =
      newSessionState.mainAgentState.messageHistory.filter(
        (m) =>
          m.role === 'user' &&
          typeof m.content === 'string' &&
          m.content.includes('<tool_result>'),
      )

    // Find the specific tool result message that contains file_updates
    const fileUpdateMessage = toolResultMessages.find(
      (m) =>
        typeof m.content === 'string' &&
        m.content.includes('<tool>read_files</tool>'),
    )

    expect(fileUpdateMessage).toBeDefined()
    expect(fileUpdateMessage?.content).toContain('test.txt')
    // Check that the content reflects the *new* mock content within the file_updates result
    expect(fileUpdateMessage?.content).toContain('old content')
  })

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

    const { toolCalls, sessionState: newSessionState } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      action,
      {
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
        localAgentTemplates: mockLocalAgentTemplates,
      },
    )

    // Verify that requestToolCall was called with the terminal command
    const requestToolCallSpy = websocketAction.requestToolCall as any
    expect(requestToolCallSpy).toHaveBeenCalledTimes(1)
    expect(requestToolCallSpy).toHaveBeenCalledWith(
      expect.any(Object), // WebSocket
      expect.any(String), // userInputId
      'run_terminal_command',
      expect.objectContaining({
        command: 'ls -la',
        mode: 'user',
        process_type: 'SYNC',
        timeout_seconds: -1,
      }),
    )

    // Verify that a tool result was added to message history
    const toolResultMessages =
      newSessionState.mainAgentState.messageHistory.filter(
        (m) =>
          m.role === 'user' &&
          typeof m.content === 'string' &&
          m.content.includes('<tool_result>'),
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
    const requestToolCallSpy = websocketAction.requestToolCall as any

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

    await mainPrompt(new MockWebSocket() as unknown as WebSocket, action, {
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
      localAgentTemplates: {
        [AgentTemplateTypes.base]: {
          id: 'base',
          displayName: 'Base Agent',
          outputMode: 'last_message',
          inputSchema: {},
          parentPrompt: '',
          model: 'gpt-4o-mini',
          includeMessageHistory: true,
          toolNames: ['write_file', 'run_terminal_command'],
          subagents: [],
          systemPrompt: '',
          instructionsPrompt: '',
          stepPrompt: '',
        },
        [AgentTemplateTypes.base_max]: {
          id: 'base-max',
          displayName: 'Base Max Agent',
          outputMode: 'last_message',
          inputSchema: {},
          parentPrompt: '',
          model: 'gpt-4o',
          includeMessageHistory: true,
          toolNames: ['write_file', 'run_terminal_command'],
          subagents: [],
          systemPrompt: '',
          instructionsPrompt: '',
          stepPrompt: '',
        },
      },
    })

    // Assert that requestToolCall was called exactly once
    expect(requestToolCallSpy).toHaveBeenCalledTimes(1)

    // Verify the write_file call was made with the correct arguments
    expect(requestToolCallSpy).toHaveBeenCalledWith(
      expect.any(Object), // WebSocket
      expect.any(String), // userInputId
      'write_file',
      expect.objectContaining({
        type: 'file',
        path: 'new-file.txt',
        content: 'Hello, world!',
      }),
    )
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

    const { toolCalls } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      action,
      {
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
        localAgentTemplates: mockLocalAgentTemplates,
      },
    )

    expect(toolCalls).toHaveLength(0) // No tool calls expected
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

    const { sessionState: newSessionState } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      action,
      {
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
        localAgentTemplates: mockLocalAgentTemplates,
      },
    )

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

    const { sessionState: newSessionState } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      action,
      {
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
        localAgentTemplates: mockLocalAgentTemplates,
      },
    )

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

    const { toolCalls } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      action,
      {
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
        localAgentTemplates: mockLocalAgentTemplates,
      },
    )

    expect(toolCalls).toHaveLength(0) // No tool calls expected for empty response
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
    const requestToolCallSpy = websocketAction.requestToolCall as any

    const action = {
      type: 'prompt' as const,
      prompt: userPromptText,
      sessionState,
      fingerprintId: 'test',
      costMode: 'max' as const,
      promptId: 'test',
      toolResults: [],
    }

    await mainPrompt(new MockWebSocket() as unknown as WebSocket, action, {
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
      localAgentTemplates: mockLocalAgentTemplates,
    })

    // Assert that requestToolCall was called exactly once
    expect(requestToolCallSpy).toHaveBeenCalledTimes(1)

    // Verify the run_terminal_command call was made with the correct arguments
    expect(requestToolCallSpy).toHaveBeenCalledWith(
      expect.any(Object), // WebSocket
      expect.any(String), // userInputId
      'run_terminal_command',
      expect.objectContaining({
        command: expectedCommand,
        process_type: 'SYNC',
        mode: 'assistant',
      }),
    )
  })
})
