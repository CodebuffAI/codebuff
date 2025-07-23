import {
  endsAgentStepParam,
  renderToolResults,
  ToolName,
  toolNames,
} from '@codebuff/common/constants/tools'
import { CodebuffMessage } from '@codebuff/common/types/message'
import {
  AgentState,
  Subgoal,
  ToolResult,
} from '@codebuff/common/types/session-state'
import { buildArray } from '@codebuff/common/util/array'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { generateCompactId } from '@codebuff/common/util/string'
import { ToolCallPart } from 'ai'
import { WebSocket } from 'ws'
import z from 'zod/v4'
import { checkLiveUserInput } from '../live-user-inputs'
import { AgentTemplate } from '../templates/types'
import { toolParams } from '../tools'
import { logger } from '../util/logger'
import { asSystemMessage, expireMessages } from '../util/messages'
import { requestToolCall } from '../websockets/websocket-action'
import { processStreamWithTags } from '../xml-stream-parser'
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
} & Omit<ToolCallPart, 'type'>

function parseRawToolCall<T extends ToolName = ToolName>(
  rawToolCall: ToolCallPart & {
    toolName: T
    args: Record<string, unknown>
  }
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
      error: `Invalid parameters for ${validName}: ${JSON.stringify(result.error.issues, null, 2)}`,
    }
  }

  delete result.data[endsAgentStepParam]
  return {
    toolName: validName,
    args: result.data,
    toolCallId: rawToolCall.toolCallId,
  } as CodebuffToolCall<T>
}

export async function processStreamWithTools<T extends string>(options: {
  stream: AsyncGenerator<T> | ReadableStream<T>
  ws: WebSocket
  agentStepId: string
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined
  repoId: string | undefined
  agentTemplate: AgentTemplate
  fileContext: ProjectFileContext
  messages: CodebuffMessage[]
  agentState: AgentState
  agentContext: Record<string, Subgoal>
  onResponseChunk: (chunk: string) => void
  fullResponse: string
}) {
  const {
    stream,
    ws,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    repoId,
    agentTemplate,
    fileContext,
    agentContext,
    agentState,
    onResponseChunk,
  } = options
  let fullResponse = options.fullResponse

  const messages = [...options.messages]

  const toolResults: ToolResult[] = []
  const toolCalls: CodebuffToolCall[] = []
  const { promise: streamDonePromise, resolve: resolveStreamDonePromise } =
    Promise.withResolvers<void>()
  let previousToolCallFinished = streamDonePromise
  const state: Record<string, any> = {
    ws,
    fingerprintId,
    userId,
    repoId,
    agentTemplate,
    agentState,
    agentContext,
    messages,
  }

  function toolCallback<T extends ToolName>(
    toolName: T
  ): {
    params: string[]
    onTagStart: () => void
    onTagEnd: (
      name: string,
      parameters: Record<string, string>
    ) => Promise<void>
  } {
    return {
      params: toolParams[toolName],
      onTagStart: () => {},
      onTagEnd: async (_: string, args: Record<string, string>) => {
        const toolCall: CodebuffToolCall<T> | ToolCallError =
          parseRawToolCall<T>({
            type: 'tool-call',
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
          return
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
          return
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
        previousToolCallFinished = toolResultPromise.then((result) => {
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
      },
    }
  }

  const streamWithTags = processStreamWithTags(
    stream,
    Object.fromEntries(
      toolNames.map((toolName) => [toolName, toolCallback(toolName)])
    ),
    (toolName, error) => {
      toolResults.push({
        toolName,
        toolCallId: generateCompactId(),
        result: error,
      })
    }
  )

  for await (const chunk of streamWithTags) {
    onResponseChunk(chunk)
    fullResponse += chunk
  }

  state.messages = buildArray<CodebuffMessage>([
    ...expireMessages(state.messages, 'agentStep'),
    fullResponse && {
      role: 'assistant' as const,
      content: fullResponse,
    },
  ])

  resolveStreamDonePromise()
  await previousToolCallFinished

  return { toolCalls, toolResults, state, fullResponse }
}