import { assembleLocalAgentTemplates } from './templates/agent-registry'
import { logger } from './util/logger'

import type { AgentState } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'

export interface AsyncAgentInfo {
  agentState: AgentState
  sessionId: string
  userId: string
  fingerprintId: string
  userInputId: string
  ws: WebSocket
  fileContext: ProjectFileContext
  startTime: Date
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  promise?: Promise<{ agentState: AgentState; hasEndTurn?: boolean }>
}

export interface AsyncAgentMessage {
  fromAgentId: string
  toAgentId: string
  prompt: string
  params?: Record<string, any>
  timestamp: Date
}

/**
 * Manages asynchronous agent spawning and communication
 */
export class AsyncAgentManager {
  private agents = new Map<string, AsyncAgentInfo>()
  private messageQueues = new Map<string, AsyncAgentMessage[]>()
  private sessionAgents = new Map<string, Set<string>>() // sessionId -> agentIds

  /**
   * Register a new agent
   */
  registerAgent(agentInfo: AsyncAgentInfo): void {
    const { agentState, sessionId } = agentInfo
    const { agentId, agentType } = agentState
    this.agents.set(agentId, agentInfo)

    // Track agents by session for cleanup
    if (!this.sessionAgents.has(sessionId)) {
      this.sessionAgents.set(sessionId, new Set())
    }
    this.sessionAgents.get(sessionId)!.add(agentId)
  }

  /**
   * Update agent state and status
   */
  updateAgentState(
    agentState: AgentState,
    status: AsyncAgentInfo['status'],
  ): void {
    const agent = this.agents.get(agentState.agentId)
    if (agent) {
      agent.status = status
      agent.agentState = agentState
    }
  }

  /**
   * Get agent info by ID
   */
  getAgent(agentId: string): AsyncAgentInfo | undefined {
    return this.agents.get(agentId)
  }

  /**
   * Get all agents for a session
   */
  getSessionAgents(sessionId: string): AsyncAgentInfo[] {
    const agentIds = this.sessionAgents.get(sessionId) || new Set()
    return Array.from(agentIds)
      .map((id) => this.agents.get(id))
      .filter((agent): agent is AsyncAgentInfo => agent !== undefined)
  }

  /**
   * Get child agents of a parent
   */
  getChildAgents(parentAgentId: string): AsyncAgentInfo[] {
    return Array.from(this.agents.values()).filter(
      (agent) => agent.agentState.parentId === parentAgentId,
    )
  }

  /**
   * Check if agent has running children
   */
  hasRunningChildren(agentId: string): boolean {
    return this.getChildAgents(agentId).some(
      (child) => child.status === 'running',
    )
  }

  /**
   * Send message to an agent and trigger execution if not running
   */
  sendMessage(message: AsyncAgentMessage): void {
    const queue = this.messageQueues.get(message.toAgentId) || []
    queue.push(message)
    this.messageQueues.set(message.toAgentId, queue)

    logger.debug(
      {
        fromAgentId: message.fromAgentId,
        toAgentId: message.toAgentId,
        prompt: message.prompt.slice(0, 50) + '...',
      },
      'Queued message for async agent',
    )

    // Trigger agent execution if not currently running (fire and forget)
    this.triggerAgentIfIdle(message.toAgentId).catch((error) => {
      logger.error(
        { agentId: message.toAgentId, error },
        'Failed to trigger agent',
      )
    })
  }

  /**
   * Trigger agent execution if it's not currently running
   */
  private async triggerAgentIfIdle(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId)
    if (!agent) {
      logger.debug(
        { agentId },
        'Agent not found in async manager - may be a parent agent that will be triggered by normal agent loop',
      )
      return
    }

    // Atomic check and update to prevent race conditions
    if (agent.status === 'running') {
      return // Already running, nothing to do
    }

    logger.debug({ agentId }, 'Triggering idle agent due to new message')

    const { ws, userId, sessionId, userInputId } = agent

