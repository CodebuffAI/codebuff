import {
  expect,
  describe,
  it,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from 'bun:test'
import { mainPrompt } from '../main-prompt'
import { getInitialAgentState, ToolResult } from 'common/types/agent-state'
import { WebSocket } from 'ws'
import { TEST_USER_ID } from 'common/constants'
import { createWriteFileBlock } from 'common/util/file'
import { renderToolResults } from '../util/parse-tool-call-xml'

// Mock imports
import * as claude from '../llm-apis/claude'
import * as gemini from '../llm-apis/gemini-api'
import * as openai from '../llm-apis/openai-api'
import * as geminiWithFallbacks from '../llm-apis/gemini-with-fallbacks'
import * as websocketAction from '../websockets/websocket-action'
import * as requestFilesPrompt from '../find-files/request-files-prompt'
import * as checkTerminalCommandModule from '../check-terminal-command'
import { logger } from '../util/logger'

describe('mainPrompt', () => {
  beforeEach(() => {
    // Mock logger
    spyOn(logger, 'debug').mockImplementation(() => {})
    spyOn(logger, 'error').mockImplementation(() => {})
    spyOn(logger, 'info').mockImplementation(() => {})
    spyOn(logger, 'warn').mockImplementation(() => {})

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

    spyOn(geminiWithFallbacks, 'streamGemini25Pro').mockImplementation(
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

    const { agentState: newAgentState } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      {
        type: 'prompt',
        prompt: 'Test prompt',
        agentState,
        fingerprintId: 'test',
        costMode: 'max',
        promptId: 'test',
        toolResults,
      },
      TEST_USER_ID,
      'test-session',
      () => {}
    )

    const userToolResultMessage = newAgentState.messageHistory.find(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('<tool_result>')
    )
    const userPromptMessage = newAgentState.messageHistory.find(
      (m) => m.role === 'user' && m.content === 'Test prompt'
    )
    const assistantResponseMessage = newAgentState.messageHistory.find(
      (m) => m.role === 'assistant'
    )

    expect(userToolResultMessage).toBeDefined()
    expect(userToolResultMessage?.content).toContain('read_files')
    expect(userPromptMessage).toBeDefined()
    expect(assistantResponseMessage).toBeDefined()
    expect(assistantResponseMessage?.content).toBe('Test response')

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
          result: '<read_file path="test.txt">old content</read_file>',
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
      () => {}
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
      () => {}
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
    spyOn(claude, 'promptClaudeStream').mockImplementation(async function* () {
      yield writeFileBlock
    })
    spyOn(gemini, 'promptGeminiStream').mockImplementation(async function* () {
      yield writeFileBlock
    } as any)
    // Override the mock specifically for this test case when costMode is 'max'
    spyOn(geminiWithFallbacks, 'streamGemini25Pro').mockImplementation(
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(writeFileBlock)
            controller.close()
          },
        }) as any
    )

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
      () => {}
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
    agentState.lastUserPromptIndex = 0
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
      () => {}
    )

    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].name).toBe('end_turn')
    expect(toolCalls[0].parameters).toEqual({})
  })

  it('should update lastUserPromptIndex when new prompt is received', async () => {
    const agentState = getInitialAgentState(mockFileContext)
    agentState.lastUserPromptIndex = 0

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
      () => {}
    )

    // The new lastUserPromptIndex should be the index of the new prompt message
    expect(newAgentState.lastUserPromptIndex).toBeGreaterThan(0)
  })

  it('should not update lastUserPromptIndex when no new prompt', async () => {
    const agentState = getInitialAgentState(mockFileContext)
    const initialIndex = 5
    agentState.lastUserPromptIndex = initialIndex

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
      () => {}
    )

    expect(newAgentState.lastUserPromptIndex).toBe(initialIndex)
  })
})
