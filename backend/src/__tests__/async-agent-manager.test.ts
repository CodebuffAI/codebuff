import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from 'bun:test'
import { WebSocket } from 'ws'
import { AsyncAgentInfo } from '../async-agent-manager'
import { AgentState } from '@codebuff/common/types/session-state'
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

// Mock websocket-action to avoid circular dependency
mock.module('../websockets/websocket-action', () => ({
  callMainPrompt: async () => ({
    sessionState: {
      mainAgentState: { agentId: 'main-agent', agentType: 'base' },
    },
  }),
}))

// Mock run-agent-step to avoid circular dependency
mock.module('../run-agent-step', () => ({
  loopAgentSteps: async () => ({
    agentState: { agentId: 'test-agent', agentType: 'base' },
    hasEndTurn: true,
  }),
}))

describe('AsyncAgentManager', () => {
  let manager: any
  let mockWs: WebSocket
  let mockFileContext: ProjectFileContext
  let mockAgentState: AgentState

  beforeEach(() => {
    // Import here to avoid circular dependency
    const { AsyncAgentManager } = require('../async-agent-manager')
    manager = new AsyncAgentManager()
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
      agentTemplates: {},
    }

    mockAgentState = {
      agentId: 'test-agent-1',
      agentType: 'base',
      agentContext: {},
      subagents: [],
      messageHistory: [],
      stepsRemaining: 10,
      report: {},
    }
  })

  afterEach(() => {
    mock.restore()
  })

  describe('registerAgent', () => {
    it('should register a new agent', () => {
      const agentInfo: AsyncAgentInfo = {
        agentState: mockAgentState,
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-1',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'running',
      }

      manager.registerAgent(agentInfo)

      const retrievedAgent = manager.getAgent('test-agent-1')
      expect(retrievedAgent).toBeDefined()
      expect(retrievedAgent?.agentState.agentId).toBe('test-agent-1')
      expect(retrievedAgent?.status).toBe('running')
    })

    it('should track agents by session', () => {
      const agentInfo: AsyncAgentInfo = {
        agentState: mockAgentState,
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-1',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'running',
      }

      manager.registerAgent(agentInfo)

      const sessionAgents = manager.getSessionAgents('session-1')
      expect(sessionAgents).toHaveLength(1)
      expect(sessionAgents[0].agentState.agentId).toBe('test-agent-1')
    })
  })

  describe('updateAgentState', () => {
    it('should update agent state and status', () => {
      const agentInfo: AsyncAgentInfo = {
        agentState: mockAgentState,
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-1',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'running',
      }

      manager.registerAgent(agentInfo)

      const updatedState = { ...mockAgentState, report: { status: 'updated' } }
      manager.updateAgentState(updatedState, 'completed')

      const retrievedAgent = manager.getAgent('test-agent-1')
      expect(retrievedAgent?.status).toBe('completed')
      expect(retrievedAgent?.agentState.report).toEqual({ status: 'updated' })
    })

    it('should handle updating non-existent agent gracefully', () => {
      const nonExistentState = { ...mockAgentState, agentId: 'non-existent' }

      // Should not throw
      expect(() => {
        manager.updateAgentState(nonExistentState, 'completed')
      }).not.toThrow()
    })
  })

  describe('sendMessage', () => {
    it('should queue message for target agent', () => {
      const agentInfo: AsyncAgentInfo = {
        agentState: mockAgentState,
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-1',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'completed', // Not running
      }

      manager.registerAgent(agentInfo)

      const message = {
        fromAgentId: 'sender-agent',
        toAgentId: 'test-agent-1',
        prompt: 'Test message',
        params: { key: 'value' },
        timestamp: new Date(),
      }

      manager.sendMessage(message)

      const messages = manager.getMessages('test-agent-1')
      expect(messages).toHaveLength(1)
      expect(messages[0].prompt).toBe('Test message')
      expect(messages[0].params).toEqual({ key: 'value' })
    })

    it('should trigger agent execution if idle', async () => {
      const agentInfo: AsyncAgentInfo = {
        agentState: mockAgentState,
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-1',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'completed', // Idle
      }

      manager.registerAgent(agentInfo)

      const message = {
        fromAgentId: 'sender-agent',
        toAgentId: 'test-agent-1',
        prompt: 'Test message',
        timestamp: new Date(),
      }

      // Mock the dynamic import
      const mockLoopAgentSteps = spyOn(
        await import('../run-agent-step'),
        'loopAgentSteps'
      ).mockResolvedValue({
        agentState: mockAgentState,
        hasEndTurn: true,
      })

      manager.sendMessage(message)

      // Wait a bit for async execution
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockLoopAgentSteps).toHaveBeenCalled()
    })

    it('should not trigger running agent', () => {
      const agentInfo: AsyncAgentInfo = {
        agentState: mockAgentState,
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-1',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'running', // Already running
      }

      manager.registerAgent(agentInfo)

      const message = {
        fromAgentId: 'sender-agent',
        toAgentId: 'test-agent-1',
        prompt: 'Test message',
        timestamp: new Date(),
      }

      manager.sendMessage(message)

      const messages = manager.getMessages('test-agent-1')
      expect(messages).toHaveLength(1)
      // Agent should not be triggered since it's already running
    })
  })

  describe('getAndClearMessages', () => {
    it('should return and clear messages', () => {
      const message1 = {
        fromAgentId: 'sender-1',
        toAgentId: 'test-agent-1',
        prompt: 'Message 1',
        timestamp: new Date(),
      }

      const message2 = {
        fromAgentId: 'sender-2',
        toAgentId: 'test-agent-1',
        prompt: 'Message 2',
        timestamp: new Date(),
      }

      manager.sendMessage(message1)
      manager.sendMessage(message2)

      const messages = manager.getAndClearMessages('test-agent-1')
      expect(messages).toHaveLength(2)
      expect(messages[0].prompt).toBe('Message 1')
      expect(messages[1].prompt).toBe('Message 2')

      // Queue should be empty after clearing
      const remainingMessages = manager.getMessages('test-agent-1')
      expect(remainingMessages).toHaveLength(0)
    })

    it('should return empty array for non-existent agent', () => {
      const messages = manager.getAndClearMessages('non-existent')
      expect(messages).toHaveLength(0)
    })
  })

  describe('getChildAgents', () => {
    it('should return child agents of a parent', () => {
      const parentAgent: AsyncAgentInfo = {
        agentState: { ...mockAgentState, agentId: 'parent-agent' },
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-1',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'running',
      }

      const childAgent: AsyncAgentInfo = {
        agentState: {
          ...mockAgentState,
          agentId: 'child-agent',
          parentId: 'parent-agent',
        },
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-1',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'running',
      }

      manager.registerAgent(parentAgent)
      manager.registerAgent(childAgent)

      const children = manager.getChildAgents('parent-agent')
      expect(children).toHaveLength(1)
      expect(children[0].agentState.agentId).toBe('child-agent')
    })

    it('should return empty array for agent with no children', () => {
      const children = manager.getChildAgents('non-existent')
      expect(children).toHaveLength(0)
    })
  })

  describe('hasRunningChildren', () => {
    it('should return true when agent has running children', () => {
      const parentAgent: AsyncAgentInfo = {
        agentState: { ...mockAgentState, agentId: 'parent-agent' },
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-1',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'running',
      }

      const childAgent: AsyncAgentInfo = {
        agentState: {
          ...mockAgentState,
          agentId: 'child-agent',
          parentId: 'parent-agent',
        },
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-1',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'running',
      }

      manager.registerAgent(parentAgent)
      manager.registerAgent(childAgent)

      expect(manager.hasRunningChildren('parent-agent')).toBe(true)
    })

    it('should return false when agent has no running children', () => {
      const parentAgent: AsyncAgentInfo = {
        agentState: { ...mockAgentState, agentId: 'parent-agent' },
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-1',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'running',
      }

      const childAgent: AsyncAgentInfo = {
        agentState: {
          ...mockAgentState,
          agentId: 'child-agent',
          parentId: 'parent-agent',
        },
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-1',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'completed', // Not running
      }

      manager.registerAgent(parentAgent)
      manager.registerAgent(childAgent)

      expect(manager.hasRunningChildren('parent-agent')).toBe(false)
    })
  })

  describe('cleanupSession', () => {
    it('should cleanup all agents in a session', () => {
      const agent1: AsyncAgentInfo = {
        agentState: { ...mockAgentState, agentId: 'agent-1' },
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-1',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'running',
      }

      const agent2: AsyncAgentInfo = {
        agentState: { ...mockAgentState, agentId: 'agent-2' },
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-1',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'running',
      }

      manager.registerAgent(agent1)
      manager.registerAgent(agent2)

      expect(manager.getSessionAgents('session-1')).toHaveLength(2)

      manager.cleanupSession('session-1')

      expect(manager.getSessionAgents('session-1')).toHaveLength(0)
      expect(manager.getAgent('agent-1')).toBeUndefined()
      expect(manager.getAgent('agent-2')).toBeUndefined()
    })

    it('should handle cleanup of non-existent session', () => {
      expect(() => {
        manager.cleanupSession('non-existent')
      }).not.toThrow()
    })
  })

  describe('cleanupUserInputAgents', () => {
    it('should cleanup agents with matching userInputId prefix', () => {
      const agent1: AsyncAgentInfo = {
        agentState: { ...mockAgentState, agentId: 'agent-1' },
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-123-agent-1',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'running',
      }

      const agent2: AsyncAgentInfo = {
        agentState: { ...mockAgentState, agentId: 'agent-2' },
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-123-agent-2',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'running',
      }

      const agent3: AsyncAgentInfo = {
        agentState: { ...mockAgentState, agentId: 'agent-3' },
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-456-agent-3',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'running',
      }

      manager.registerAgent(agent1)
      manager.registerAgent(agent2)
      manager.registerAgent(agent3)

      manager.cleanupUserInputAgents('input-123')

      expect(manager.getAgent('agent-1')).toBeUndefined()
      expect(manager.getAgent('agent-2')).toBeUndefined()
      expect(manager.getAgent('agent-3')).toBeDefined() // Should remain
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const runningAgent: AsyncAgentInfo = {
        agentState: { ...mockAgentState, agentId: 'running-agent' },
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-1',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'running',
      }

      const completedAgent: AsyncAgentInfo = {
        agentState: { ...mockAgentState, agentId: 'completed-agent' },
        sessionId: 'session-2',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-2',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'completed',
      }

      const failedAgent: AsyncAgentInfo = {
        agentState: { ...mockAgentState, agentId: 'failed-agent' },
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-3',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'failed',
      }

      manager.registerAgent(runningAgent)
      manager.registerAgent(completedAgent)
      manager.registerAgent(failedAgent)

      const stats = manager.getStats()

      expect(stats.totalAgents).toBe(3)
      expect(stats.runningAgents).toBe(1)
      expect(stats.completedAgents).toBe(1)
      expect(stats.failedAgents).toBe(1)
      expect(stats.cancelledAgents).toBe(0)
      expect(stats.activeSessions).toBe(2) // session-1 and session-2
    })
  })

  describe('removeAgent', () => {
    it('should remove agent and cleanup associated data', () => {
      const agentInfo: AsyncAgentInfo = {
        agentState: mockAgentState,
        sessionId: 'session-1',
        userId: 'user-1',
        fingerprintId: 'fingerprint-1',
        userInputId: 'input-1',
        ws: mockWs,
        fileContext: mockFileContext,
        startTime: new Date(),
        status: 'running',
      }

      manager.registerAgent(agentInfo)
      manager.sendMessage({
        fromAgentId: 'sender',
        toAgentId: 'test-agent-1',
        prompt: 'Test message',
        timestamp: new Date(),
      })

      expect(manager.getAgent('test-agent-1')).toBeDefined()
      expect(manager.getMessages('test-agent-1')).toHaveLength(1)

      manager.removeAgent('test-agent-1')

      expect(manager.getAgent('test-agent-1')).toBeUndefined()
      expect(manager.getMessages('test-agent-1')).toHaveLength(0)
      expect(manager.getSessionAgents('session-1')).toHaveLength(0)
    })
  })
})
