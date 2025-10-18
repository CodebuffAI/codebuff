import {
  validateSpawnState,
  validateAndGetAgentTemplate,
  validateAgentInput,
  createAgentState,
  logAgentSpawn,
  executeSubagent,
} from './spawn-agent-utils'

import type { CodebuffToolHandlerFunction } from '@codebuff/agent-runtime/tools/handlers/handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { AgentState } from '@codebuff/common/types/session-state'

export type SendSubagentChunk = (data: {
  userInputId: string
  agentId: string
  agentType: string
  chunk: string
  prompt?: string
  forwardToPrompt?: boolean
}) => void

type ToolName = 'spawn_agents'
export const handleSpawnAgents = ((
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>

    userInputId: string
    writeToClient: (chunk: string | PrintModeEvent) => void

    getLatestState: () => { messages: Message[] }
    state: {
      fingerprintId?: string
      userId?: string
      agentTemplate?: AgentTemplate
      localAgentTemplates?: Record<string, AgentTemplate>
      sendSubagentChunk?: SendSubagentChunk
      messages?: Message[]
      agentState?: AgentState
      system?: string
    }
    logger: Logger
  } & ParamsExcluding<
    typeof validateAndGetAgentTemplate,
    'agentTypeStr' | 'parentAgentTemplate' | 'localAgentTemplates'
  > &
    ParamsExcluding<
      typeof executeSubagent,
      | 'userInputId'
      | 'prompt'
      | 'spawnParams'
      | 'agentTemplate'
      | 'parentAgentState'
      | 'agentState'
      | 'fingerprintId'
      | 'localAgentTemplates'
      | 'userId'
      | 'isOnlyChild'
      | 'parentSystemPrompt'
      | 'onResponseChunk'
    >,
): { result: Promise<CodebuffToolOutput<ToolName>>; state: {} } => {
  const {
    previousToolCallFinished,
    toolCall,

    userInputId,
    getLatestState,
    state,
    writeToClient,
  } = params
  const { agents } = toolCall.input
  const validatedState = validateSpawnState(state, 'spawn_agents')
  const { logger } = params
  const { sendSubagentChunk, system: parentSystemPrompt } = state

  if (!sendSubagentChunk) {
    throw new Error(
      'Internal error for spawn_agents: Missing sendSubagentChunk in state',
    )
  }

  const {
    fingerprintId,
    userId,
    agentTemplate: parentAgentTemplate,
    localAgentTemplates,
    agentState: parentAgentState,
  } = validatedState

  const triggerSpawnAgents = async () => {
    const results = await Promise.allSettled(
      agents.map(
        async ({ agent_type: agentTypeStr, prompt, params: spawnParams }) => {
          const { agentTemplate, agentType } =
            await validateAndGetAgentTemplate({
              ...params,
              agentTypeStr,
              parentAgentTemplate,
              localAgentTemplates,
            })

          validateAgentInput(agentTemplate, agentType, prompt, spawnParams)

          const subAgentState = createAgentState(
            agentType,
            agentTemplate,
            parentAgentState,
            getLatestState().messages,
            {},
          )

          logAgentSpawn({
            agentTemplate,
            agentType,
            agentId: subAgentState.agentId,
            parentId: subAgentState.parentId,
            prompt,
            spawnParams,
            logger,
          })

          const result = await executeSubagent({
            ...params,
            userInputId: `${userInputId}-${agentType}${subAgentState.agentId}`,
            prompt: prompt || '',
            spawnParams,
            agentTemplate,
            parentAgentState,
            agentState: subAgentState,
            fingerprintId,
            localAgentTemplates,
            userId,
            isOnlyChild: agents.length === 1,
            parentSystemPrompt,
            onResponseChunk: (chunk: string | PrintModeEvent) => {
              if (typeof chunk === 'string') {
                sendSubagentChunk({
                  userInputId,
                  agentId: subAgentState.agentId,
                  agentType,
                  chunk,
                  prompt,
                })
                return
              }

              if (chunk.type === 'text') {
                if (chunk.text) {
                  sendSubagentChunk({
                    userInputId,
                    agentId: subAgentState.agentId,
                    agentType,
                    chunk: chunk.text,
                    prompt,
                  })
                }
                return
              }

              // Add parentAgentId for proper nesting in UI
              const ensureParentAgentId = () => {
                if (
                  chunk.type === 'subagent_start' ||
                  chunk.type === 'subagent_finish'
                ) {
                  return (
                    chunk.parentAgentId ??
                    subAgentState.parentId ??
                    parentAgentState?.agentId
                  )
                }
                if (
                  chunk.type === 'tool_call' ||
                  chunk.type === 'tool_result'
                ) {
                  return (chunk as any).parentAgentId ?? subAgentState.agentId
                }
                return undefined
              }

              const parentAgentId = ensureParentAgentId()
              if (
                parentAgentId !== undefined &&
                (chunk.type === 'subagent_start' ||
                  chunk.type === 'subagent_finish' ||
                  chunk.type === 'tool_call' ||
                  chunk.type === 'tool_result')
              ) {
                writeToClient({ ...chunk, parentAgentId })
                return
              }

              const eventWithAgent = {
                ...chunk,
                agentId: subAgentState.agentId,
              }
              writeToClient(eventWithAgent)
            },
          })
          return { ...result, agentType, agentName: agentTemplate.displayName }
        },
      ),
    )

    const reports = await Promise.all(
      results.map(async (result, index) => {
        if (result.status === 'fulfilled') {
          const { output, agentType, agentName } = result.value
          return {
            agentName,
            agentType,
            value: output,
          }
        } else {
          const agentTypeStr = agents[index].agent_type
          return {
            agentType: agentTypeStr,
            agentName: agentTypeStr,
            value: { errorMessage: `Error spawning agent: ${result.reason}` },
          }
        }
      }),
    )

    // Aggregate costs from subagents
    results.forEach((result, index) => {
      const agentInfo = agents[index]
      let subAgentCredits = 0

      if (result.status === 'fulfilled') {
        subAgentCredits = result.value.agentState.creditsUsed || 0
        // Note (James): Try not to include frequent logs with narrow debugging value.
        // logger.debug(
        //   {
        //     parentAgentId: validatedState.agentState.agentId,
        //     subAgentType: agentInfo.agent_type,
        //     subAgentCredits,
        //   },
        //   'Aggregating successful subagent cost',
        // )
      } else if (result.reason?.agentState?.creditsUsed) {
        // Even failed agents may have incurred partial costs
        subAgentCredits = result.reason.agentState.creditsUsed || 0
        logger.debug(
          {
            parentAgentId: validatedState.agentState.agentId,
            subAgentType: agentInfo.agent_type,
            subAgentCredits,
          },
          'Aggregating failed subagent partial cost',
        )
      }

      if (subAgentCredits > 0) {
        validatedState.agentState.creditsUsed += subAgentCredits
        // Note (James): Try not to include frequent logs with narrow debugging value.
        // logger.debug(
        //   {
        //     parentAgentId: validatedState.agentState.agentId,
        //     addedCredits: subAgentCredits,
        //     totalCredits: validatedState.agentState.creditsUsed,
        //   },
        //   'Updated parent agent total cost',
        // )
      }
    })

    return reports
  }
  return {
    result: (async () => {
      await previousToolCallFinished
      return [
        {
          type: 'json',
          value: await triggerSpawnAgents(),
        },
      ]
    })(),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>
