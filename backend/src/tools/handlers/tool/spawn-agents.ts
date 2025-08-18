import {
  validateSpawnState,
  validateAndGetAgentTemplate,
  validateAgentInput,
  createConversationHistoryMessage,
  createAgentState,
  logAgentSpawn,
  executeAgent,
  formatAgentResult,
  formatAgentError,
} from './spawn-agent-utils'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { CodebuffMessage } from '@codebuff/common/types/message'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  AgentState,
  AgentTemplateType,
} from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'

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
    localAgentTemplates?: Record<string, AgentTemplate>
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
  const { agents } = toolCall.input
  const validatedState = validateSpawnState(state, 'spawn_agents')
  const { sendSubagentChunk } = state

  if (!sendSubagentChunk) {
    throw new Error(
      'Internal error for spawn_agents: Missing sendSubagentChunk in state',
    )
  }

  const {
    ws,
    fingerprintId,
    userId,
    agentTemplate: parentAgentTemplate,
    localAgentTemplates,
    messages,
    agentState,
  } = validatedState

  const triggerSpawnAgents = async () => {
    const conversationHistoryMessage = createConversationHistoryMessage(
      getLatestState().messages,
    )

    const results = await Promise.allSettled(
      agents.map(async ({ agent_type: agentTypeStr, prompt, params }) => {
        const { agentTemplate, agentType } = await validateAndGetAgentTemplate(
          agentTypeStr,
          parentAgentTemplate,
          localAgentTemplates,
        )

        validateAgentInput(agentTemplate, agentType, prompt, params)

        const subAgentMessages: CodebuffMessage[] = []
        if (agentTemplate.includeMessageHistory) {
          subAgentMessages.push(conversationHistoryMessage)
        }

        const subAgentState = createAgentState(
          agentType,
          agentState,
          subAgentMessages,
        )

        logAgentSpawn(
          agentTemplate,
          agentType,
          subAgentState.agentId,
          subAgentState.parentId,
          prompt,
          params,
        )

        const result = await executeAgent({
          ws,
          userInputId: `${userInputId}-${agentType}${subAgentState.agentId}`,
          prompt: prompt || '',
          params,
          agentTemplate,
          agentState: subAgentState,
          fingerprintId,
          fileContext,
          localAgentTemplates,
          userId,
          clientSessionId,
          onResponseChunk: (chunk: string | PrintModeEvent) => {
            if (typeof chunk !== 'string') {
              return
            }
            // Send subagent streaming chunks to client
            sendSubagentChunk({
              userInputId,
              agentId: subAgentState.agentId,
              agentType,
              chunk,
              prompt,
            })
          },
        })

        return {
          ...result,
          agentType,
          agentName: agentTemplate.displayName,
        }
      }),
    )

    const reports = await Promise.all(
      results.map(async (result, index) => {
        const agentInfo = agents[index]
        const agentTypeStr = agentInfo.agent_type

        if (result.status === 'fulfilled') {
          const { agentState } = result.value
          const { agentTemplate } = await validateAndGetAgentTemplate(
            agentState.agentType!,
            parentAgentTemplate,
            localAgentTemplates,
          )
          return await formatAgentResult(
            result.value,
            agentTemplate,
            agentTypeStr,
          )
        } else {
          return formatAgentError(agentTypeStr, result.reason)
        }
      }),
    )
    return reports
      .map((report: string) => `<agent_report>${report}</agent_report>`)
      .join('\n')
  }

  return {
    result: previousToolCallFinished.then(triggerSpawnAgents),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'spawn_agents'>
