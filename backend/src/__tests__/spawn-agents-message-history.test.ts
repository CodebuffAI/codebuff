import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { handleSpawnAgents } from '../tools/handlers/tool/spawn-agents'
import { TEST_USER_ID } from '@codebuff/common/constants'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { mockFileContext, MockWebSocket } from './test-utils'
import * as loggerModule from '../util/logger'
import * as runAgentStep from '../run-agent-step'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { CodebuffMessage } from '@codebuff/common/types/message'
import type { WebSocket } from 'ws'

describe('Spawn Agents Message History', () => {
  let mockSendSubagentChunk: any
  let mockLoopAgentSteps: any
  let capturedSubAgentState: any

  beforeEach(() => {
    // Mock logger to reduce noise in tests
    spyOn(loggerModule.logger, 'debug').mockImplementation(() => {})
    spyOn(loggerModule.logger, 'error').mockImplementation(() => {})
    spyOn(loggerModule.logger, 'info').mockImplementation(() => {})
    spyOn(loggerModule.logger, 'warn').mockImplementation(() => {})
    spyOn(loggerModule, 'withLoggerContext').mockImplementation(
      async (context: any, fn: () => Promise<any>) => fn(),
    )

    // Mock sendSubagentChunk
    mockSendSubagentChunk = mock(() => {})

    // Mock loopAgentSteps to capture the subAgentState
    mockLoopAgentSteps = spyOn(
      runAgentStep,
      'loopAgentSteps',
    ).mockImplementation(async (ws, options) => {
      capturedSubAgentState = options.agentState
      return {
        agentState: {
          ...options.agentState,
          messageHistory: [
            ...options.agentState.messageHistory,
            { role: 'assistant', content: 'Mock agent response' },
          ],
        },
      }
    })
  })

  afterEach(() => {
    mock.restore()
    capturedSubAgentState = undefined
  })

  const createMockAgent = (id: string, includeMessageHistory = true): AgentTemplate => ({
    id,
    displayName: `Mock ${id}`,
    outputMode: 'last_message' as const,
    inputSchema: {
      prompt: {
        safeParse: () => ({ success: true }),
      } as any,
    },
    spawnerPrompt: '',
    model: '',
    includeMessageHistory,
    toolNames: [],
    spawnableAgents: ['child-agent'],
    systemPrompt: '',
    instructionsPrompt: '',
    stepPrompt: '',
  })

  const createSpawnToolCall = (agentType: string, prompt = 'test prompt'): CodebuffToolCall<'spawn_agents'> => ({
    toolName: 'spawn_agents' as const,
    toolCallId: 'test-tool-call-id',
    input: {
      agents: [{ agent_type: agentType, prompt }],
    },
  })

  it('should exclude system messages from conversation history when includeMessageHistory is true', async () => {
    const parentAgent = createMockAgent('parent', true)
    const childAgent = createMockAgent('child-agent', true)
    const ws = new MockWebSocket() as unknown as WebSocket
    const sessionState = getInitialSessionState(mockFileContext)
    const toolCall = createSpawnToolCall('child-agent')

    // Create mock messages including system message
    const mockMessages: CodebuffMessage[] = [
      { role: 'system', content: 'This is the parent system prompt that should be excluded' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'How are you?' },
    ]

    const { result } = handleSpawnAgents({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext: mockFileContext,
      clientSessionId: 'test-session',
      userInputId: 'test-input',
      getLatestState: () => ({ messages: mockMessages }),
      state: {
        ws,
        fingerprintId: 'test-fingerprint',
        userId: TEST_USER_ID,
        agentTemplate: parentAgent,
        localAgentTemplates: { 'child-agent': childAgent },
        sendSubagentChunk: mockSendSubagentChunk,
        messages: mockMessages,
        agentState: sessionState.mainAgentState,
      },
    })

    await result

    // Verify that the spawned agent was called
    expect(mockLoopAgentSteps).toHaveBeenCalledTimes(1)

    // Verify that the subagent's message history contains the conversation history message
    expect(capturedSubAgentState.messageHistory).toHaveLength(1)
    const conversationHistoryMessage = capturedSubAgentState.messageHistory[0]
    expect(conversationHistoryMessage.role).toBe('user')
    expect(conversationHistoryMessage.content).toContain('conversation history between the user and an assistant')

    // Parse the JSON content to verify system message is excluded
    const contentMatch = conversationHistoryMessage.content.match(/\[([\s\S]*)\]/)
    expect(contentMatch).toBeTruthy()
    const parsedMessages = JSON.parse(contentMatch![0])

    // Verify system message is excluded
    expect(parsedMessages).toHaveLength(3) // Only user and assistant messages
    expect(parsedMessages.find((msg: any) => msg.role === 'system')).toBeUndefined()
    expect(parsedMessages.find((msg: any) => msg.content === 'This is the parent system prompt that should be excluded')).toBeUndefined()

    // Verify user and assistant messages are included
    expect(parsedMessages.find((msg: any) => msg.content === 'Hello')).toBeTruthy()
    expect(parsedMessages.find((msg: any) => msg.content === 'Hi there!')).toBeTruthy()
    expect(parsedMessages.find((msg: any) => msg.content === 'How are you?')).toBeTruthy()
  })

  it('should not include conversation history when includeMessageHistory is false', async () => {
    const parentAgent = createMockAgent('parent', true)
    const childAgent = createMockAgent('child-agent', false) // includeMessageHistory = false
    const ws = new MockWebSocket() as unknown as WebSocket
    const sessionState = getInitialSessionState(mockFileContext)
    const toolCall = createSpawnToolCall('child-agent')

    const mockMessages: CodebuffMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ]

    const { result } = handleSpawnAgents({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext: mockFileContext,
      clientSessionId: 'test-session',
      userInputId: 'test-input',
      getLatestState: () => ({ messages: mockMessages }),
      state: {
        ws,
        fingerprintId: 'test-fingerprint',
        userId: TEST_USER_ID,
        agentTemplate: parentAgent,
        localAgentTemplates: { 'child-agent': childAgent },
        sendSubagentChunk: mockSendSubagentChunk,
        messages: mockMessages,
        agentState: sessionState.mainAgentState,
      },
    })

    await result

    // Verify that the subagent's message history is empty when includeMessageHistory is false
    expect(capturedSubAgentState.messageHistory).toHaveLength(0)
  })

  it('should handle empty message history gracefully', async () => {
    const parentAgent = createMockAgent('parent', true)
    const childAgent = createMockAgent('child-agent', true)
    const ws = new MockWebSocket() as unknown as WebSocket
    const sessionState = getInitialSessionState(mockFileContext)
    const toolCall = createSpawnToolCall('child-agent')

    const mockMessages: CodebuffMessage[] = [] // Empty message history

    const { result } = handleSpawnAgents({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext: mockFileContext,
      clientSessionId: 'test-session',
      userInputId: 'test-input',
      getLatestState: () => ({ messages: mockMessages }),
      state: {
        ws,
        fingerprintId: 'test-fingerprint',
        userId: TEST_USER_ID,
        agentTemplate: parentAgent,
        localAgentTemplates: { 'child-agent': childAgent },
        sendSubagentChunk: mockSendSubagentChunk,
        messages: mockMessages,
        agentState: sessionState.mainAgentState,
      },
    })

    await result

    // Verify that the subagent still gets a conversation history message, even if empty
    expect(capturedSubAgentState.messageHistory).toHaveLength(1)
    const conversationHistoryMessage = capturedSubAgentState.messageHistory[0]
    expect(conversationHistoryMessage.content).toContain('[]') // Empty array in JSON
  })

  it('should handle message history with only system messages', async () => {
    const parentAgent = createMockAgent('parent', true)
    const childAgent = createMockAgent('child-agent', true)
    const ws = new MockWebSocket() as unknown as WebSocket
    const sessionState = getInitialSessionState(mockFileContext)
    const toolCall = createSpawnToolCall('child-agent')

    const mockMessages: CodebuffMessage[] = [
      { role: 'system', content: 'System prompt 1' },
      { role: 'system', content: 'System prompt 2' },
    ]

    const { result } = handleSpawnAgents({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext: mockFileContext,
      clientSessionId: 'test-session',
      userInputId: 'test-input',
      getLatestState: () => ({ messages: mockMessages }),
      state: {
        ws,
        fingerprintId: 'test-fingerprint',
        userId: TEST_USER_ID,
        agentTemplate: parentAgent,
        localAgentTemplates: { 'child-agent': childAgent },
        sendSubagentChunk: mockSendSubagentChunk,
        messages: mockMessages,
        agentState: sessionState.mainAgentState,
      },
    })

    await result

    // Verify that all system messages are filtered out
    expect(capturedSubAgentState.messageHistory).toHaveLength(1)
    const conversationHistoryMessage = capturedSubAgentState.messageHistory[0]
    expect(conversationHistoryMessage.content).toContain('[]') // Empty array in JSON since all system messages filtered out
  })
})
