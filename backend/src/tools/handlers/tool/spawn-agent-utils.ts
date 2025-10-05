import { MAX_AGENT_STEPS_DEFAULT } from '@codebuff/common/constants/agents'
import { parseAgentId } from '@codebuff/common/util/agent-id-parsing'
import { generateCompactId } from '@codebuff/common/util/string'

import { getAgentTemplate } from '../../../templates/agent-registry'
import { logger } from '../../../util/logger'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  AgentState,
  AgentTemplateType,
  Subgoal,
} from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'
export interface SpawnAgentParams {
  agent_type: string
  prompt?: string
  params?: any
}

export interface BaseSpawnState {
  ws?: WebSocket
  fingerprintId?: string
  userId?: string
  agentTemplate?: AgentTemplate
  localAgentTemplates?: Record<string, AgentTemplate>
  messages?: Message[]
  agentState?: AgentState
  system?: string
}

export interface SpawnContext {
  fileContext: ProjectFileContext
  clientSessionId: string
  userInputId: string
  getLatestState: () => { messages: Message[] }
}

/**
 * Validates that all required state is present for spawning agents
 */
export function validateSpawnState(
  state: BaseSpawnState,
  toolName: string,
): Omit<Required<BaseSpawnState>, 'userId'> & { userId: string | undefined } {
  const {
    ws,
    fingerprintId,
    agentTemplate: parentAgentTemplate,
    localAgentTemplates,
    messages,
    agentState,
    userId,
    system,
  } = state

  if (!ws) {
    throw new Error(
      `Internal error for ${toolName}: Missing WebSocket in state`,
    )
  }
  if (!fingerprintId) {
    throw new Error(
      `Internal error for ${toolName}: Missing fingerprintId in state`,
    )
  }
  if (!parentAgentTemplate) {
    throw new Error(
      `Internal error for ${toolName}: Missing agentTemplate in state`,
    )
  }
  if (!messages) {
    throw new Error(`Internal error for ${toolName}: Missing messages in state`)
  }
  if (!agentState) {
    throw new Error(
      `Internal error for ${toolName}: Missing agentState in state`,
    )
  }
  if (!localAgentTemplates) {
    throw new Error(
      `Internal error for ${toolName}: Missing localAgentTemplates in state`,
    )
  }
  if (!system) {
    throw new Error(`Internal error for ${toolName}: Missing system in state`)
  }

  return {
    ws,
    fingerprintId,
    userId,
    agentTemplate: parentAgentTemplate,
    localAgentTemplates,
    messages,
    agentState,
    system,
  }
}

/**
 * Checks if a parent agent is allowed to spawn a child agent
 */
export function getMatchingSpawn(
  spawnableAgents: AgentTemplateType[],
  childFullAgentId: string,
) {
  const {
    publisherId: childPublisherId,
    agentId: childAgentId,
    version: childVersion,
  } = parseAgentId(childFullAgentId)

  if (!childAgentId) {
    return null
  }

  for (const spawnableAgent of spawnableAgents) {
    const {
      publisherId: spawnablePublisherId,
      agentId: spawnableAgentId,
      version: spawnableVersion,
    } = parseAgentId(spawnableAgent)

    if (!spawnableAgentId) {
      continue
    }

    if (
      spawnableAgentId === childAgentId &&
      spawnablePublisherId === childPublisherId &&
      spawnableVersion === childVersion
    ) {
      return spawnableAgent
    }
    if (!childVersion && childPublisherId) {
      if (
        spawnablePublisherId === childPublisherId &&
        spawnableAgentId === childAgentId
      ) {
        return spawnableAgent
      }
    }
    if (!childPublisherId && childVersion) {
      if (
        spawnableAgentId === childAgentId &&
        spawnableVersion === childVersion
      ) {
        return spawnableAgent
      }
    }

    if (!childVersion && !childPublisherId) {
      if (spawnableAgentId === childAgentId) {
        return spawnableAgent
      }
    }
  }
  return null
}

/**
 * Validates agent template and permissions
 */
export async function validateAndGetAgentTemplate(
  agentTypeStr: string,
  parentAgentTemplate: AgentTemplate,
  localAgentTemplates: Record<string, AgentTemplate>,
): Promise<{ agentTemplate: AgentTemplate; agentType: string }> {
  const agentTemplate = await getAgentTemplate(
    agentTypeStr,
    localAgentTemplates,
  )

  if (!agentTemplate) {
    throw new Error(`Agent type ${agentTypeStr} not found.`)
  }
  const BASE_AGENTS = ['base', 'base-lite', 'base-max', 'base-experimental']
  // Base agent can spawn any agent
  if (BASE_AGENTS.includes(parentAgentTemplate.id)) {
    return { agentTemplate, agentType: agentTypeStr }
  }

  const agentType = getMatchingSpawn(
    parentAgentTemplate.spawnableAgents,
    agentTypeStr,
  )
  if (!agentType) {
    throw new Error(
      `Agent type ${parentAgentTemplate.id} is not allowed to spawn child agent type ${agentTypeStr}.`,
    )
  }

  return { agentTemplate, agentType }
}

