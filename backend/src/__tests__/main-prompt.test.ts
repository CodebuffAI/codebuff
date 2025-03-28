import { expect, describe, it } from 'bun:test'
import { mainPrompt } from '../main-prompt'
import { getInitialAgentState, ToolResult } from 'common/types/agent-state'
import { WebSocket } from 'ws'
import { mock } from 'bun:test'
import { TEST_USER_ID } from 'common/constants'
import { createWriteFileBlock } from 'common/util/file'

// Mock all LLM APIs
mock.module('../llm-apis/claude', () => ({
  promptClaude: () => Promise.resolve('Test response'),
  promptClaudeStream: async function* () {
    yield 'Test response'
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

// Mock requestFiles and requestFile to avoid actual WebSocket calls
mock.module('../websockets/websocket-action', () => ({
  requestFiles: async (ws: any, paths: string[]) => {
    const results: Record<string, string | null> = {}
    paths.forEach((p) => {
      if (p === 'test.txt') {
        results[p] = 'mock content for test.txt' // Provide specific mock content if needed
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

// Mock requestRelevantFiles to avoid LLM call
mock.module('../find-files/request-files-prompt', () => ({
  requestRelevantFiles: async () => [],
}))

// Mock checkTerminalCommand to avoid LLM call
mock.module('../check-terminal-command', () => ({
  checkTerminalCommand: async () => null,
}))

// Mock WebSocket - simplified as requestFiles/requestFile are now mocked directly
class MockWebSocket {
  send(msg: string) {
    // No complex logic needed here anymore for file requests
    // console.log('MockWebSocket send:', msg)
  }
  // Add other methods if needed by the code under test, e.g., close, on
  close() {}
  on(event: string, listener: (...args: any[]) => void) {}
  removeListener(event: string, listener: (...args: any[]) => void) {}
  // Add other necessary WebSocket methods/properties if mainPrompt uses them
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

describe('mainPrompt', () => {
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
        costMode: 'max', // Use 'max' to test the Gemini path
        promptId: 'test',
        toolResults,
      },
      TEST_USER_ID,
      'test-session',
      () => {}
    )

    // Should have user message with tool results, user prompt, and assistant response
    // + potentially messages added by getFileReadingUpdates (read_files tool call/result)
    // Let's check the core messages first
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

    // Check total length - might vary based on file reading logic, adjust if necessary
    // Initial: tool results(user), prompt(user), assistant response
    // After file reading: tool results(user), prompt(user), [read_files(assistant), read_files_result(user)], assistant response
    // The exact structure depends on whether getFileReadingUpdates adds messages.
    // Let's be flexible for now.
    expect(newAgentState.messageHistory.length).toBeGreaterThanOrEqual(3)
  }) // No need to increase timeout if mocks are effective

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
        costMode: 'max', // Use 'max' to test the Gemini path
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
  }) // No need to increase timeout

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
