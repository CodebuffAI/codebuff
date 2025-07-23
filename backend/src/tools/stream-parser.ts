import { ToolName, toolNames } from '@codebuff/common/constants/tools'
import { CodebuffMessage } from '@codebuff/common/types/message'
import {
  AgentState,
  Subgoal,
  ToolResult,
} from '@codebuff/common/types/session-state'
import { buildArray } from '@codebuff/common/util/array'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { generateCompactId } from '@codebuff/common/util/string'
import { WebSocket } from 'ws'
import { AgentTemplate } from '../templates/types'
import { toolParams } from '../tools'
import { logger } from '../util/logger'
import { expireMessages } from '../util/messages'
import { processStreamWithTags } from '../xml-stream-parser'
import { CodebuffToolCall } from './constants'
import {
  ToolCallError,
  parseRawToolCall,
  createToolExecutionContext,
  executeSingleTool,
} from './tool-executor'

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

  // Create tool execution context
  const toolContext = createToolExecutionContext({
    ws,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    repoId,
    agentTemplate,
    fileContext,
    onResponseChunk,
    agentState,
    messages,
    agentContext,
  })

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

        // Use the extracted tool execution helper
        const toolResultPromise = executeSingleTool(toolCall, toolContext)

        previousToolCallFinished = toolResultPromise.then((toolResult) => {
          toolResults.push(toolResult)
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

  toolContext.state.mutableState.messages = buildArray<CodebuffMessage>([
    ...expireMessages(toolContext.state.mutableState.messages, 'agentStep'),
    fullResponse && {
      role: 'assistant' as const,
      content: fullResponse,
    },
  ])

  resolveStreamDonePromise()
  await previousToolCallFinished

  return { toolCalls, toolResults, state: toolContext.state, fullResponse }
}
