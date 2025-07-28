import type { CodebuffMessage } from '@codebuff/common/types/message'
import type {
  AgentState,
  AgentTemplateType,
} from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { CoreMessage } from 'ai'
import type { WebSocket } from 'ws'
import type { AgentTemplate } from '../../../templates/types'
import type { CodebuffToolCall } from '../../constants'
import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { SendSubagentChunk } from './spawn-agents'

import { ASYNC_AGENTS_ENABLED } from '@codebuff/common/constants'
import { PrintModeObject } from '@codebuff/common/types/print-mode'
import { generateCompactId } from '@codebuff/common/util/string'
import { asyncAgentManager } from '../../../async-agent-manager'
import { getAllAgentTemplates } from '../../../templates/agent-registry'
import { logger } from '../../../util/logger'
import { handleSpawnAgents } from './spawn-agents'
export const handleSpawnAgentsAsync = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'spawn_agents_async'>

  fileContext: ProjectFileContext
  clientSessionId: string
  userInputId: string

  getLatestState: () => { messages: CodebuffMessage[] }
  state: {
    ws?: WebSocket
    fingerprintId?: string
    userId?: string
    agentTemplate?: AgentTemplate
    sendSubagentChunk?: SendSubagentChunk
    messages?: CodebuffMessage[]
    agentState?: AgentState
  }
}): { result: Promise<string>; state: {} } => {
  if (!ASYNC_AGENTS_ENABLED) {
    return handleSpawnAgents({
      ...params,
      toolCall: {
        ...params.toolCall,
        toolName: 'spawn_agents',
      },
    })
  }

  const {
    previousToolCallFinished,
    toolCall,

    fileContext,
    clientSessionId,
    userInputId,
    getLatestState,
    state,
  } = params
  const { agents } = toolCall.args
  const {
    ws,
    fingerprintId,
    userId,
    agentTemplate: parentAgentTemplate,
    sendSubagentChunk,
    messages,
  } = state
  let { agentState } = state

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
  if (!messages) {
    throw new Error(
      'Internal error for spawn_agents_async: Missing messages in state'
    )
  }
  if (!agentState) {
    throw new Error(
      'Internal error for spawn_agents: Missing agentState in state'
    )
  }
  if (!sendSubagentChunk) {
    throw new Error(
      'Internal error for spawn_agents_async: Missing sendSubagentChunk in state'
    )
  }

  const triggerSpawnAgentsAsync = async () => {
    // Initialize registry and get all templates
    const { agentRegistry } = await getAllAgentTemplates({ fileContext })

    const results: Array<{
      agentType: string
      success: boolean
      agentId?: string
      error?: string
    }> = []

    const conversationHistoryMessage: CoreMessage = {
      role: 'user',
      content: `For context, the following is the conversation history between the user and an assistant:\n\n${JSON.stringify(
        getLatestState().messages,
        null,
        2
      )}`,
    }

    // Validate and spawn agents asynchronously
    for (const { agent_type: agentTypeStr, prompt, params } of agents) {
      try {
        if (!(agentTypeStr in agentRegistry)) {
          throw new Error(`Agent type ${agentTypeStr} not found.`)
        }
        const agentType = agentTypeStr as AgentTemplateType
        const agentTemplate = agentRegistry[agentType]

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
        agentState = {
          agentId,
          agentType,
          agentContext: {},
          subagents: [],
          messageHistory: subAgentMessages,
          stepsRemaining: 20, // MAX_AGENT_STEPS
          output: undefined,
          // Add parent ID to agent state for communication
          parentId: agentState!.agentId,
        }

        // Start the agent asynchronously
        const agentPromise = (async () => {
          try {
            // Import loopAgentSteps dynamically to avoid circular dependency
            const { loopAgentSteps } = await import('../../../run-agent-step')

            const result = await loopAgentSteps(ws, {
              userInputId: `${userInputId}-async-${agentType}-${agentId}`,
              prompt: prompt || '',
              params,
              agentType: agentTemplate.id,
              agentState,
              fingerprintId: fingerprintId!,
              fileContext,
              agentRegistry,
              toolResults: [],
              userId,
              clientSessionId,
              onResponseChunk: (chunk: string | PrintModeObject) => {
                if (typeof chunk !== 'string') {
                  return
                }
                sendSubagentChunk({
                  userInputId,
                  agentId,
                  agentType,
                  chunk,
                  prompt,
                })
              },
            })

            // Send completion message to parent if agent has appropriate output mode
            if (agentState.parentId) {
              const { outputMode } = agentTemplate
              if (
                outputMode === 'last_message' ||
                outputMode === 'all_messages'
              ) {
                try {
                  let messageContent = ''

                  if (outputMode === 'last_message') {
                    const assistantMessages =
                      result.agentState.messageHistory.filter(
                        (message) => message.role === 'assistant'
                      )
                    const lastAssistantMessage =
                      assistantMessages[assistantMessages.length - 1]
                    if (lastAssistantMessage) {
                      if (typeof lastAssistantMessage.content === 'string') {
                        messageContent = lastAssistantMessage.content
                      } else {
                        messageContent = JSON.stringify(
                          lastAssistantMessage.content,
                          null,
                          2
                        )
                      }
                    } else {
                      messageContent = 'No response from agent'
                    }
                  } else if (outputMode === 'all_messages') {
                    // Remove the first message, which includes the previous conversation history
                    const agentMessages =
                      result.agentState.messageHistory.slice(1)
                    messageContent = `Agent messages:\n\n${JSON.stringify(agentMessages, null, 2)}`
                  }

                  // Send the message to the parent agent
                  const { asyncAgentManager } = await import(
                    '../../../async-agent-manager'
                  )
                  asyncAgentManager.sendMessage({
                    fromAgentId: agentId,
                    toAgentId: agentState.parentId,
                    prompt: `Agent ${agentType} completed with output:\n\n${messageContent}`,
                    params: {
                      agentType,
                      agentId,
                      outputMode,
                      completed: true,
                    },
                    timestamp: new Date(),
                  })

                  logger.debug(
                    {
                      agentId,
                      parentId: agentState.parentId,
                      agentType,
                      outputMode,
                      messageContent,
                    },
                    'Sent completion message to parent agent'
                  )
                } catch (error) {
                  logger.error(
                    {
                      agentId,
                      parentId: agentState.parentId,
                      error,
                    },
                    'Failed to send completion message to parent agent'
                  )
                }
              }
            }

            return result
          } catch (error) {
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
