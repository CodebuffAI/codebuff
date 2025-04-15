import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { TEST_USER_ID } from 'common/constants'
import { getInitialAgentState } from 'common/types/agent-state'
import { WebSocket } from 'ws'

// Mock imports needed for setup within the test
import * as checkTerminalCommandModule from '../check-terminal-command'
import * as requestFilesPrompt from '../find-files/request-files-prompt'
import * as claude from '../llm-apis/claude'
import * as gemini from '../llm-apis/gemini-api'
import * as openai from '../llm-apis/openai-api'
import { mainPrompt } from '../main-prompt'
import { logger } from '../util/logger'
import * as websocketAction from '../websockets/websocket-action'

// --- Shared Mocks & Helpers ---

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

// --- Integration Test with Real LLM Call ---
describe('mainPrompt (Integration)', () => {
  afterEach(() => {
    mock.restore()
  })

  it.skip('should add end_turn when LLM stream yields only text', async () => {
    // Mock necessary non-LLM functions ONLY for this test
    spyOn(logger, 'debug').mockImplementation(() => {})
    spyOn(logger, 'error').mockImplementation(() => {})
    spyOn(logger, 'info').mockImplementation(() => {})
    spyOn(logger, 'warn').mockImplementation(() => {})
    spyOn(requestFilesPrompt, 'requestRelevantFiles').mockResolvedValue([])
    spyOn(websocketAction, 'requestFiles').mockResolvedValue({})
    spyOn(websocketAction, 'requestOptionalFile').mockResolvedValue(null) // Needed for write_file processing
    spyOn(checkTerminalCommandModule, 'checkTerminalCommand').mockResolvedValue(
      null
    )
    // Mock Claude stream as a fallback, just in case
    spyOn(claude, 'promptClaudeStream').mockImplementation(async function* () {
      yield 'Claude fallback response'
    })
    // Mock non-stream Gemini/Claude/OpenAI calls if they might be hit by other logic
    spyOn(gemini, 'promptGemini').mockResolvedValue('Mocked non-stream Gemini')
    spyOn(claude, 'promptClaude').mockResolvedValue('Mocked non-stream Claude')
    spyOn(openai, 'promptOpenAI').mockResolvedValue('Mocked non-stream OpenAI')

    const agentState = getInitialAgentState(mockFileContext)
    // Add a simple user message that likely won't trigger tools
    agentState.messageHistory.push({ role: 'user', content: 'Hello there!' })

    const {
      toolCalls,
      toolResults,
      agentState: finalAgentState,
    } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      {
        type: 'prompt',
        prompt: 'Just say hi back.', // A prompt likely to result in only text
        agentState,
        fingerprintId: 'test-gemini-real-end-turn-integration', // Unique ID
        costMode: 'max', // Ensure Gemini path is taken if available
        promptId: 'test-gemini-real-end-turn-id-integration', // Unique ID
        toolResults: [],
      },
      TEST_USER_ID,
      'test-session-gemini-real-end-turn-integration', // Unique ID
      () => {}, // Mock onResponseChunk
      undefined // Mock model
    )

    // Assertions
    const assistantResponse = finalAgentState.messageHistory.find(
      (m) => m.role === 'assistant'
    )?.content
    console.log('Integration Test - Assistant Response:', assistantResponse) // Log the actual response

    expect(toolResults).toHaveLength(0) // No server-side results expected
    expect(toolCalls.length).toBeGreaterThanOrEqual(1) // At least one tool call expected (end_turn)

    // Check if the *last* tool call is end_turn. The LLM might hallucinate other tools first.
    const lastToolCall = toolCalls[toolCalls.length - 1]
    expect(lastToolCall.name).toBe('end_turn')
    expect(lastToolCall.parameters).toEqual({})
  }, 60000) // Increase timeout significantly for real LLM call
})