/**
 * Validates prompt and params against agent schema
 */
export function validateAgentInput(
  agentTemplate: AgentTemplate,
  agentType: string,
  prompt?: string,
  params?: any,
): void {
  const { inputSchema } = agentTemplate

  // Validate prompt requirement
  if (inputSchema.prompt) {
    const result = inputSchema.prompt.safeParse(prompt)
    if (!result.success) {
      throw new Error(
        `Invalid prompt for agent ${agentType}: ${JSON.stringify(result.error.issues, null, 2)}`,
      )
    }
  }

  // Validate params if schema exists
  if (inputSchema.params) {
    const result = inputSchema.params.safeParse(params ?? {})
    if (!result.success) {
      throw new Error(
        `Invalid params for agent ${agentType}: ${JSON.stringify(result.error.issues, null, 2)}`,
      )
    }
  }
}

/**
 * Creates a new agent state for spawned agents
 */
export function createAgentState(
  agentType: string,
  agentTemplate: AgentTemplate,
  parentAgentState: AgentState,
  parentMessageHistory: Message[],
  agentContext: Record<string, Subgoal>,
): AgentState {
  const agentId = generateCompactId()

  const messageHistory = agentTemplate.includeMessageHistory
    ? parentMessageHistory
    : []

  return {
    agentId,
    agentType,
    agentContext,
    ancestorRunIds: [
      ...parentAgentState.ancestorRunIds,
      parentAgentState.runId ?? 'NULL',
    ],
    subagents: [],
    childRunIds: [],
    messageHistory,
    stepsRemaining: MAX_AGENT_STEPS_DEFAULT,
    creditsUsed: 0,
    directCreditsUsed: 0,
    output: undefined,
    parentId: parentAgentState.agentId,
  }
}

/**
 * Logs agent spawn information
 */
export function logAgentSpawn(
  agentTemplate: AgentTemplate,
  agentType: string,
  agentId: string,
  parentId: string | undefined,
  prompt?: string,
  params?: any,
  inline = false,
): void {
  logger.debug(
    {
      agentTemplate,
      prompt,
      params,
      agentId,
      parentId,
    },
    `Spawning agent${inline ? ' inline' : ''} — ${agentType} (${agentId})`,
  )
}

/**
 * Executes a subagent using loopAgentSteps
 */
export async function executeSubagent({
  ws,
  userInputId,
  prompt,
  params,
  agentTemplate,
  parentAgentState,
  agentState,
  fingerprintId,
  fileContext,
  localAgentTemplates,
  userId,
  clientSessionId,
  onResponseChunk,
  isOnlyChild = false,
  clearUserPromptMessagesAfterResponse = true,
  parentSystemPrompt,
}: {
  ws: WebSocket
  userInputId: string
  prompt: string
  params: any
  agentTemplate: AgentTemplate
  parentAgentState: AgentState
  agentState: AgentState
  fingerprintId: string
  fileContext: ProjectFileContext
  localAgentTemplates: Record<string, AgentTemplate>
  userId?: string
  clientSessionId: string
  onResponseChunk: (chunk: string | PrintModeEvent) => void
  isOnlyChild?: boolean
  clearUserPromptMessagesAfterResponse?: boolean
  parentSystemPrompt?: string
}) {
  onResponseChunk({
    type: 'subagent_start',
    agentId: agentTemplate.id,
    displayName: agentTemplate.displayName,
    onlyChild: isOnlyChild,
  })

  // Import loopAgentSteps dynamically to avoid circular dependency
  const { loopAgentSteps } = await import('../../../run-agent-step')

  const result = await loopAgentSteps(ws, {
    userInputId,
    prompt,
    params,
    agentType: agentTemplate.id,
    agentState,
    fingerprintId,
    fileContext,
    localAgentTemplates,
    userId,
    clientSessionId,
    onResponseChunk,
    clearUserPromptMessagesAfterResponse,
    parentSystemPrompt,
  })

  onResponseChunk({
    type: 'subagent_finish',
    agentId: agentTemplate.id,
    displayName: agentTemplate.displayName,
    onlyChild: isOnlyChild,
  })

  if (result.agentState.runId) {
    parentAgentState.childRunIds.push(result.agentState.runId)
  } else {
    logger.error('No runId found for agent state after executing agent')
  }

  return result
}
