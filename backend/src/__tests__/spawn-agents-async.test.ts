import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { WebSocket } from 'ws'
import { handleSpawnAgentsAsync } from '../tools/handlers/spawn-agents-async'
import { AgentState } from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { CodebuffToolCall } from '../tools/constants'
import { AgentTemplate } from '../templates/types'


// Mock logger
mock.module('../util/logger', () => ({
  logger: {
    debug: () => {},
    error: () => {},
    info: () => {},
    warn: () => {},
  },
}))

// Mock async agent manager
mock.module('../async-agent-manager', () => ({
  asyncAgentManager: {
    getAgent: () => undefined,
    sendMessage: () => {},
  },
}))

// Mock agent registry
mock.module('../templates/agent-registry', () => ({
  agentRegistry: {
    initialize: () => {},
    getAllTemplates: () => ({
      'file_picker': {
        id: 'file_picker',
        spawnableAgents: [],
        promptSchema: {
          prompt: { safeParse: () => ({ success: true }) },
          params: undefined,
        },
        includeMessageHistory: false,
        implementation: 'llm',
        outputMode: 'last_message',
      },
      'researcher': {
        id: 'researcher',
        spawnableAgents: [],
        promptSchema: {
          prompt: { safeParse: () => ({ success: true }) },
          params: { safeParse: () => ({ success: true }) },
        },
        includeMessageHistory: true,
        implementation: 'llm',
        outputMode: 'all_messages',
      },
    }),
  },
}))

// Mock run-agent-step
mock.module('../run-agent-step', () => ({
  loopAgentSteps: async () => ({
    agentState: { agentId: 'test-agent', messageHistory: [] },
    hasEndTurn: true,
  }),
}))

// Mock spawn-agents handler for fallback
mock.module('../tools/handlers/spawn-agents', () => ({
  handleSpawnAgents: () => ({
    result: Promise.resolve('Fallback to sync spawn'),
    state: {},
  }),
}))

