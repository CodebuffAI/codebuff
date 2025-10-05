import {
  endToolTag,
  startToolTag,
  toolNameParam,
  toolNames,
} from '@codebuff/common/tools/constants'
import { buildArray } from '@codebuff/common/util/array'
import { generateCompactId } from '@codebuff/common/util/string'
import { cloneDeep } from 'lodash'

import { expireMessages } from '../util/messages'
import { sendAction } from '../websockets/websocket-action'
import { processStreamWithTags } from '../xml-stream-parser'
import { executeCustomToolCall, executeToolCall } from './tool-executor'

import type { CustomToolCall } from './tool-executor'
import type { StreamChunk } from '../llm-apis/vercel-ai-sdk/ai-sdk'
import type { AgentTemplate } from '../templates/types'
import type { ToolName } from '@codebuff/common/tools/constants'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type {
  Message,
  ToolMessage,
} from '@codebuff/common/types/messages/codebuff-message'
import type { ToolResultPart } from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { AgentState, Subgoal } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { ToolCallPart } from 'ai'
import type { WebSocket } from 'ws'

export type ToolCallError = {
  toolName?: string
  args: Record<string, unknown>
  error: string
} & Omit<ToolCallPart, 'type'>

export async function processStreamWithTools(options: {
  stream: AsyncGenerator<StreamChunk, string | null>
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
  messages: Message[]
  system: string
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
    system,
    agentState,
    onResponseChunk,
  } = options
  const fullResponseChunks: string[] = [options.fullResponse]

  const messages = [...options.messages]

  const toolResults: ToolResultPart[] = []
  const toolResultsToAddAfterStream: ToolResultPart[] = []
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
    system,
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
          toolResultsToAddAfterStream,
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
          toolResultsToAddAfterStream,
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
    customToolCallback,
    (toolName, error) => {
      const toolResult: ToolResultPart = {
        type: 'tool-result',
        toolName,
        toolCallId: generateCompactId(),
        output: [{ type: 'json', value: { errorMessage: error } }],
      }
      toolResults.push(cloneDeep(toolResult))
      toolResultsToAddAfterStream.push(cloneDeep(toolResult))
    },
    onResponseChunk,
    {
      userId,
      model: agentTemplate.model,
      agentName: agentTemplate.id,
    },
  )

  let reasoning = false
  let messageId: string | null = null
  while (true) {
    const { value: chunk, done } = await streamWithTags.next()
    if (done) {
      messageId = chunk
      break
    }

    if (chunk.type === 'reasoning') {
      if (!reasoning) {
        reasoning = true
        onResponseChunk(`\n\n${startToolTag}{
  ${JSON.stringify(toolNameParam)}: "think_deeply",
  "thought": "`)
      }
      onResponseChunk(JSON.stringify(chunk.text).slice(1, -1))
    } else if (chunk.type === 'text') {
      if (reasoning) {
        reasoning = false
        onResponseChunk(`"\n}${endToolTag}\n\n`)
      }
      onResponseChunk(chunk.text)
      fullResponseChunks.push(chunk.text)
    } else if (chunk.type === 'error') {
      onResponseChunk(chunk)
    } else {
      chunk satisfies never
    }
  }

  state.messages = buildArray<Message>([
    ...expireMessages(state.messages, 'agentStep'),
    fullResponseChunks.length > 0 && {
      role: 'assistant' as const,
      content: fullResponseChunks.join(''),
    },
    ...toolResultsToAddAfterStream.map((toolResult) => {
      return {
        role: 'tool',
        content: toolResult,
      } satisfies ToolMessage
    }),
  ])

  resolveStreamDonePromise()
  await previousToolCallFinished

  return {
    toolCalls,
    toolResults,
    state,
    fullResponse: fullResponseChunks.join(''),
    fullResponseChunks,
    messageId,
  }
}
