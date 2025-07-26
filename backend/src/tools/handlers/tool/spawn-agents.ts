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

import { generateCompactId } from '@codebuff/common/util/string'
import { getAllAgentTemplates } from '../../../templates/agent-registry'
import { logger } from '../../../util/logger'

export type SendSubagentChunk = (data: {
  userInputId: string
  agentId: string
  agentType: string
  chunk: string
  prompt?: string
}) => void

export const handleSpawnAgents = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'spawn_agents'>

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
      'Internal error for spawn_agents: Missing WebSocket in state'
    )
  }
  if (!fingerprintId) {
    throw new Error(
      'Internal error for spawn_agents: Missing fingerprintId in state'
    )
  }
  if (!parentAgentTemplate) {
    throw new Error(
      'Internal error for spawn_agents: Missing agentTemplate in state'
    )
  }
  if (!sendSubagentChunk) {
    throw new Error(
      'Internal error for spawn_agents: Missing sendSubagentChunk in state'
    )
  }
  if (!messages) {
    throw new Error(
      'Internal error for spawn_agents: Missing messages in state'
    )
  }
  if (!agentState) {
    throw new Error(
      'Internal error for spawn_agents: Missing agentState in state'
    )
  }

  const triggerSpawnAgents = async () => {
    const conversationHistoryMessage: CoreMessage = {
      role: 'user',
      content: `For context, the following is the conversation history between the user and an assistant:\n\n${JSON.stringify(
        getLatestState().messages,
        null,
        2
      )}`,
    }
    // Initialize registry and get all templates
    const { agentRegistry } = await getAllAgentTemplates({
      fileContext,
    })
    logger.debug(
      {
        availableAgentCount: Object.keys(agentRegistry).length,
        requestedAgents: agents.map((a) => a.agent_type),
      },
      'Agent registry initialized for spawning'
    )
    const results = await Promise.allSettled(
      agents.map(async ({ agent_type: agentTypeStr, prompt, params }) => {
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

        const agentId = generateCompactId()
        const subAgentMessages: CoreMessage[] = []
        if (agentTemplate.includeMessageHistory) {
          subAgentMessages.push(conversationHistoryMessage)
        }

        const subAgentState: AgentState = {
          agentId,
          agentType,
          agentContext: {},
          subagents: [],
          messageHistory: subAgentMessages,
          stepsRemaining: 20, // MAX_AGENT_STEPS
          output: undefined,
          parentId: agentState!.agentId,
        }

        logger.debug(
          {
            agentTemplate,
            prompt,
            params,
            agentId,
            parentId: subAgentState.parentId,
          },
          `Spawning agent — ${agentType} (${agentId})`
        )

        // Import loopAgentSteps dynamically to avoid circular dependency
        const { loopAgentSteps } = await import('../../../run-agent-step')

        const result = await loopAgentSteps(ws, {
          userInputId: `${userInputId}-${agentType}${agentId}`,
          prompt: prompt || '',
          params,
          agentType: agentTemplate.id,
          agentState: subAgentState,
          fingerprintId,
          fileContext,
          agentRegistry,
          toolResults: [],
          userId,
          clientSessionId,
          onResponseChunk: (chunk: string) => {
            // Send subagent streaming chunks to client
            sendSubagentChunk({
              userInputId,
              agentId,
              agentType,
              chunk,
              prompt,
            })
          },
        })

        return {
          ...result,
          agentType,
          agentName: agentRegistry[agentType] || agentTemplate.name,
        }
      })
    )

    const reports = results.map((result, index) => {
      const agentInfo = agents[index]
      const agentTypeStr = agentInfo.agent_type

      if (result.status === 'fulfilled') {
        const { agentState, agentName } = result.value
        const agentTemplate = agentRegistry[agentState.agentType!]
        let report = ''

        if (agentTemplate.outputMode === 'json') {
          report = JSON.stringify(result.value.agentState.output, null, 2)
        } else if (agentTemplate.outputMode === 'last_message') {
          const { agentState } = result.value
          const assistantMessages = agentState.messageHistory.filter(
            (message) => message.role === 'assistant'
          )
          const lastAssistantMessage =
            assistantMessages[assistantMessages.length - 1]
          if (!lastAssistantMessage) {
            report = 'No response from agent'
          } else if (typeof lastAssistantMessage.content === 'string') {
            report = lastAssistantMessage.content
          } else {
            report = JSON.stringify(lastAssistantMessage.content, null, 2)
          }
        } else if (agentTemplate.outputMode === 'all_messages') {
          const { agentState } = result.value
          // Remove the first message, which includes the previous conversation history.
          const agentMessages = agentState.messageHistory.slice(1)
          report = `Agent messages:\n\n${JSON.stringify(agentMessages, null, 2)}`
        } else {
          throw new Error(
            `Unknown output mode: ${'outputMode' in agentTemplate ? agentTemplate.outputMode : 'undefined'}`
          )
        }

        return `**${agentName}:**\n${report}`
      } else {
        return `**Agent (${agentTypeStr}):**\nError spawning agent: ${result.reason}`
      }
    })
    return reports
      .map((report: string) => `<agent_report>${report}</agent_report>`)
      .join('\n')
  }

  return {
    result: previousToolCallFinished.then(triggerSpawnAgents),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'spawn_agents'>
