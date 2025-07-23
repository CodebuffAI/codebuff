import {
  endsAgentStepParam,
  renderToolResults,
  ToolName,
} from '@codebuff/common/constants/tools'
import { ToolResult } from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { generateCompactId } from '@codebuff/common/util/string'
import { WebSocket } from 'ws'
import z from 'zod/v4'
import { checkLiveUserInput } from '../live-user-inputs'
import { AgentTemplate } from '../templates/types'
import { logger } from '../util/logger'
import { asSystemMessage } from '../util/messages'
import { requestToolCall } from '../websockets/websocket-action'
import {
  ClientToolCall,
  CodebuffToolCall,
  codebuffToolDefs,
  CodebuffToolHandlerFunction,
  codebuffToolHandlers,
} from './constants'

export type ToolCallError = {
  toolName?: string
  args: Record<string, unknown>
  error: string
} & Pick<CodebuffToolCall, 'toolCallId'>

export function parseRawToolCall<T extends ToolName = ToolName>(rawToolCall: {
  toolName: T
  toolCallId: string
  args: Record<string, unknown>
}): CodebuffToolCall<T> | ToolCallError {
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

  const result = (
    codebuffToolDefs[validName].parameters satisfies z.ZodObject as z.ZodObject
  )
    .extend({
      [endsAgentStepParam]: z.literal(
        codebuffToolDefs[validName].endsAgentStep
      ),
    })
    .safeParse(processedParameters)

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

  delete result.data[endsAgentStepParam]
  return {
    toolName: validName,
    args: result.data,
    toolCallId: rawToolCall.toolCallId,
  } as CodebuffToolCall<T>
}

export interface ExecuteToolCallParams<T extends ToolName = ToolName> {
  toolName: T
  args: Record<string, string>
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
  } = options

  const toolCall: CodebuffToolCall<T> | ToolCallError = parseRawToolCall<T>({
    toolName,
    toolCallId: generateCompactId(),
    args,
  })
  if ('error' in toolCall) {
    toolResults.push({
      toolName,
      toolCallId: toolCall.toolCallId,
      result: toolCall.error,
    })
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
    state[key] = value
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
