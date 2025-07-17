import { CodebuffMessage } from '@codebuff/common/types/message'
import {
  AgentState,
  AgentTemplateType,
} from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { generateCompactId } from '@codebuff/common/util/string'
import { CoreMessage } from 'ai'
import { WebSocket } from 'ws'
import { asyncAgentManager } from '../../async-agent-manager'
import { agentRegistry } from '../../templates/agent-registry'
import { AgentTemplate } from '../../templates/types'
import { logger } from '../../util/logger'
import { CodebuffToolCall, CodebuffToolHandlerFunction } from '../constants'

export const handleSpawnAgentsAsync = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'spawn_agents_async'>

  fileContext: ProjectFileContext
  clientSessionId: string
  userInputId: string

  state: {
    ws?: WebSocket
    fingerprintId?: string
    userId?: string
    agentTemplate?: AgentTemplate
    mutableState?: {
      messages: CodebuffMessage[]
      agentState: AgentState
    }
  }
}): { result: Promise<string>; state: {} } => {
  const {
    previousToolCallFinished,
    toolCall,

    fileContext,
    clientSessionId,
    userInputId,
    state,
  } = params
  const { agents } = toolCall.args
  const {
    ws,
    fingerprintId,
    userId,
    agentTemplate: parentAgentTemplate,
  } = state
  const mutableState = state.mutableState

  if (!ws) {
    throw new Error(
      'Internal error for spawn_agents_async: Missing WebSocket in state'
    )
  }
  if (!fingerprintId) {
    throw new Error(
      'Internal error for spawn_agents_async: Missing fingerprintId in state'
    )
  }
  if (!parentAgentTemplate) {
    throw new Error(
      'Internal error for spawn_agents_async: Missing agentTemplate in state'
    )
  }
  if (!mutableState?.messages || !mutableState?.agentState) {
    throw new Error(
      'Internal error for spawn_agents_async: Missing messages or agentState in state'
    )
  }

  // Initialize registry and get all templates
  agentRegistry.initialize(fileContext)
  const allTemplates = agentRegistry.getAllTemplates()

  const conversationHistoryMessage: CoreMessage = {
    role: 'user',
    content: `For context, the following is the conversation history between the user and an assistant:\n\n${JSON.stringify(
      mutableState.messages,
      null,
      2
    )}`,
  }

  const triggerSpawnAgentsAsync = async () => {
    const results: Array<{
      agentType: string
      success: boolean
      agentId?: string
      error?: string
    }> = []

    // Validate and spawn agents asynchronously
    for (const { agent_type: agentTypeStr, prompt, params } of agents) {
      try {
        if (!(agentTypeStr in allTemplates)) {
          throw new Error(`Agent type ${agentTypeStr} not found.`)
        }
        const agentType = agentTypeStr as AgentTemplateType
        const agentTemplate = allTemplates[agentType]

        if (!parentAgentTemplate.spawnableAgents.includes(agentType)) {
          throw new Error(
            `Agent type ${parentAgentTemplate.id} is not allowed to spawn child agent type ${agentType}.`
          )
        }

        // Validate prompt and params against agent's schema
        const { promptSchema } = agentTemplate

        // Validate prompt requirement
        if (promptSchema.prompt) {
          const result = promptSchema.prompt.safeParse(prompt)
          if (!result.success) {
            throw new Error(
              `Invalid prompt for agent ${agentType}: ${JSON.stringify(result.error.issues, null, 2)}`
            )
          }
        }

        // Validate params if schema exists
        if (promptSchema.params) {
          const result = promptSchema.params.safeParse(params)
          if (!result.success) {
            throw new Error(
              `Invalid params for agent ${agentType}: ${JSON.stringify(result.error.issues, null, 2)}`
            )
          }
        }

        logger.debug(
          { agentTemplate, prompt, params },
          `Spawning async agent — ${agentType}`
        )

        const subAgentMessages: CoreMessage[] = []
        if (agentTemplate.includeMessageHistory) {
          subAgentMessages.push(conversationHistoryMessage)
        }

        const agentId = generateCompactId()
        const agentState: AgentState = {
          agentId,
          agentType,
          agentContext: {},
          subagents: [],
          messageHistory: subAgentMessages,
          stepsRemaining: 20, // MAX_AGENT_STEPS
          report: {},
          // Add parent ID to agent state for communication
          parentId: mutableState.agentState.agentId,
        }

        // Start the agent asynchronously
        const agentPromise = (async () => {
          try {
            // Import loopAgentSteps dynamically to avoid circular dependency
            const { loopAgentSteps } = await import('../../run-agent-step')
            const result = await loopAgentSteps(ws, {
              userInputId: `${userInputId}-async-${agentType}-${agentId}`,
              prompt: prompt || '',
              params,
              agentType: agentTemplate.id,
              agentState,
              fingerprintId: fingerprintId!,
              fileContext,
              toolResults: [],
              userId,
              clientSessionId,
              onResponseChunk: () => {}, // Async agents don't stream to parent
            })

            asyncAgentManager.updateAgentStatus(agentId, 'completed')
            return result
          } catch (error) {
            asyncAgentManager.updateAgentStatus(agentId, 'failed')
            logger.error({ agentId, error }, 'Async agent failed')
            throw error
          }
        })()

        // Store the promise in the agent info
        const agentInfo = asyncAgentManager.getAgent(agentId)
        if (agentInfo) {
          agentInfo.promise = agentPromise
        }

        results.push({ agentType: agentTypeStr, success: true, agentId })
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        results.push({
          agentType: agentTypeStr,
          success: false,
          error: errorMessage,
        })
        logger.error(
          { agentType: agentTypeStr, error },
          'Failed to spawn async agent'
        )
        // Continue with other agents even if one fails
      }
    }

    const successful = results.filter((r) => r.success)

    let result = `Agent spawn results (${successful.length}/${results.length} successful):\n`

    results.forEach(({ agentType, success, agentId, error }) => {
      if (success) {
        result += `✓ ${agentType}: spawned (${agentId})\n`
      } else {
        result += `✗ ${agentType}: failed - ${error}\n`
      }
    })

    return result.trim()
  }

  return {
    result: previousToolCallFinished.then(triggerSpawnAgentsAsync),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'spawn_agents_async'>
