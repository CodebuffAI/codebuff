import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { handleSendAgentMessage } from '../tools/handlers/send-agent-message'
import { AgentState } from '@codebuff/common/types/session-state'
import { CodebuffToolCall } from '../tools/constants'
import { AsyncAgentInfo } from '../async-agent-manager'
import { WebSocket } from 'ws'
import { ProjectFileContext } from '@codebuff/common/util/file'

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
const mockAsyncAgentManager = {
  getAgent: mock(() => undefined as AsyncAgentInfo | undefined),
  sendMessage: mock(() => {}),
}

mock.module('../async-agent-manager', () => ({
  asyncAgentManager: mockAsyncAgentManager,
}))

describe('handleSendAgentMessage', () => {
  let mockAgentState: AgentState

  beforeEach(() => {
    mockAgentState = {
      agentId: 'sender-agent',
      agentType: 'base',
      agentContext: {},
      subagents: [],
      messageHistory: [],
      stepsRemaining: 10,
      report: {},
      parentId: 'parent-agent-id',
    }

    // Reset mocks
    mockAsyncAgentManager.getAgent.mockReset()
    mockAsyncAgentManager.sendMessage.mockReset()
  })

  afterEach(() => {
    mock.restore()
  })

  it('should send message to target agent', async () => {
    const mockTargetAgent: AsyncAgentInfo = {
      agentState: { agentId: 'target-agent', agentType: 'base' } as AgentState,
      sessionId: 'session-1',
      userId: 'user-1',
      fingerprintId: 'fingerprint-1',
      userInputId: 'input-1',
      ws: {} as WebSocket,
      fileContext: {} as ProjectFileContext,
      startTime: new Date(),
      status: 'running',
    }

    mockAsyncAgentManager.getAgent.mockReturnValue(mockTargetAgent)

    const toolCall: CodebuffToolCall<'send_agent_message'> = {
      toolName: 'send_agent_message',
      toolCallId: 'test-call-1',
      args: {
        target_agent_id: 'target-agent',
        prompt: 'Hello target agent',
        params: { key: 'value' },
      },
    }

    const result = handleSendAgentMessage({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      state: {
        mutableState: {
          agentState: mockAgentState,
        },
      },
    })

    const resultValue = await result.result
    expect(resultValue).toBe('Message sent to agent target-agent')

    expect(mockAsyncAgentManager.getAgent).toHaveBeenCalledWith('target-agent')
    expect(mockAsyncAgentManager.sendMessage).toHaveBeenCalledWith({
      fromAgentId: 'sender-agent',
      toAgentId: 'target-agent',
      prompt: 'Hello target agent',
      params: { key: 'value' },
      timestamp: expect.any(Date),
    })
  })

  it('should resolve PARENT_ID to actual parent agent ID', async () => {
    const mockParentAgent: AsyncAgentInfo = {
      agentState: { agentId: 'parent-agent-id', agentType: 'base' } as AgentState,
      sessionId: 'session-1',
      userId: 'user-1',
      fingerprintId: 'fingerprint-1',
      userInputId: 'input-1',
      ws: {} as WebSocket,
      fileContext: {} as ProjectFileContext,
      startTime: new Date(),
      status: 'running',
    }
    mockAsyncAgentManager.getAgent.mockReturnValue(mockParentAgent)

    const toolCall: CodebuffToolCall<'send_agent_message'> = {
      toolName: 'send_agent_message',
      toolCallId: 'test-call-2',
      args: {
        target_agent_id: 'PARENT_ID',
        prompt: 'Hello parent',
        params: undefined,
      },
    }

    const result = handleSendAgentMessage({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      state: {
        mutableState: {
          agentState: mockAgentState,
        },
      },
    })

    const resultValue = await result.result
    expect(resultValue).toBe('Message sent to agent parent-agent-id')

    expect(mockAsyncAgentManager.getAgent).toHaveBeenCalledWith('parent-agent-id')
    expect(mockAsyncAgentManager.sendMessage).toHaveBeenCalledWith({
      fromAgentId: 'sender-agent',
      toAgentId: 'parent-agent-id',
      prompt: 'Hello parent',
      params: undefined,
      timestamp: expect.any(Date),
    })
  })

  it('should throw error when PARENT_ID used but no parent exists', async () => {
    const agentStateWithoutParent = {
      ...mockAgentState,
      parentId: undefined,
    }

    const toolCall: CodebuffToolCall<'send_agent_message'> = {
      toolName: 'send_agent_message',
      toolCallId: 'test-call-3',
      args: {
        target_agent_id: 'PARENT_ID',
        prompt: 'Hello parent',
      },
    }

    const result = handleSendAgentMessage({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      state: {
        mutableState: {
          agentState: agentStateWithoutParent,
        },
      },
    })

    await expect(result.result).rejects.toThrow('No parent agent found for this agent')
  })

  it('should throw error when target agent not found', async () => {
    mockAsyncAgentManager.getAgent.mockReturnValue(undefined)

    const toolCall: CodebuffToolCall<'send_agent_message'> = {
      toolName: 'send_agent_message',
      toolCallId: 'test-call-4',
      args: {
        target_agent_id: 'nonexistent-agent',
        prompt: 'Hello nonexistent',
      },
    }

    const result = handleSendAgentMessage({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      state: {
        mutableState: {
          agentState: mockAgentState,
        },
      },
    })

    await expect(result.result).rejects.toThrow('Target agent nonexistent-agent not found')
  })

  it('should throw error when missing agent state', () => {
    const toolCall: CodebuffToolCall<'send_agent_message'> = {
      toolName: 'send_agent_message',
      toolCallId: 'test-call-5',
      args: {
        target_agent_id: 'target-agent',
        prompt: 'Hello',
      },
    }

    expect(() => {
      handleSendAgentMessage({
        previousToolCallFinished: Promise.resolve(),
        toolCall,
        state: {
          // Missing mutableState
        },
      })
    }).toThrow('Internal error for send_agent_message: Missing agentState in state')
  })

  it('should send message without params when not provided', async () => {
    const mockTargetAgent: AsyncAgentInfo = {
      agentState: { agentId: 'target-agent', agentType: 'base' } as AgentState,
      sessionId: 'session-1',
      userId: 'user-1',
      fingerprintId: 'fingerprint-1',
      userInputId: 'input-1',
      ws: {} as WebSocket,
      fileContext: {} as ProjectFileContext,
      startTime: new Date(),
      status: 'running',
    }

    mockAsyncAgentManager.getAgent.mockReturnValue(mockTargetAgent)

    const toolCall: CodebuffToolCall<'send_agent_message'> = {
      toolName: 'send_agent_message',
      toolCallId: 'test-call-6',
      args: {
        target_agent_id: 'target-agent',
        prompt: 'Simple message',
        // No params provided
      },
    }

    const result = handleSendAgentMessage({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      state: {
        mutableState: {
          agentState: mockAgentState,
        },
      },
    })

    await result.result

    expect(mockAsyncAgentManager.sendMessage).toHaveBeenCalledWith({
      fromAgentId: 'sender-agent',
      toAgentId: 'target-agent',
      prompt: 'Simple message',
      params: undefined,
      timestamp: expect.any(Date),
    })
  })

  it('should handle empty prompt', async () => {
    const mockTargetAgent: AsyncAgentInfo = {
      agentState: { agentId: 'target-agent', agentType: 'base' } as AgentState,
      sessionId: 'session-1',
      userId: 'user-1',
      fingerprintId: 'fingerprint-1',
      userInputId: 'input-1',
      ws: {} as WebSocket,
      fileContext: {} as ProjectFileContext,
      startTime: new Date(),
      status: 'running',
    }

    mockAsyncAgentManager.getAgent.mockReturnValue(mockTargetAgent)

    const toolCall: CodebuffToolCall<'send_agent_message'> = {
      toolName: 'send_agent_message',
      toolCallId: 'test-call-7',
      args: {
        target_agent_id: 'target-agent',
        prompt: '',
      },
    }

    const result = handleSendAgentMessage({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      state: {
        mutableState: {
          agentState: mockAgentState,
        },
      },
    })
    const resultValue = await result.result
    expect(resultValue).toBe('Message sent to agent target-agent')

    expect(mockAsyncAgentManager.sendMessage).toHaveBeenCalledWith({
      fromAgentId: 'sender-agent',
      toAgentId: 'target-agent',
      prompt: '',
      params: undefined,
      timestamp: expect.any(Date),
    })
  })
})