describe('handleSpawnAgentsAsync', () => {
  let mockWs: WebSocket
  let mockFileContext: ProjectFileContext
  let mockAgentState: AgentState
  let mockAgentTemplate: AgentTemplate

  beforeEach(() => {
    mockWs = {
      send: () => {},
      close: () => {},
      on: () => {},
      removeListener: () => {},
    } as unknown as WebSocket

    mockFileContext = {
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
      systemInfo: {
        platform: 'test',
        shell: 'test',
        nodeVersion: 'test',
        arch: 'test',
        homedir: '/home/test',
        cpus: 1,
      },
      fileVersions: [],
      agentTemplates: {},  // Add missing required field
    }

    mockAgentState = {
      agentId: 'parent-agent',
      agentType: 'base',
      agentContext: {},
      subagents: [],
      messageHistory: [],
      stepsRemaining: 10,
      report: {},
    }

    mockAgentTemplate = {
      id: 'base',
      name: 'Base Agent',
      description: 'Base agent for testing',
      model: 'anthropic/claude-3.5-sonnet-20240620',
      promptSchema: {
        prompt: undefined,
        params: undefined,
      },
      outputMode: 'last_message',
      includeMessageHistory: false,
      spawnableAgents: ['file_picker', 'researcher'],
      toolNames: [],
      stopSequences: [],
      systemPrompt: 'Test system prompt',
      userInputPrompt: 'Test user input prompt',
      agentStepPrompt: 'Test agent step prompt',
      implementation: 'llm' as const,
      initialAssistantMessage: undefined,
      initialAssistantPrefix: undefined,
      stepAssistantMessage: undefined,
      stepAssistantPrefix: undefined,
    }
  })

  afterEach(() => {
    mock.restore()
  })

  it('should fallback to sync spawn when async agents disabled', async () => {
    // Mock ASYNC_AGENTS_ENABLED to false
    mock.module('@codebuff/common/constants', () => ({
      ASYNC_AGENTS_ENABLED: false,
    }))

    const toolCall: CodebuffToolCall<'spawn_agents_async'> = {
      toolName: 'spawn_agents_async',
      toolCallId: 'test-call-1',
      args: {
        agents: [
          { agent_type: 'file_picker', prompt: 'Find auth files' },
        ],
      },
    }

    const result = handleSpawnAgentsAsync({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext: mockFileContext,
      clientSessionId: 'session-1',
      userInputId: 'input-1',
      state: {
        ws: mockWs,
        fingerprintId: 'fingerprint-1',
        userId: 'user-1',
        agentTemplate: mockAgentTemplate,
        mutableState: {
          messages: [],
          agentState: mockAgentState,
        },
      },
    })

    const resultValue = await result.result
    expect(resultValue).toBe('Fallback to sync spawn')


  })

  it('should spawn valid agents successfully', async () => {
    // Ensure async agents are enabled
    mock.module('@codebuff/common/constants', () => ({
      ASYNC_AGENTS_ENABLED: true,
    }))

    const toolCall: CodebuffToolCall<'spawn_agents_async'> = {
      toolName: 'spawn_agents_async',
      toolCallId: 'test-call-2',
      args: {
        agents: [
          { agent_type: 'file_picker', prompt: 'Find auth files' },
          { agent_type: 'researcher', prompt: 'Research auth patterns', params: { depth: 'deep' } },
        ],
      },
    }

    const result = handleSpawnAgentsAsync({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext: mockFileContext,
      clientSessionId: 'session-1',
      userInputId: 'input-1',
      state: {
        ws: mockWs,
        fingerprintId: 'fingerprint-1',
        userId: 'user-1',
        agentTemplate: mockAgentTemplate,
        mutableState: {
          messages: [],
          agentState: mockAgentState,
        },
      },
    })

    const resultValue = await result.result
    expect(resultValue).toContain('Agent spawn results (2/2 successful)')
    expect(resultValue).toContain('✓ file_picker: spawned')
    expect(resultValue).toContain('✓ researcher: spawned')
  })

  it('should handle invalid agent type', async () => {
    mock.module('@codebuff/common/constants', () => ({
      ASYNC_AGENTS_ENABLED: true,
    }))

    const toolCall: CodebuffToolCall<'spawn_agents_async'> = {
      toolName: 'spawn_agents_async',
      toolCallId: 'test-call-4',
      args: {
        agents: [
          { agent_type: 'nonexistent_agent', prompt: 'Do something' },
        ],
      },
    }

    const result = handleSpawnAgentsAsync({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext: mockFileContext,
      clientSessionId: 'session-1',
      userInputId: 'input-1',
      state: {
        ws: mockWs,
        fingerprintId: 'fingerprint-1',
        userId: 'user-1',
        agentTemplate: mockAgentTemplate,
        mutableState: {
          messages: [],
          agentState: mockAgentState,
        },
      },
    })

    const resultValue = await result.result
    expect(resultValue).toContain('Agent spawn results (0/1 successful)')
    expect(resultValue).toContain('✗ nonexistent_agent: failed - Agent type nonexistent_agent not found.')
  })

  it('should handle unauthorized spawnable agent', async () => {
    mock.module('@codebuff/common/constants', () => ({
      ASYNC_AGENTS_ENABLED: true,
    }))

    const restrictedAgentTemplate: AgentTemplate = {
      id: 'base',
      name: 'Restricted Agent',
      description: 'Restricted agent for testing',
      model: 'anthropic/claude-3.5-sonnet-20240620',
      promptSchema: {
        prompt: undefined,
        params: undefined,
      },
      outputMode: 'last_message',
      includeMessageHistory: false,
      spawnableAgents: ['file_picker'], // Only file_picker allowed
      toolNames: [],
      stopSequences: [],
      systemPrompt: 'Test system prompt',
      userInputPrompt: 'Test user input prompt',
      agentStepPrompt: 'Test agent step prompt',
      implementation: 'llm' as const,
      initialAssistantMessage: undefined,
      initialAssistantPrefix: undefined,
      stepAssistantMessage: undefined,
      stepAssistantPrefix: undefined,
    }

    const toolCall: CodebuffToolCall<'spawn_agents_async'> = {
      toolName: 'spawn_agents_async',
      toolCallId: 'test-call-3',
      args: {
        agents: [
          { agent_type: 'researcher', prompt: 'Research something' },
        ],
      },
    }

    const result = handleSpawnAgentsAsync({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext: mockFileContext,
      clientSessionId: 'session-1',
      userInputId: 'input-1',
      state: {
        ws: mockWs,
        fingerprintId: 'fingerprint-1',
        userId: 'user-1',
        agentTemplate: restrictedAgentTemplate,
        mutableState: {
          messages: [],
          agentState: mockAgentState,
        },
      },
    })

    const resultValue = await result.result
    expect(resultValue).toContain('Agent spawn results (0/1 successful)')
    expect(resultValue).toContain('✗ researcher: failed')
    expect(resultValue).toContain('is not allowed to spawn child agent type researcher')
  })

  it('should handle prompt validation failure', async () => {
    mock.module('@codebuff/common/constants', () => ({
      ASYNC_AGENTS_ENABLED: true,
    }))

    // Mock registry with failing validation
    mock.module('../templates/agent-registry', () => ({
      agentRegistry: {
        initialize: () => {},
        getAllTemplates: () => ({
          'file_picker': {
            id: 'file_picker',
            spawnableAgents: [],
            promptSchema: {
              prompt: { 
                safeParse: () => ({ 
                  success: false, 
                  error: { issues: [{ message: 'Invalid prompt format' }] }
                })
              },
            },
            includeMessageHistory: false,
            implementation: 'llm',
            outputMode: 'last_message',
          },
        }),
      },
    }))

    const toolCall: CodebuffToolCall<'spawn_agents_async'> = {
      toolName: 'spawn_agents_async',
      toolCallId: 'test-call-5',
      args: {
        agents: [
          { agent_type: 'file_picker', prompt: 'Invalid prompt' },
        ],
      },
    }

    const result = handleSpawnAgentsAsync({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext: mockFileContext,
      clientSessionId: 'session-1',
      userInputId: 'input-1',
      state: {
        ws: mockWs,
        fingerprintId: 'fingerprint-1',
        userId: 'user-1',
        agentTemplate: mockAgentTemplate,
        mutableState: {
          messages: [],
          agentState: mockAgentState,
        },
      },
    })

    const resultValue = await result.result
    expect(resultValue).toContain('Agent spawn results (0/1 successful)')
    expect(resultValue).toContain('✗ file_picker: failed')
    expect(resultValue).toContain('Invalid prompt for agent file_picker')
  })

  it('should handle params validation failure', async () => {
    mock.module('@codebuff/common/constants', () => ({
      ASYNC_AGENTS_ENABLED: true,
    }))

    // Mock registry with failing params validation
    mock.module('../templates/agent-registry', () => ({
      agentRegistry: {
        initialize: () => {},
        getAllTemplates: () => ({
          'researcher': {
            id: 'researcher',
            spawnableAgents: [],
            promptSchema: {
              prompt: { safeParse: () => ({ success: true }) },
              params: { 
                safeParse: () => ({ 
                  success: false, 
                  error: { issues: [{ message: 'Invalid params format' }] }
                })
              },
            },
            includeMessageHistory: false,
            implementation: 'llm',
            outputMode: 'last_message',
          },
        }),
      },
    }))

    const toolCall: CodebuffToolCall<'spawn_agents_async'> = {
      toolName: 'spawn_agents_async',
      toolCallId: 'test-call-6',
      args: {
        agents: [
          { agent_type: 'researcher', prompt: 'Research', params: { invalid: 'params' } },
        ],
      },
    }

    const result = handleSpawnAgentsAsync({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext: mockFileContext,
      clientSessionId: 'session-1',
      userInputId: 'input-1',
      state: {
        ws: mockWs,
        fingerprintId: 'fingerprint-1',
        userId: 'user-1',
        agentTemplate: mockAgentTemplate,
        mutableState: {
          messages: [],
          agentState: mockAgentState,
        },
      },
    })

    const resultValue = await result.result
    expect(resultValue).toContain('Agent spawn results (0/1 successful)')
    expect(resultValue).toContain('✗ researcher: failed')
    expect(resultValue).toContain('Invalid params for agent researcher')
  })

  it('should throw error when missing required state', async () => {
    mock.module('@codebuff/common/constants', () => ({
      ASYNC_AGENTS_ENABLED: true,
    }))

    const toolCall: CodebuffToolCall<'spawn_agents_async'> = {
      toolName: 'spawn_agents_async',
      toolCallId: 'test-call-7',
      args: {
        agents: [{ agent_type: 'file_picker', prompt: 'Find files' }],
      },
    }

    expect(() => {
      handleSpawnAgentsAsync({
        previousToolCallFinished: Promise.resolve(),
        toolCall,
        fileContext: mockFileContext,
        clientSessionId: 'session-1',
        userInputId: 'input-1',
        state: {
          // Missing required state fields
        },
      })
    }).toThrow('Internal error for spawn_agents_async: Missing WebSocket in state')
  })

  it('should include conversation history when agent requires it', async () => {
    mock.module('@codebuff/common/constants', () => ({
      ASYNC_AGENTS_ENABLED: true,
    }))

    const mockMessages = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there!' },
    ]

    const toolCall: CodebuffToolCall<'spawn_agents_async'> = {
      toolName: 'spawn_agents_async',
      toolCallId: 'test-call-8',
      args: {
        agents: [
          { agent_type: 'researcher', prompt: 'Research with context' },
        ],
      },
    }

    // Mock loopAgentSteps to capture the agent state
    let capturedAgentState: any
    mock.module('../run-agent-step', () => ({
      loopAgentSteps: async (ws: any, options: any) => {
        capturedAgentState = options.agentState
        return {
          agentState: options.agentState,
          hasEndTurn: true,
        }
      },
    }))

    // Also need to mock the agent registry for this test
    mock.module('../templates/agent-registry', () => ({
      agentRegistry: {
        initialize: () => {},
        getAllTemplates: () => ({
          'researcher': {
            id: 'researcher',
            spawnableAgents: [],
            promptSchema: {
              prompt: { safeParse: () => ({ success: true }) },
              params: { safeParse: () => ({ success: true }) },
            },
            includeMessageHistory: true,
            implementation: 'llm',
            outputMode: 'all_messages',
          },
        }),
      },
    }))

    const result = handleSpawnAgentsAsync({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext: mockFileContext,
      clientSessionId: 'session-1',
      userInputId: 'input-1',
      state: {
        ws: mockWs,
        fingerprintId: 'fingerprint-1',
        userId: 'user-1',
        agentTemplate: mockAgentTemplate,
        mutableState: {
          messages: mockMessages,
          agentState: mockAgentState,
        },
      },
    })

    await result.result

    // Verify that conversation history was included
    expect(capturedAgentState.messageHistory).toHaveLength(1)
    expect(capturedAgentState.messageHistory[0].content).toContain('conversation history')
    expect(capturedAgentState.messageHistory[0].content).toContain('Hello')
    expect(capturedAgentState.messageHistory[0].content).toContain('Hi there!')
  })
})
