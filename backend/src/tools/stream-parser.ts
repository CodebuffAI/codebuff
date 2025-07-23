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
import { ToolCallPart } from 'ai'
import { WebSocket } from 'ws'
import { AgentTemplate } from '../templates/types'
import { toolParams } from '../tools'
import { processStreamWithTags } from '../xml-stream-parser'
import { executeToolCall } from './tool-executor'
import { CodebuffToolCall } from './constants'
import { expireMessages } from '../util/messages'
import { sendAction } from '../websockets/websocket-action'

export type ToolCallError = {
  toolName?: string
  args: Record<string, unknown>
  error: string
} & Omit<ToolCallPart, 'type'>

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
    sendSubagentChunk: (data: {
      userInputId: string
      agentId: string
      agentType: string
      chunk: string
      prompt?: string
    }) => {
      sendAction(ws, {
        type: 'subagent-response-chunk',
        ...data,
      })
    },

    agentState,
    agentContext,
    messages,
  }

  function toolCallback<T extends ToolName>(toolName: T) {
    return {
      params: toolParams[toolName],
      onTagStart: () => {},
      onTagEnd: async (_: string, args: Record<string, string>) => {
        // delegated to reusable helper
        previousToolCallFinished = executeToolCall({
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
