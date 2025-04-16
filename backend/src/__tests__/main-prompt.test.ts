import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'
import { TEST_USER_ID } from 'common/constants'
import { getInitialAgentState } from 'common/types/agent-state'
import { createWriteFileBlock } from 'common/util/file'
import { WebSocket } from 'ws'

// Mock imports
import * as checkTerminalCommandModule from '../check-terminal-command'
import * as requestFilesPrompt from '../find-files/request-files-prompt'
import * as claude from '../llm-apis/claude'
import * as gemini from '../llm-apis/gemini-api'
import * as geminiWithFallbacks from '../llm-apis/gemini-with-fallbacks'
import * as openai from '../llm-apis/openai-api'
import { mainPrompt } from '../main-prompt'
import { logger } from '../util/logger'
import { renderToolResults } from '../util/parse-tool-call-xml'
import * as websocketAction from '../websockets/websocket-action'

const mockAgentStream = (streamOutput: string) => {
  spyOn(claude, 'promptClaudeStream').mockImplementation(async function* () {
    yield streamOutput
  })
  spyOn(gemini, 'promptGeminiStream').mockImplementation(async function* () {
    yield streamOutput
  } as any)
  spyOn(openai, 'promptOpenAIStream').mockImplementation(async function* () {
    yield streamOutput
  })
  spyOn(
    geminiWithFallbacks,
    'streamGemini25ProWithFallbacks'
  ).mockImplementation(async function* () {
    yield streamOutput
  } as any)
}
describe('mainPrompt', () => {
  beforeEach(() => {
    spyOn(logger, 'debug').mockImplementation(() => {})
    spyOn(logger, 'error').mockImplementation(() => {})
    spyOn(logger, 'info').mockImplementation(() => {})
    spyOn(logger, 'warn').mockImplementation(() => {}) // Corrected syntax if needed
    // Mock logger - Ensure correct arrow function syntax

    // Set up mocks before each test
    spyOn(claude, 'promptClaude').mockImplementation(() =>
      Promise.resolve('Test response')
    )
    spyOn(claude, 'promptClaudeStream').mockImplementation(async function* () {
      yield 'Test response'
      return // Important: return after first yield to prevent duplicate responses
    })

    spyOn(gemini, 'promptGemini').mockImplementation(() =>
      Promise.resolve('Test response')
    )
    spyOn(gemini, 'promptGeminiStream').mockImplementation(
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue('Test response')
            controller.close()
          },
        })
    )

    spyOn(openai, 'promptOpenAI').mockImplementation(() =>
      Promise.resolve('Test response')
    )
    spyOn(openai, 'promptOpenAIStream').mockImplementation(async function* () {
      yield 'Test response'
    })

    spyOn(
      geminiWithFallbacks,
      'streamGemini25ProWithFallbacks'
    ).mockImplementation(
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue('Test response')
            controller.close()
          },
        }) as any
    )

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
        costMode: 'max',
        promptId: 'test',
        toolResults,
      },
      TEST_USER_ID,
      'test-session',
      () => {},
      undefined // Mock model
    )

    // Expected order: [ToolResultsMsg, InstructionsMsg, PromptMsg, AssistantMsg]
    // (Assuming empty initial history and no readFileMessages)

    // 1. Find the message containing the tool results
    const userToolResultMessageIndex = newAgentState.messageHistory.findIndex(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('<tool_result>') &&
        m.content.includes('read_files')
    )
    expect(userToolResultMessageIndex).toBeGreaterThanOrEqual(0) // Should be index 0
    const userToolResultMessage =
      newAgentState.messageHistory[userToolResultMessageIndex]
    expect(userToolResultMessage).toBeDefined()
    expect(userToolResultMessage?.content).toContain('read_files')

    // 2. The user instructions message should be next (we don't need to assert its exact content)
    const userInstructionsMessageIndex = userToolResultMessageIndex + 1
    const userInstructionsMessage =
      newAgentState.messageHistory[userInstructionsMessageIndex]
    expect(userInstructionsMessage?.role).toBe('user')
    expect(typeof userInstructionsMessage?.content).toBe('string')

    // 3. The user prompt message should be after instructions
    const userPromptMessageIndex = userInstructionsMessageIndex + 1
    const userPromptMessage =
      newAgentState.messageHistory[userPromptMessageIndex]
    expect(userPromptMessage?.role).toBe('user')
    // Check the content structure (array with text block)
    expect(Array.isArray(userPromptMessage?.content)).toBe(true)
    expect((userPromptMessage?.content as any)?.[0]?.type).toBe('text')
    expect((userPromptMessage?.content as any)?.[0]?.text).toBe(userPromptText) // Check text property

    // 4. The assistant response should be after the prompt message
    const assistantResponseMessageIndex = userPromptMessageIndex + 1
    const assistantResponseMessage =
      newAgentState.messageHistory[assistantResponseMessageIndex]
    expect(assistantResponseMessage?.role).toBe('assistant')
    expect(assistantResponseMessage?.content).toBe('Test response')

    // Check overall length
    expect(newAgentState.messageHistory.length).toBeGreaterThanOrEqual(4)
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
        m.content.includes('<tool>file_updates</tool>')
    )

    expect(fileUpdateMessage).toBeDefined()
    expect(fileUpdateMessage?.content).toContain('test.txt')
    // Check that the content reflects the *new* mock content within the file_updates result
    expect(fileUpdateMessage?.content).toContain('mock content for test.txt')
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
    // Mock LLM to return a write_file tool call
    const writeFileBlock = createWriteFileBlock('new-file.txt', 'Hello World')
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
      content: string
    }
    expect(params.type).toBe('file')
    expect(params.path).toBe('new-file.txt')
    expect(params.content).toBe('Hello World')
  })

  it('should force end_turn after MAX_CONSECUTIVE_ASSISTANT_MESSAGES', async () => {
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

    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].name).toBe('end_turn')
    expect(toolCalls[0].parameters).toEqual({})
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

  it('should return end_turn tool call when LLM response is empty', async () => {
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
        costMode: 'max', // Ensure the mocked stream is used
        promptId: 'test',
        toolResults: [],
      },
      TEST_USER_ID,
      'test-session',
      () => {},
      undefined // Mock model
    )

    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].name).toBe('end_turn')
    expect(toolCalls[0].parameters).toEqual({})
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
