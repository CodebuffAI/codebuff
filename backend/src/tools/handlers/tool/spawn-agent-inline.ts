import { generateCompactId } from '@codebuff/common/util/string'

import { getAgentTemplate } from '../../../templates/agent-registry'
import { logger } from '../../../util/logger'
import { expireMessages } from '../../../util/messages'

import type { CodebuffToolCall } from '../../constants'
import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { CodebuffMessage } from '@codebuff/common/types/message'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  AgentState,
  AgentTemplateType,
} from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'

export const handleSpawnAgentInline = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'spawn_agent_inline'>
  fileContext: ProjectFileContext
  clientSessionId: string
  userInputId: string

  getLatestState: () => { messages: CodebuffMessage[] }
  state: {
    ws?: WebSocket
    fingerprintId?: string
    userId?: string
    agentTemplate?: AgentTemplate
    localAgentTemplates?: Record<string, AgentTemplate>
    messages?: CodebuffMessage[]
    agentState?: AgentState
  }
}): { result: Promise<undefined>; state: {} } => {
  const {
    previousToolCallFinished,
    toolCall,
    fileContext,
    clientSessionId,
    userInputId,
    getLatestState,
    state,
  } = params
  const {
    agent_type: agentTypeStr,
    prompt,
    params: agentParams,
  } = toolCall.args
  const {
    ws,
    fingerprintId,
    userId,
    agentTemplate: parentAgentTemplate,
    localAgentTemplates,
    messages,
  } = state
  let { agentState } = state

  if (!ws) {
    throw new Error(
      'Internal error for spawn_agent_inline: Missing WebSocket in state',
    )
  }
  if (!fingerprintId) {
    throw new Error(
      'Internal error for spawn_agent_inline: Missing fingerprintId in state',
    )
  }
  if (!parentAgentTemplate) {
    throw new Error(
      'Internal error for spawn_agent_inline: Missing agentTemplate in state',
    )
  }
  if (!messages) {
    throw new Error(
      'Internal error for spawn_agent_inline: Missing messages in state',
    )
  }
  if (!agentState) {
    throw new Error(
      'Internal error for spawn_agent_inline: Missing agentState in state',
    )
  }
  if (!localAgentTemplates) {
    throw new Error(
      'Internal error for spawn_agent_inline: Missing localAgentTemplates in state',
    )
  }

  const triggerSpawnAgentInline = async () => {
    const agentType = agentTypeStr as AgentTemplateType
    const agentTemplate = await getAgentTemplate(agentType, localAgentTemplates)

    if (!agentTemplate) {
      throw new Error(`Agent type ${agentTypeStr} not found.`)
    }

    if (!parentAgentTemplate.spawnableAgents.includes(agentType)) {
      throw new Error(
        `Agent type ${parentAgentTemplate.id} is not allowed to spawn child agent type ${agentType}.`,
      )
    }

    // Validate prompt and params against agent's schema
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
      const result = inputSchema.params.safeParse(agentParams)
      if (!result.success) {
        throw new Error(
          `Invalid params for agent ${agentType}: ${JSON.stringify(result.error.issues, null, 2)}`,
        )
      }
    }

    const agentId = generateCompactId()

    // Create child agent state that shares message history with parent
    const childAgentState: AgentState = {
      agentId,
      agentType,
      agentContext: agentState!.agentContext, // Inherit parent context directly
      subagents: [],
      messageHistory: getLatestState().messages, // Share the same message array
      stepsRemaining: 20, // MAX_AGENT_STEPS
      output: undefined,
      parentId: agentState!.agentId,
    }

    logger.debug(
      {
        agentTemplate,
        prompt,
        params: agentParams,
        agentId,
        parentId: childAgentState.parentId,
      },
      `Spawning agent inline — ${agentType} (${agentId})`,
    )

    // Import loopAgentSteps dynamically to avoid circular dependency
    const { loopAgentSteps } = await import('../../../run-agent-step')

    const result = await loopAgentSteps(ws, {
      userInputId: `${userInputId}-inline-${agentType}${agentId}`,
      prompt: prompt || '',
      params: agentParams,
      agentType: agentTemplate.id,
      agentState: childAgentState,
      fingerprintId,
      fileContext,
      localAgentTemplates,
      toolResults: [],
      userId,
      clientSessionId,
      onResponseChunk: (chunk: string | PrintModeEvent) => {
        // Child agent output is streamed directly to parent's output
        // No need for special handling since we share message history
      },
    })

    // Update parent's message history with child's final state
    // Since we share the same message array reference, this should already be updated
    let finalMessages = result.agentState?.messageHistory || state.messages

    // Expire messages with timeToLive: 'userPrompt' to clean up inline agent's temporary messages
    finalMessages = expireMessages(finalMessages, 'userPrompt')

    state.messages = finalMessages

    // Update parent agent state to reflect shared message history
    if (agentState && result.agentState) {
      agentState.messageHistory = finalMessages
    }

    return undefined
  }

  return {
    result: previousToolCallFinished.then(triggerSpawnAgentInline),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'spawn_agent_inline'>