    let agentPromise: Promise<{ agentState: AgentState; hasEndTurn?: boolean }>
    try {
      if (agent.agentState.agentId === 'main-agent') {
        // Dynamic import to avoid circular dependency
        const { callMainPrompt } = await import('./websockets/websocket-action')
        const mainAgentPromise = callMainPrompt(
          ws,
          {
            type: 'prompt',
            prompt: undefined,
            promptId: userInputId,
            fingerprintId: agent.fingerprintId,
            costMode: 'normal',
            agentId: agent.agentState.agentType!,
            sessionState: {
              ...agent.agentState,
              fileContext: agent.fileContext,
              mainAgentState: agent.agentState,
            },
            toolResults: [],
          },
          {
            userId,
            promptId: userInputId,
            clientSessionId: sessionId,
          },
        )
        agentPromise = mainAgentPromise.then(({ sessionState }) => ({
          agentState: sessionState.mainAgentState,
          hasEndTurn: true,
        }))
      } else {
        // Import loopAgentSteps dynamically to avoid circular dependency
        const { loopAgentSteps } = await import('./run-agent-step')
        const { agentTemplates: localAgentTemplates } =
          assembleLocalAgentTemplates(agent.fileContext)

        agentPromise = loopAgentSteps(ws, {
          userInputId,
          prompt: undefined, // No initial prompt, will get messages from queue
          params: undefined,
          agentType: agent.agentState.agentType!,
          agentState: agent.agentState,
          fingerprintId: agent.fingerprintId,
          fileContext: agent.fileContext,
          localAgentTemplates,
          userId: agent.userId,
          clientSessionId: sessionId,
          onResponseChunk: () => {}, // Async agents don't stream to parent
        })
      }
      // Store the promise and handle completion
      agent.promise = agentPromise
      await agentPromise
      agent.promise = undefined

      logger.debug(
        { agentId },
        'Agent completed execution after message trigger',
      )
    } catch (error) {
      // Reset status to allow retry and clean up promise
      agent.status = 'failed' // Allow retry by setting to completed
      agent.promise = undefined
      logger.error(
        { agentId, error },
        'Agent failed during message-triggered execution',
      )
    }
  }

  /**
   * Get pending messages for an agent, without clearing them.
   */
  getMessages(agentId: string): AsyncAgentMessage[] {
    return [...(this.messageQueues.get(agentId) || [])]
  }

  /**
   * Retrieve pending messages for an agent, and clear them.
   */
  getAndClearMessages(agentId: string): AsyncAgentMessage[] {
    const messages = this.messageQueues.get(agentId) || []
    this.messageQueues.set(agentId, []) // Clear queue after reading
    return messages
  }

  /**
   * Remove agent and cleanup
   */
  removeAgent(agentId: string): void {
    const agent = this.agents.get(agentId)
    if (agent) {
      // Remove from session tracking
      const sessionAgents = this.sessionAgents.get(agent.sessionId)
      if (sessionAgents) {
        sessionAgents.delete(agentId)
        if (sessionAgents.size === 0) {
          this.sessionAgents.delete(agent.sessionId)
        }
      }

      // Clear message queue
      this.messageQueues.delete(agentId)

      // Remove agent
      this.agents.delete(agentId)
    }
  }

  /**
   * Cleanup all agents for a session (e.g., on disconnect)
   */
  cleanupSession(sessionId: string): void {
    const agentIds = this.sessionAgents.get(sessionId) || new Set()

    for (const agentId of agentIds) {
      const agent = this.agents.get(agentId)
      if (agent && agent.status === 'running') {
        agent.status = 'cancelled'
        // Note: We don't terminate the WebSocket here as it might be shared
        // The actual cleanup should happen in the agent execution loop
      }
      this.removeAgent(agentId)
    }

    logger.debug(
      { sessionId, agentCount: agentIds.size },
      'Cleaned up session agents',
    )
  }

  /**
   * Cleanup all agents associated with a specific user input ID
   */
  cleanupUserInputAgents(userInputId: string): void {
    const agentsToCleanup: string[] = []

    // Find all agents with the matching userInputId
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.userInputId.startsWith(userInputId)) {
        agentsToCleanup.push(agentId)
      }
    }

    // Cancel and remove the agents
    for (const agentId of agentsToCleanup) {
      const agent = this.agents.get(agentId)
      if (agent && agent.status === 'running') {
        agent.status = 'cancelled'
        // Note: We don't terminate the WebSocket here as it might be shared
        // The actual cleanup should happen in the agent execution loop
      }
      this.removeAgent(agentId)
    }

    logger.debug(
      { userInputId, agentCount: agentsToCleanup.length },
      'Cleaned up agents for user input ID',
    )
  }

  /**
   * Get all running agents
   */
  getRunningAgents(): AsyncAgentInfo[] {
    return Array.from(this.agents.values()).filter(
      (agent) => agent.status === 'running',
    )
  }

  /**
   * Get agent statistics
   */
  getStats(): {
    totalAgents: number
    runningAgents: number
    completedAgents: number
    failedAgents: number
    cancelledAgents: number
    activeSessions: number
  } {
    const agents = Array.from(this.agents.values())
    return {
      totalAgents: agents.length,
      runningAgents: agents.filter((a) => a.status === 'running').length,
      completedAgents: agents.filter((a) => a.status === 'completed').length,
      failedAgents: agents.filter((a) => a.status === 'failed').length,
      cancelledAgents: agents.filter((a) => a.status === 'cancelled').length,
      activeSessions: this.sessionAgents.size,
    }
  }
}

// Global instance
export const asyncAgentManager = new AsyncAgentManager()
