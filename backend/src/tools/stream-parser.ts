import { toolNames } from '@codebuff/common/tools/constants'
import { buildArray } from '@codebuff/common/util/array'
import { generateCompactId } from '@codebuff/common/util/string'

import { expireMessages } from '../util/messages'
import { sendAction } from '../websockets/websocket-action'
import { processStreamWithTags } from '../xml-stream-parser'
import { executeCustomToolCall, executeToolCall } from './tool-executor'

import type { CustomToolCall } from './tool-executor'
import type { AgentTemplate } from '../templates/types'
import type { ToolName } from '@codebuff/common/tools/constants'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { CodebuffMessage } from '@codebuff/common/types/message'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  AgentState,
  Subgoal,
  ToolResult,
} from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { ToolCallPart } from 'ai'
import type { WebSocket } from 'ws'

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
  localAgentTemplates: Record<string, AgentTemplate>
  fileContext: ProjectFileContext
  messages: CodebuffMessage[]
  agentState: AgentState
  agentContext: Record<string, Subgoal>
  onResponseChunk: (chunk: string | PrintModeEvent) => void
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
    localAgentTemplates,
    fileContext,
    agentContext,
    agentState,
    onResponseChunk,
  } = options
  const fullResponseChunks: string[] = [options.fullResponse]

  const messages = [...options.messages]

  const toolResults: ToolResult[] = []
  const toolCalls: (CodebuffToolCall | CustomToolCall)[] = []
  const { promise: streamDonePromise, resolve: resolveStreamDonePromise } =
    Promise.withResolvers<void>()
  let previousToolCallFinished = streamDonePromise
  const state: Record<string, any> = {
    ws,
    fingerprintId,
    userId,
    repoId,
    agentTemplate,
    localAgentTemplates,
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
      onTagStart: () => {},
      onTagEnd: async (_: string, input: Record<string, string>) => {
        // delegated to reusable helper
        previousToolCallFinished = executeToolCall({
          toolName,
          input,
          toolCalls,
          toolResults,
          previousToolCallFinished,
          ws,
          agentTemplate,
          fileContext,
          agentStepId,
          clientSessionId,
          userInputId,
          fullResponse: fullResponseChunks.join(''),
          onResponseChunk,
          state,
          userId,
        })
      },
    }
  }
  function customToolCallback(toolName: string) {
    return {
      onTagStart: () => {},
      onTagEnd: async (_: string, input: Record<string, string>) => {
        // delegated to reusable helper
        previousToolCallFinished = executeCustomToolCall({
          toolName,
          input,
          toolCalls,
          toolResults,
          previousToolCallFinished,
          ws,
          agentTemplate,
          fileContext,
          agentStepId,
          clientSessionId,
          userInputId,
          fullResponse: fullResponseChunks.join(''),
          onResponseChunk,
          state,
          userId,
        })
      },
    }
  }

  const streamWithTags = processStreamWithTags(
    stream,
    Object.fromEntries([
      ...toolNames.map((toolName) => [toolName, toolCallback(toolName)]),
      ...Object.keys(fileContext.customToolDefinitions).map((toolName) => [
        toolName,
        customToolCallback(toolName),
      ]),
    ]),
    (toolName, error) => {
      toolResults.push({
        toolName,
        toolCallId: generateCompactId(),
        output: { type: 'text', value: error },
      })
    },
    onResponseChunk,
    {
      userId,
      model: agentTemplate.model,
      agentName: agentTemplate.id,
    },
  )

  for await (const chunk of streamWithTags) {
    onResponseChunk(chunk)
    fullResponseChunks.push(chunk)
  }

  state.messages = buildArray<CodebuffMessage>([
    ...expireMessages(state.messages, 'agentStep'),
    fullResponseChunks.length > 0 && {
      role: 'assistant' as const,
      content: fullResponseChunks.join(''),
    },
  ])

  resolveStreamDonePromise()
  await previousToolCallFinished

  return {
    toolCalls,
    toolResults,
    state,
    fullResponse: fullResponseChunks.join(''),
    fullResponseChunks,
  }
}
