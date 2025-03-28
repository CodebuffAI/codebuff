import { expect, describe, it, mock, beforeEach, afterEach } from 'bun:test'
import { mainPrompt } from '../main-prompt'
import { getInitialAgentState, ToolResult } from 'common/types/agent-state'
import { WebSocket } from 'ws'
import { TEST_USER_ID } from 'common/constants'
import { createWriteFileBlock } from 'common/util/file'

describe('mainPrompt', () => {
  // Move mocks inside describe block so they are scoped to these tests
  const originalModules = {
    claude: require('../llm-apis/claude'),
    gemini: require('../llm-apis/gemini-api'),
    openai: require('../llm-apis/openai-api'),
    websocketAction: require('../websockets/websocket-action'),
    requestFilesPrompt: require('../find-files/request-files-prompt'),
    checkTerminalCommand: require('../check-terminal-command'),
  }

  beforeEach(() => {
    // Set up mocks before each test
    mock.module('../llm-apis/claude', () => ({
      promptClaude: () => Promise.resolve('Test response'),
      promptClaudeStream: async function* () {
        yield 'Test response'
        return // Important: return after first yield to prevent duplicate responses
      },
    }))

    mock.module('../llm-apis/gemini-api', () => ({
      promptGemini: () => Promise.resolve('Test response'),
      promptGeminiStream: () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue('Test response')
            controller.close()
          },
        }),
    }))

    mock.module('../llm-apis/openai-api', () => ({
      promptOpenAI: () => Promise.resolve('Test response'),
      promptOpenAIStream: async function* () {
        yield 'Test response'
      },
    }))

    mock.module('../websockets/websocket-action', () => ({
      requestFiles: async (ws: any, paths: string[]) => {
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
      requestFile: async (ws: any, path: string) => {
        if (path === 'test.txt') {
          return 'mock content for test.txt'
        }
        return null
      },
    }))

    mock.module('../find-files/request-files-prompt', () => ({
      requestRelevantFiles: async () => [],
    }))

    mock.module('../check-terminal-command', () => ({
      checkTerminalCommand: async () => null,
    }))
  })

  afterEach(() => {
    // Restore original modules after each test
    mock.module('../llm-apis/claude', () => originalModules.claude)
    mock.module('../llm-apis/gemini-api', () => originalModules.gemini)
    mock.module('../llm-apis/openai-api', () => originalModules.openai)
    mock.module(
      '../websockets/websocket-action',
      () => originalModules.websocketAction
    )
    mock.module(
      '../find-files/request-files-prompt',
      () => originalModules.requestFilesPrompt
    )
    mock.module(
      '../check-terminal-command',
      () => originalModules.checkTerminalCommand
    )
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
    mock.module('../check-terminal-command', () => ({
      checkTerminalCommand: async () => 'ls -la',
    }))

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

    // Reset the mock
    mock.module('../check-terminal-command', () => ({
      checkTerminalCommand: async () => null,
    }))
  })

  it('should handle write_file tool call', async () => {
    // Mock LLM to return a write_file tool call
    mock.module('../llm-apis/claude', () => ({
      promptClaudeStream: async function* () {
        yield createWriteFileBlock('new-file.txt', 'Hello World')
      },
    }))

    const agentState = getInitialAgentState(mockFileContext)
    const { toolCalls, agentState: newAgentState } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      {
        type: 'prompt',
        prompt: 'Write hello world to new-file.txt',
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
    expect(toolCalls[0].name).toBe('write_file')
    const params = toolCalls[0].parameters as {
      type: string
      path: string
      content: string
    }
    expect(params.type).toBe('file')
    expect(params.path).toBe('new-file.txt')
    expect(params.content).toBe('Hello World')

    // Reset the mock
    mock.module('../llm-apis/claude', () => ({
      promptClaude: () => Promise.resolve('Test response'),
      promptClaudeStream: async function* () {
        yield 'Test response'
      },
    }))
  })
})

// Helper function (consider moving to a test utility file)
function renderToolResults(toolResults: ToolResult[]): string {
  return `
${toolResults
  .map(
    (result) => `<tool_result>
<tool>${result.name}</tool>
<result>${result.result}</result>
</tool_result>`
  )
  .join('\n')}
`.trim()
}
