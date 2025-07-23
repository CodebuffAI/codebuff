import { TEST_USER_ID } from '@codebuff/common/constants'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  Mock,
  mock,
  spyOn,
} from 'bun:test'
import { WebSocket } from 'ws'

import * as runAgentStep from '../run-agent-step'
import { AgentTemplate } from '../templates/types'
import {
  handleSpawnAgents,
  SendSubagentChunk,
} from '../tools/handlers/spawn-agents'
import { mockFileContext, MockWebSocket } from './test-utils'

describe('Subagent Streaming', () => {
  let mockLogger: any
  let mockSendSubagentChunk: Mock<SendSubagentChunk>
  let mockLoopAgentSteps: Mock<(typeof runAgentStep)['loopAgentSteps']>
  let mockAgentRegistry: any

  beforeAll(() => {
    // Mock dependencies
    mockLogger = mock.module('../util/logger', () => ({
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      withLoggerContext: async (context: any, fn: () => Promise<any>) => fn(),
    }))

    // Mock sendSubagentChunk function to capture streaming messages
    mockSendSubagentChunk = mock(
      (data: {
        userInputId: string
        agentId: string
        agentType: string
        chunk: string
        prompt?: string
      }) => {}
    )

    // Mock loopAgentSteps to simulate subagent execution with streaming
    mockLoopAgentSteps = spyOn(
      runAgentStep,
      'loopAgentSteps'
    ).mockImplementation(async (ws, options) => {
      // Simulate streaming chunks by calling the callback
      if (options.onResponseChunk) {
        options.onResponseChunk('Thinking about the problem...')
        options.onResponseChunk('Found a solution!')
      }

      return {
        agentState: {
          ...options.agentState,
          messageHistory: [
            { role: 'assistant', content: 'Test response from subagent' },
          ],
        },
      }
    })

    // Mock agent registry
    mockAgentRegistry = mock.module('../templates/agent-registry', () => ({
      agentRegistry: {
        initialize: async () => {},
        getAllTemplates: () => ({
          thinker: {
            id: 'thinker',
            name: 'Thinker',
            outputMode: 'last_message',
            promptSchema: { prompt: { safeParse: () => ({ success: true }) } },
          },
        }),
        getAgentName: () => 'Thinker',
      },
    }))
  })

  beforeEach(() => {
    mockSendSubagentChunk.mockClear()
    mockLoopAgentSteps.mockClear()
  })

  afterAll(() => {
    mockLogger.restore()
    mockAgentRegistry.restore()
  })

  it('should send subagent-response-chunk messages during agent execution', async () => {
    const ws = new MockWebSocket() as unknown as WebSocket
    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState

    // Mock parent agent template that can spawn thinker
    const parentTemplate = {
      id: 'base',
      spawnableAgents: ['thinker'],
    } as unknown as AgentTemplate

    const toolCall = {
      toolName: 'spawn_agents' as const,
      toolCallId: 'test-tool-call-id',
      args: {
        agents: [
          {
            agent_type: 'thinker',
            prompt: 'Think about this problem',
          },
        ],
      },
    }

    const { result } = handleSpawnAgents({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext: mockFileContext,
      clientSessionId: 'test-session',
      userInputId: 'test-input',
      getLatestState: () => ({ messages: [] }),
      state: {
        ws,
        fingerprintId: 'test-fingerprint',
        userId: TEST_USER_ID,
        agentTemplate: parentTemplate,
        sendSubagentChunk: mockSendSubagentChunk,
        messages: [],
        agentState,
      },
    })

    await result

    // Verify that subagent streaming messages were sent
    expect(mockSendSubagentChunk).toHaveBeenCalledTimes(2)

    // Check first streaming chunk
    expect(mockSendSubagentChunk).toHaveBeenNthCalledWith(1, {
      userInputId: 'test-input',
      agentId: expect.any(String),
      agentType: 'thinker',
      chunk: 'Thinking about the problem...',
      prompt: 'Think about this problem',
    })

    // Check second streaming chunk
    expect(mockSendSubagentChunk).toHaveBeenNthCalledWith(2, {
      userInputId: 'test-input',
      agentId: expect.any(String),
      agentType: 'thinker',
      chunk: 'Found a solution!',
      prompt: 'Think about this problem',
    })
  })

  it('should include correct agentId and agentType in streaming messages', async () => {
    const ws = new MockWebSocket() as unknown as WebSocket
    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState

    const parentTemplate = {
      id: 'base',
      spawnableAgents: ['thinker'],
    } as unknown as AgentTemplate

    const toolCall = {
      toolName: 'spawn_agents' as const,
      toolCallId: 'test-tool-call-id-2',
      args: {
        agents: [
          {
            agent_type: 'thinker',
            prompt: 'Test prompt',
          },
        ],
      },
    }

    const { result } = handleSpawnAgents({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext: mockFileContext,
      clientSessionId: 'test-session',
      userInputId: 'test-input-123',
      getLatestState: () => ({ messages: [] }),
      state: {
        ws,
        fingerprintId: 'test-fingerprint',
        userId: TEST_USER_ID,
        agentTemplate: parentTemplate,
        sendSubagentChunk: mockSendSubagentChunk,
        messages: [],
        agentState,
      },
    })
    await result

    // Verify the streaming messages have consistent agentId and correct agentType
    expect(mockSendSubagentChunk.mock.calls.length).toBeGreaterThanOrEqual(2)
    const calls = mockSendSubagentChunk.mock.calls as Array<
      [
        {
          userInputId: string
          agentId: string
          agentType: string
          chunk: string
          prompt?: string
        },
      ]
    >
    const firstCall = calls[0][0]
    const secondCall = calls[1][0]

    expect(firstCall.agentId).toBe(secondCall.agentId) // Same agent ID
    expect(firstCall.agentType).toBe('thinker')
    expect(secondCall.agentType).toBe('thinker')
    expect(firstCall.userInputId).toBe('test-input-123')
    expect(secondCall.userInputId).toBe('test-input-123')
  })
})
