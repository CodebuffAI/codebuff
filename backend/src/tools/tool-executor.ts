import type { ToolName } from '@codebuff/common/constants/tools'
import type { ToolResult } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'
import type { AgentTemplate } from '../templates/types'
import type { ClientToolCall, CodebuffToolCall } from './constants'
import type { CodebuffToolHandlerFunction } from './handlers/handler-function-type'

import {
  endsAgentStepParam,
  renderToolResults,
} from '@codebuff/common/constants/tools'
import { generateCompactId } from '@codebuff/common/util/string'
import z from 'zod/v4'
import { checkLiveUserInput } from '../live-user-inputs'
import { logger } from '../util/logger'
import { asSystemMessage } from '../util/messages'
import { requestToolCall } from '../websockets/websocket-action'
import { codebuffToolDefs } from './definitions/list'
import { codebuffToolHandlers } from './handlers/list'

export type ToolCallError = {
  toolName?: string
  args: Record<string, unknown>
  error: string
} & Pick<CodebuffToolCall, 'toolCallId'>

export function parseRawToolCall<T extends ToolName = ToolName>(
  rawToolCall: {
    toolName: T
    toolCallId: string
    args: Record<string, unknown>
  },
  autoInsertEndStepParam: boolean = false
): CodebuffToolCall<T> | ToolCallError {
  const toolName = rawToolCall.toolName

  if (!(toolName in codebuffToolDefs)) {
    return {
      toolName,
      toolCallId: rawToolCall.toolCallId,
      args: rawToolCall.args,
      error: `Tool ${toolName} not found`,
    }
  }
  const validName = toolName as T

  const processedParameters: Record<string, any> = {}
  for (const [param, val] of Object.entries(rawToolCall.args)) {
    processedParameters[param] = val
  }

  // Add the required codebuff_end_step parameter with the correct value for this tool if requested
  if (autoInsertEndStepParam) {
    processedParameters[endsAgentStepParam] =
      codebuffToolDefs[validName].endsAgentStep
  }

  const paramsSchema = codebuffToolDefs[validName].endsAgentStep
    ? (
        codebuffToolDefs[validName]
          .parameters satisfies z.ZodObject as z.ZodObject
      ).extend({
        [endsAgentStepParam]: z.literal(
          codebuffToolDefs[validName].endsAgentStep
        ),
      })
    : codebuffToolDefs[validName].parameters
  const result = paramsSchema.safeParse(processedParameters)

  if (!result.success) {
    return {
      toolName: validName,
      toolCallId: rawToolCall.toolCallId,
      args: rawToolCall.args,
      error: `Invalid parameters for ${validName}: ${JSON.stringify(
        result.error.issues,
        null,
        2
      )}`,
    }
  }

  if (endsAgentStepParam in result.data) {
    delete result.data[endsAgentStepParam]
  }

  return {
    toolName: validName,
    args: result.data,
    toolCallId: rawToolCall.toolCallId,
  } as CodebuffToolCall<T>
}

export interface ExecuteToolCallParams<T extends ToolName = ToolName> {
  toolName: T
  args: Record<string, unknown>
  toolCalls: CodebuffToolCall[]
  toolResults: ToolResult[]
  previousToolCallFinished: Promise<void>
  ws: WebSocket
  agentTemplate: AgentTemplate
  fileContext: ProjectFileContext
  agentStepId: string
  clientSessionId: string
  userInputId: string
  fullResponse: string
  onResponseChunk: (chunk: string) => void
  state: Record<string, any>
  userId: string | undefined
  autoInsertEndStepParam?: boolean
}

export function executeToolCall<T extends ToolName>(
  options: ExecuteToolCallParams<T>
): Promise<void> {
  const {
    toolName,
    args,
    toolCalls,
    toolResults,
    previousToolCallFinished,
    ws,
    agentTemplate,
    fileContext,
    agentStepId,
    clientSessionId,
    userInputId,
    fullResponse,
    onResponseChunk,
    state,
    userId,
    autoInsertEndStepParam = false,
  } = options

  const toolCall: CodebuffToolCall<T> | ToolCallError = parseRawToolCall<T>(
    {
      toolName,
      toolCallId: generateCompactId(),
      args,
    },
    autoInsertEndStepParam
  )
  if ('error' in toolCall) {
    toolResults.push({
      toolName,
      toolCallId: toolCall.toolCallId,
      result: toolCall.error,
    })
    logger.debug(
      { toolCall, error: toolCall.error },
      `${toolName} error: ${toolCall.error}`
    )
    return previousToolCallFinished
  }

  logger.debug(
    { toolCall },
    `${toolName} (${toolCall.toolCallId}) tool call detected in stream`
  )
  toolCalls.push(toolCall)

  // Filter out restricted tools in ask mode unless exporting summary
  if (!agentTemplate.toolNames.includes(toolCall.toolName)) {
    toolResults.push({
      toolName,
      toolCallId: toolCall.toolCallId,
      result: `Tool \`${toolName}\` is not currently available. Make sure to only use tools listed in the system instructions.`,
    })
    return previousToolCallFinished
  }

  const { result: toolResultPromise, state: stateUpdate } = (
    codebuffToolHandlers[toolName] as CodebuffToolHandlerFunction<T>
  )({
    previousToolCallFinished,
    fileContext,
    agentStepId,
    clientSessionId,
    userInputId,
    fullResponse,
    writeToClient: onResponseChunk,
    requestClientToolCall: async (clientToolCall: ClientToolCall<T>) => {
      if (!checkLiveUserInput(userId, userInputId, clientSessionId)) {
        return ''
      }

      const clientToolResult = await requestToolCall(
        ws,
        userInputId,
        clientToolCall.toolName,
        clientToolCall.args
      )
      return (
        clientToolResult.error ??
        (typeof clientToolResult.result === 'string'
          ? clientToolResult.result
          : JSON.stringify(clientToolResult.result))
      )
    },
    toolCall,
    getLatestState: () => state,
    state,
  })

  for (const [key, value] of Object.entries(stateUpdate ?? {})) {
    if (key === 'agentState' && typeof value === 'object' && value !== null) {
      // Replace the agentState reference to ensure all updates are captured
      state.agentState = value
    } else {
      state[key] = value
    }
  }

  return toolResultPromise.then((result) => {
    const toolResult = {
      toolName,
      toolCallId: toolCall.toolCallId,
      result: result as NonNullable<typeof result>,
    }
    logger.debug(
      { toolResult },
      `${toolName} (${toolResult.toolCallId}) tool result for tool`
    )
    if (result === undefined) {
      return
    }

    toolResults.push(toolResult)

    state.messages.push({
      role: 'user' as const,
      content: asSystemMessage(renderToolResults([toolResult])),
    })
  })
}
