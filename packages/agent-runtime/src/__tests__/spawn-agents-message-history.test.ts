import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from 'bun:test'

import { mockFileContext } from './test-utils'
import * as runAgentStep from '../run-agent-step'
import { handleSpawnAgents } from '../tools/handlers/tool/spawn-agents'

import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'

describe('Spawn Agents Message History', () => {
  let mockSendSubagentChunk: any
  let mockLoopAgentSteps: any
  let capturedSubAgentState: any

  beforeEach(() => {
    // Mock sendSubagentChunk
    mockSendSubagentChunk = mock(() => {})

    // Mock loopAgentSteps to capture the subAgentState
    mockLoopAgentSteps = spyOn(
      runAgentStep,
      'loopAgentSteps',
    ).mockImplementation(async (options) => {
      capturedSubAgentState = options.agentState
      return {
        agentState: {
          ...options.agentState,
          messageHistory: [
            ...options.agentState.messageHistory,
            { role: 'assistant', content: 'Mock agent response' },
          ],
        },
        output: { type: 'lastMessage', value: 'Mock agent response' },
      }
    })
  })

  afterEach(() => {
    mock.restore()
    capturedSubAgentState = undefined
  })

  const createMockAgent = (
    id: string,
    includeMessageHistory = true,
  ): AgentTemplate => ({
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
    inheritParentSystemPrompt: false,
    mcpServers: {},
    toolNames: [],
    spawnableAgents: ['child-agent'],
    systemPrompt: '',
    instructionsPrompt: '',
    stepPrompt: '',
  })

  const createSpawnToolCall = (
    agentType: string,
    prompt = 'test prompt',
  ): CodebuffToolCall<'spawn_agents'> => ({
    toolName: 'spawn_agents' as const,
    toolCallId: 'test-tool-call-id',
    input: {
      agents: [{ agent_type: agentType, prompt }],
    },
  })

  it('should include all messages from conversation history when includeMessageHistory is true', async () => {
    const parentAgent = createMockAgent('parent', true)
    const childAgent = createMockAgent('child-agent', true)
    const sessionState = getInitialSessionState(mockFileContext)
    const toolCall = createSpawnToolCall('child-agent')

    // Create mock messages including system message
    const mockMessages: Message[] = [
      {
        role: 'system',
        content: 'This is the parent system prompt that should be excluded',
      },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'How are you?' },
    ]

    const { result } = handleSpawnAgents({
      ...TEST_AGENT_RUNTIME_IMPL,
      repoId: undefined,
      repoUrl: undefined,
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext: mockFileContext,
      clientSessionId: 'test-session',
      userInputId: 'test-input',
      writeToClient: () => {},
      getLatestState: () => ({ messages: mockMessages }),
      state: {
        fingerprintId: 'test-fingerprint',
        userId: TEST_USER_ID,
        agentTemplate: parentAgent,
        localAgentTemplates: { 'child-agent': childAgent },
        sendSubagentChunk: mockSendSubagentChunk,
        messages: mockMessages,
        agentState: sessionState.mainAgentState,
        system: 'Test system prompt',
      },
    })

    await result

    // Verify that the spawned agent was called
    expect(mockLoopAgentSteps).toHaveBeenCalledTimes(1)

    // Verify that the subagent's message history contains the filtered messages
    // expireMessages filters based on timeToLive property, not role
    // Since the system message doesn't have timeToLive, it will be included
    expect(capturedSubAgentState.messageHistory).toHaveLength(4) // System + user + assistant messages

    // Verify system message is included (because it has no timeToLive property)
    const systemMessages = capturedSubAgentState.messageHistory.filter(
      (msg: any) => msg.role === 'system',
    )
    expect(systemMessages).toHaveLength(1)
    expect(systemMessages[0].content).toBe(
      'This is the parent system prompt that should be excluded',
    )

    // Verify user and assistant messages are included
    expect(
      capturedSubAgentState.messageHistory.find(
        (msg: any) => msg.content === 'Hello',
      ),
    ).toBeTruthy()
    expect(
      capturedSubAgentState.messageHistory.find(
        (msg: any) => msg.content === 'Hi there!',
      ),
    ).toBeTruthy()
    expect(
      capturedSubAgentState.messageHistory.find(
        (msg: any) => msg.content === 'How are you?',
      ),
    ).toBeTruthy()
  })

  it('should not include conversation history when includeMessageHistory is false', async () => {
    const parentAgent = createMockAgent('parent', true)
    const childAgent = createMockAgent('child-agent', false) // includeMessageHistory = false
    const sessionState = getInitialSessionState(mockFileContext)
    const toolCall = createSpawnToolCall('child-agent')

    const mockMessages: Message[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ]

    const { result } = handleSpawnAgents({
      ...TEST_AGENT_RUNTIME_IMPL,
      repoId: undefined,
      repoUrl: undefined,
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext: mockFileContext,
      clientSessionId: 'test-session',
      userInputId: 'test-input',
      writeToClient: () => {},
      getLatestState: () => ({ messages: mockMessages }),
      state: {
        fingerprintId: 'test-fingerprint',
        userId: TEST_USER_ID,
        agentTemplate: parentAgent,
        localAgentTemplates: { 'child-agent': childAgent },
        sendSubagentChunk: mockSendSubagentChunk,
        messages: mockMessages,
        agentState: sessionState.mainAgentState,
        system: 'Test system prompt',
      },
    })

    await result

    // Verify that the subagent's message history is empty when includeMessageHistory is false
    expect(capturedSubAgentState.messageHistory).toHaveLength(0)
  })

  it('should handle empty message history gracefully', async () => {
    const parentAgent = createMockAgent('parent', true)
    const childAgent = createMockAgent('child-agent', true)
    const sessionState = getInitialSessionState(mockFileContext)
    const toolCall = createSpawnToolCall('child-agent')

    const mockMessages: Message[] = [] // Empty message history

    const { result } = handleSpawnAgents({
      ...TEST_AGENT_RUNTIME_IMPL,
      repoId: undefined,
      repoUrl: undefined,
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext: mockFileContext,
      clientSessionId: 'test-session',
      userInputId: 'test-input',
      writeToClient: () => {},
      getLatestState: () => ({ messages: mockMessages }),
      state: {
        fingerprintId: 'test-fingerprint',
        userId: TEST_USER_ID,
        agentTemplate: parentAgent,
        localAgentTemplates: { 'child-agent': childAgent },
        sendSubagentChunk: mockSendSubagentChunk,
        messages: mockMessages,
        agentState: sessionState.mainAgentState,
        system: 'Test system prompt',
      },
    })

    await result

    // Verify that the subagent's message history is empty when there are no messages to pass
    expect(capturedSubAgentState.messageHistory).toHaveLength(0)
  })

  it('should handle message history with only system messages', async () => {
    const parentAgent = createMockAgent('parent', true)
    const childAgent = createMockAgent('child-agent', true)
    const sessionState = getInitialSessionState(mockFileContext)
    const toolCall = createSpawnToolCall('child-agent')

    const mockMessages: Message[] = [
      { role: 'system', content: 'System prompt 1' },
      { role: 'system', content: 'System prompt 2' },
    ]

    const { result } = handleSpawnAgents({
      ...TEST_AGENT_RUNTIME_IMPL,
      repoId: undefined,
      repoUrl: undefined,
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext: mockFileContext,
      clientSessionId: 'test-session',
      userInputId: 'test-input',
      writeToClient: () => {},
      getLatestState: () => ({ messages: mockMessages }),
      state: {
        fingerprintId: 'test-fingerprint',
        userId: TEST_USER_ID,
        agentTemplate: parentAgent,
        localAgentTemplates: { 'child-agent': childAgent },
        sendSubagentChunk: mockSendSubagentChunk,
        messages: mockMessages,
        agentState: sessionState.mainAgentState,
        system: 'Test system prompt',
      },
    })

    await result

    // Verify that system messages without timeToLive are included
    // expireMessages only filters messages with timeToLive='userPrompt'
    expect(capturedSubAgentState.messageHistory).toHaveLength(2)
    const systemMessages = capturedSubAgentState.messageHistory.filter(
      (msg: any) => msg.role === 'system',
    )
    expect(systemMessages).toHaveLength(2)
  })
})
