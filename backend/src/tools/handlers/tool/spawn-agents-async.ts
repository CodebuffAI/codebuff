import { ASYNC_AGENTS_ENABLED } from '@codebuff/common/constants'

import {
  validateSpawnState,
  validateAndGetAgentTemplate,
  validateAgentInput,
  createConversationHistoryMessage,
  createAgentState,
  logAgentSpawn,
  executeAgent,
} from './spawn-agent-utils'
import { handleSpawnAgents } from './spawn-agents'
import { asyncAgentManager } from '../../../async-agent-manager'
import { logger } from '../../../util/logger'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { SendSubagentChunk } from './spawn-agents'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { AgentState } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'

type ToolName = 'spawn_agents_async'
export const handleSpawnAgentsAsync = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>

  fileContext: ProjectFileContext
  clientSessionId: string
  userInputId: string
  writeToClient: (chunk: string | PrintModeEvent) => void

  getLatestState: () => { messages: Message[] }
  state: {
    ws?: WebSocket
    fingerprintId?: string
    userId?: string
    agentTemplate?: AgentTemplate
    localAgentTemplates?: Record<string, AgentTemplate>
    sendSubagentChunk?: SendSubagentChunk
    messages?: Message[]
    agentState?: AgentState
  }
}): { result: Promise<CodebuffToolOutput<ToolName>>; state: {} } => {
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
  const { agents } = toolCall.input
  const {
    ws,
    fingerprintId,
    userId,
    agentTemplate: parentAgentTemplate,
    localAgentTemplates,
    agentState,
  } = validateSpawnState(state, 'spawn_agents_async')
  const { sendSubagentChunk } = state

  if (!sendSubagentChunk) {
    throw new Error(
      'Internal error for spawn_agents_async: Missing sendSubagentChunk in state',
    )
  }

  const triggerSpawnAgentsAsync: () => Promise<
    CodebuffToolOutput<ToolName>[0]['value']
  > = async () => {
    const results: CodebuffToolOutput<ToolName>[0]['value'] = []

    const conversationHistoryMessage = createConversationHistoryMessage(
      getLatestState().messages,
    )

    // Validate and spawn agents asynchronously
    for (const { agent_type: agentTypeStr, prompt, params } of agents) {
      try {
        const { agentTemplate, agentType } = await validateAndGetAgentTemplate(
          agentTypeStr,
          parentAgentTemplate,
          localAgentTemplates,
        )

        validateAgentInput(agentTemplate, agentType, prompt, params)

        const subAgentMessages: Message[] = []
        if (agentTemplate.includeMessageHistory) {
          subAgentMessages.push(conversationHistoryMessage)
        }

        const asyncAgentState = createAgentState(
          agentType,
          agentState,
          subAgentMessages,
        )

        logAgentSpawn(
          agentTemplate,
          agentType,
          asyncAgentState.agentId,
          asyncAgentState.parentId,
          prompt,
          params,
        )

        // Start the agent asynchronously
        const agentPromise = (async () => {
          try {
            const result = await executeAgent({
              ws,
              userInputId: `${userInputId}-async-${agentType}-${asyncAgentState.agentId}`,
              prompt: prompt || '',
              params,
              agentTemplate,
              agentState: asyncAgentState,
              fingerprintId,
              fileContext,
              localAgentTemplates,
              userId,
              clientSessionId,
              onResponseChunk: (chunk: string | PrintModeEvent) => {
                if (typeof chunk !== 'string') {
                  return
                }
                sendSubagentChunk({
                  userInputId,
                  agentId: asyncAgentState.agentId,
                  agentType,
                  chunk,
                  prompt,
                })
              },
            })

            // Send completion message to parent if agent has appropriate output mode
            if (asyncAgentState.parentId) {
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
                        (message) => message.role === 'assistant',
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
                          2,
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
                    fromAgentId: asyncAgentState.agentId,
                    toAgentId: asyncAgentState.parentId,
                    prompt: `Agent ${agentType} completed with output:\n\n${messageContent}`,
                    params: {
                      agentType,
                      agentId: asyncAgentState.agentId,
                      outputMode,
                      completed: true,
                    },
                    timestamp: new Date(),
                  })

                  logger.debug(
                    {
                      agentId: asyncAgentState.agentId,
                      parentId: asyncAgentState.parentId,
                      agentType,
                      outputMode,
                      messageContent,
                    },
                    'Sent completion message to parent agent',
                  )
                } catch (error) {
                  logger.error(
                    {
                      agentId: asyncAgentState.agentId,
                      parentId: asyncAgentState.parentId,
                      error,
                    },
                    'Failed to send completion message to parent agent',
                  )
                }
              }
            }

            return result
          } catch (error) {
            logger.error(
              { agentId: asyncAgentState.agentId, error },
              'Async agent failed',
            )
            throw error
          }
        })()

        // Store the promise in the agent info
        const agentInfo = asyncAgentManager.getAgent(asyncAgentState.agentId)
        if (agentInfo) {
          agentInfo.promise = agentPromise
        }

        results.push({
          agentType: agentTypeStr,
          success: true,
          agentId: asyncAgentState.agentId,
        })
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        results.push({
          agentType: agentTypeStr,
          success: false,
          errorMessage,
        })
        logger.error(
          { agentType: agentTypeStr, error },
          'Failed to spawn async agent',
        )
        // Continue with other agents even if one fails
      }
    }

    return results
  }

  return {
    result: (async () => {
      await previousToolCallFinished
      return [
        {
          type: 'json',
          value: await triggerSpawnAgentsAsync(),
        },
      ]
    })(),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>
