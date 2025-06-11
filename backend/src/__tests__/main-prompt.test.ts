import * as bigquery from '@codebuff/bigquery'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'
import * as analytics from 'common/analytics'
import { TEST_USER_ID } from 'common/constants'
import { getInitialAgentState } from 'common/types/agent-state'
import { WebSocket } from 'ws'

// Mock imports
import * as checkTerminalCommandModule from '../check-terminal-command'
import * as requestFilesPrompt from '../find-files/request-files-prompt'
import * as aisdk from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { mainPrompt } from '../main-prompt'
import * as processFileBlockModule from '../process-file-block'

import * as getDocumentationForQueryModule from '../get-documentation-for-query'
import { asUserMessage } from '../util/messages'
import { renderToolResults } from '../util/parse-tool-call-xml'
import * as websocketAction from '../websockets/websocket-action'

// Mock logger
mock.module('../util/logger', () => ({
  logger: {
    debug: () => {},
    error: () => {},
    info: () => {},
    warn: () => {},
  },
  withLoggerContext: async (context: any, fn: () => Promise<any>) => fn(),
}))

const mockAgentStream = (streamOutput: string) => {
  spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
    yield streamOutput
  })
}

describe('mainPrompt', () => {
  beforeEach(() => {
    // Mock analytics and tracing
    spyOn(analytics, 'initAnalytics').mockImplementation(() => {})
    analytics.initAnalytics() // Initialize the mock
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})
    spyOn(bigquery, 'insertTrace').mockImplementation(() =>
      Promise.resolve(true)
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
        }
      }
    )

    // Mock LLM APIs
    spyOn(aisdk, 'promptAiSdk').mockImplementation(() =>
      Promise.resolve('Test response')
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
      }
    )

    spyOn(websocketAction, 'requestFile').mockImplementation(
      async (ws: any, path: string) => {
        if (path === 'test.txt') {
          return 'mock content for test.txt'
        }
        return null
      }
    )

    spyOn(requestFilesPrompt, 'requestRelevantFiles').mockImplementation(
      async () => []
    )

    spyOn(
      checkTerminalCommandModule,
      'checkTerminalCommand'
    ).mockImplementation(async () => null)

    spyOn(
      getDocumentationForQueryModule,
      'getDocumentationForQuery'
    ).mockImplementation(async () => null)
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

  const mockFileContext = {
    currentWorkingDirectory: '/test',
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
    },
    fileVersions: [],
  }

  it('should add tool results to message history', async () => {
    const agentState = getInitialAgentState(mockFileContext)
    const toolResults = [
      {
        id: '1',
        name: 'read_files',
        result: 'Read test.txt',
      },
    ]
    const userPromptText = 'Test prompt'

    const { agentState: newAgentState } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      {
        type: 'prompt',
        prompt: userPromptText,
        agentState,
        fingerprintId: 'test',
        costMode: 'normal',
        promptId: 'test',
        toolResults,
      },
      TEST_USER_ID,
      'test-session',
      () => {},
      undefined // Mock model
    )

    // 1. First, find the tool results message
    const userToolResultMessageIndex = newAgentState.messageHistory.findIndex(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('<tool_result>') &&
        m.content.includes('read_files')
    )
    expect(userToolResultMessageIndex).toBeGreaterThanOrEqual(0)
    const userToolResultMessage =
      newAgentState.messageHistory[userToolResultMessageIndex]
    expect(userToolResultMessage).toBeDefined()
    expect(userToolResultMessage?.content).toContain('read_files')

    // 2. Find the actual user prompt message (wrapped in <user_message> tags)
    const userPromptMessageIndex = newAgentState.messageHistory.findIndex(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content === asUserMessage(userPromptText)
    )
    expect(userPromptMessageIndex).toBeGreaterThanOrEqual(0)
    const userPromptMessage =
      newAgentState.messageHistory[userPromptMessageIndex]
    expect(userPromptMessage?.role).toBe('user')
    expect(userPromptMessage.content).toEqual(asUserMessage(userPromptText))

    // 3. The assistant response should be the last message
    const assistantResponseMessage =
      newAgentState.messageHistory[newAgentState.messageHistory.length - 1]
    expect(assistantResponseMessage?.role).toBe('assistant')
    expect(assistantResponseMessage?.content).toBe('Test response')

    // Check overall length - should have at least the tool results, user prompt, and assistant response
    expect(newAgentState.messageHistory.length).toBeGreaterThanOrEqual(3)
  })

  it('should add file updates to tool results in message history', async () => {
    const agentState = getInitialAgentState(mockFileContext)
    // Simulate a previous read_files result being in the history
    agentState.messageHistory.push({
      role: 'user',
      content: renderToolResults([
        {
          id: 'prev-read',
          name: 'read_files',
          result:
            '<read_file>\n<path>test.txt</path>\n<content>old content</content>\n</read_file>',
        },
      ]),
    })

    // Capture the state *after* the prompt call
    const { agentState: newAgentState } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      {
        type: 'prompt',
        prompt: 'Test prompt causing file update check',
        agentState,
        fingerprintId: 'test',
        costMode: 'max',
        promptId: 'test',
        toolResults: [], // No *new* tool results for this specific turn
      },
      TEST_USER_ID,
      'test-session',
      () => {},
      undefined // Mock model
    )

    // Find the user message containing tool results added *during* the mainPrompt execution
    // This message should contain the 'file_updates' result.
    // It's usually the message right before the final assistant response.
    const toolResultMessages = newAgentState.messageHistory.filter(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('<tool_result>')
    )

    // Find the specific tool result message that contains file_updates
    const fileUpdateMessage = toolResultMessages.find(
      (m) =>
        typeof m.content === 'string' &&
        m.content.includes('<tool>read_files</tool>')
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
      'checkTerminalCommand'
    ).mockImplementation(async () => 'ls -la')

    const agentState = getInitialAgentState(mockFileContext)
    const { toolCalls } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      {
        type: 'prompt',
        prompt: 'ls -la',
        agentState,
        fingerprintId: 'test',
        costMode: 'max',
        promptId: 'test',
        toolResults: [],
      },
      TEST_USER_ID,
      'test-session',
      () => {},
      undefined // Mock model
    )

    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].name).toBe('run_terminal_command')
    const params = toolCalls[0].parameters as { command: string; mode: string }
    expect(params.command).toBe('ls -la')
    expect(params.mode).toBe('user')
  })

  it('should handle write_file tool call', async () => {
    const createWriteFileBlock = (
      filePath: string,
      instructions: string,
      content: string
    ) => {
      const tagName = 'write_file'
      return `<${tagName}>
<path>${filePath}</path>
<instructions>${instructions}</instructions>
<content>${content}</content>
</${tagName}>`
    }
    // Mock LLM to return a write_file tool call
    const writeFileBlock = createWriteFileBlock(
      'new-file.txt',
      'Added Hello World',
      'Hello, world!'
    )
    mockAgentStream(writeFileBlock)

    const agentState = getInitialAgentState(mockFileContext)
    const { toolCalls, agentState: newAgentState } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      {
        type: 'prompt',
        prompt: 'Write hello world to new-file.txt',
        agentState,
        fingerprintId: 'test',
        costMode: 'max', // This causes streamGemini25Pro to be called
        promptId: 'test',
        toolResults: [],
      },
      TEST_USER_ID,
      'test-session',
      () => {},
      undefined // Mock model
    )

    expect(toolCalls).toHaveLength(1) // This assertion should now pass
    expect(toolCalls[0].name).toBe('write_file')
    const params = toolCalls[0].parameters as {
      type: string
      path: string
      instructions: string
      content: string
    }
    expect(params.type).toBe('file')
    expect(params.path).toBe('new-file.txt')
    expect(params.instructions).toBe('Added Hello World')
    expect(params.content).toBe('Hello, world!')
  })

  it('should force end of response after MAX_CONSECUTIVE_ASSISTANT_MESSAGES', async () => {
    const agentState = getInitialAgentState(mockFileContext)

    // Set up message history with many consecutive assistant messages
    agentState.consecutiveAssistantMessages = 20 // Set to MAX_CONSECUTIVE_ASSISTANT_MESSAGES
    agentState.messageHistory = [
      { role: 'user', content: 'Initial prompt' },
      ...Array(20).fill({ role: 'assistant', content: 'Assistant response' }),
    ]

    const { toolCalls } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      {
        type: 'prompt',
        prompt: '', // No new prompt
        agentState,
        fingerprintId: 'test',
        costMode: 'max',
        promptId: 'test',
        toolResults: [],
      },
      TEST_USER_ID,
      'test-session',
      () => {},
      undefined // Mock model
    )

    expect(toolCalls).toHaveLength(0) // No tool calls expected
  })

  it('should update consecutiveAssistantMessages when new prompt is received', async () => {
    const agentState = getInitialAgentState(mockFileContext)
    agentState.consecutiveAssistantMessages = 0

    const { agentState: newAgentState } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      {
        type: 'prompt',
        prompt: 'New user prompt',
        agentState,
        fingerprintId: 'test',
        costMode: 'max',
        promptId: 'test',
        toolResults: [],
      },
      TEST_USER_ID,
      'test-session',
      () => {},
      undefined // Mock model
    )

    // When there's a new prompt, consecutiveAssistantMessages should be set to 1
    expect(newAgentState.consecutiveAssistantMessages).toBe(1)
  })

  it('should increment consecutiveAssistantMessages when no new prompt', async () => {
    const agentState = getInitialAgentState(mockFileContext)
    const initialCount = 5
    agentState.consecutiveAssistantMessages = initialCount

    const { agentState: newAgentState } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      {
        type: 'prompt',
        prompt: '', // No new prompt
        agentState,
        fingerprintId: 'test',
        costMode: 'max',
        promptId: 'test',
        toolResults: [],
      },
      TEST_USER_ID,
      'test-session',
      () => {},
      undefined // Mock model
    )

    // When there's no new prompt, consecutiveAssistantMessages should increment by 1
    expect(newAgentState.consecutiveAssistantMessages).toBe(initialCount + 1)
  })

  it('should return no tool calls when LLM response is empty', async () => {
    // Mock the LLM stream to return nothing
    mockAgentStream('')

    const agentState = getInitialAgentState(mockFileContext)
    const { toolCalls } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      {
        type: 'prompt',
        prompt: 'Test prompt leading to empty response',
        agentState,
        fingerprintId: 'test',
        costMode: 'normal',
        promptId: 'test',
        toolResults: [],
      },
      TEST_USER_ID,
      'test-session',
      () => {},
      undefined // Mock model
    )

    expect(toolCalls).toHaveLength(0) // No tool calls expected for empty response
  })

  it('should unescape ampersands in run_terminal_command tool calls', async () => {
    const agentState = getInitialAgentState(mockFileContext)
    const userPromptText = 'Run the backend tests'
    const escapedCommand = 'cd backend &amp;&amp; bun test'
    const expectedCommand = 'cd backend && bun test'

    const mockResponse = `<run_terminal_command>
<command>${escapedCommand}</command>
<process_type>SYNC</process_type>
</run_terminal_command>`

    mockAgentStream(mockResponse)

    const { toolCalls } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      {
        type: 'prompt',
        prompt: userPromptText,
        agentState,
        fingerprintId: 'test',
        costMode: 'max',
        promptId: 'test',
        toolResults: [],
      },
      TEST_USER_ID,
      'test-session',
      () => {},
      undefined // Mock model
    )

    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].name).toBe('run_terminal_command')
    expect((toolCalls[0].parameters as { command: string }).command).toBe(
      expectedCommand
    )
  })
})
