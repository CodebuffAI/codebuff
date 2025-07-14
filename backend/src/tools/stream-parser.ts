import { ToolName, toolNames } from '@codebuff/common/constants/tools'
import { Subgoal, ToolResult } from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { generateCompactId } from '@codebuff/common/util/string'
import { WebSocket } from 'ws'
import { AgentTemplate } from '../templates/types'
import { parseRawToolCall, ToolCallError, toolParams } from '../tools'
import { logger } from '../util/logger'
import { requestToolCall } from '../websockets/websocket-action'
import { processStreamWithTags } from '../xml-stream-parser'
import {
  CodebuffToolCall,
  CodebuffToolHandlerFunction,
  codebuffToolHandlers,
} from './constants'

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
    onResponseChunk,
  } = options
  let fullResponse = options.fullResponse

  const toolResults: ToolResult[] = []
  const toolCalls: CodebuffToolCall[] = []
  const { promise: streamDonePromise, resolve: resolveStreamDonePromise } =
    Promise.withResolvers<void>()
  let previousToolCallFinished = streamDonePromise
  const state: Record<string, any> = {
    ws,
    clientSessionId,
    fingerprintId,
    userId,
    repoId,
    mutableState: {
      agentContext,
    },
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

        logger.info({ toolCall }, `${toolName} tool call detected in stream`)
        toolCalls.push(toolCall)

        // Filter out restricted tools in ask mode unless exporting summary
        if (!agentTemplate.toolNames.includes(toolCall.toolName)) {
          toolResults.push({
            toolName,
            toolCallId: generateCompactId(),
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
          requestClientToolCall: async () => {
            const clientToolResult = await requestToolCall(
              ws,
              userInputId,
              toolCall.toolName,
              toolCall.args
            )
            return (
              clientToolResult.error ??
              (typeof clientToolResult.result === 'string'
                ? clientToolResult.result
                : JSON.stringify(clientToolResult.result))
            )
          },
          toolCall,
          state,
        })

        for (const [key, value] of Object.entries(stateUpdate)) {
          state[key] = value
        }
        previousToolCallFinished = toolResultPromise.then((result) => {
          toolResults.push({
            toolName,
            toolCallId: toolCall.toolCallId,
            result,
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

  resolveStreamDonePromise()
  await previousToolCallFinished

  return { toolCalls, toolResults, state, fullResponse }
}
