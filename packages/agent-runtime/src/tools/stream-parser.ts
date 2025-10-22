import {
  endToolTag,
  startToolTag,
  toolNameParam,
  toolNames,
} from '@codebuff/common/tools/constants'
import { buildArray } from '@codebuff/common/util/array'
import { generateCompactId } from '@codebuff/common/util/string'
import { cloneDeep } from 'lodash'

import { processStreamWithTags } from '../tool-stream-parser'
import { executeCustomToolCall, executeToolCall } from './tool-executor'
import { expireMessages } from '../util/messages'

import type { CustomToolCall, ExecuteToolCallParams } from './tool-executor'
import type { AgentTemplate } from '../templates/types'
import type { ToolName } from '@codebuff/common/tools/constants'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { SendSubagentChunkFn } from '@codebuff/common/types/contracts/client'
import type { StreamChunk } from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type {
  Message,
  ToolMessage,
} from '@codebuff/common/types/messages/codebuff-message'
import type { ToolResultPart } from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { AgentState, Subgoal } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { ToolCallPart } from 'ai'

export type ToolCallError = {
  toolName?: string
  args: Record<string, unknown>
  error: string
} & Omit<ToolCallPart, 'type'>

export async function processStreamWithTools(
  params: {
    stream: AsyncGenerator<StreamChunk>
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
    sendSubagentChunk: SendSubagentChunkFn
    logger: Logger
  } & Omit<
    ExecuteToolCallParams<any>,
    | 'toolName'
    | 'input'
    | 'toolCalls'
    | 'toolResults'
    | 'toolResultsToAddAfterStream'
    | 'previousToolCallFinished'
    | 'fullResponse'
    | 'state'
  > &
    ParamsExcluding<
      typeof processStreamWithTags,
      'processors' | 'defaultProcessor' | 'onError' | 'loggerOptions'
    >,
) {
  const {
    stream,
    agentStepId,
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
    sendSubagentChunk,
    logger,
  } = params
  const fullResponseChunks: string[] = [params.fullResponse]

  const messages = [...params.messages]

  const toolResults: ToolResultPart[] = []
  const toolResultsToAddAfterStream: ToolResultPart[] = []
  const toolCalls: (CodebuffToolCall | CustomToolCall)[] = []
  const { promise: streamDonePromise, resolve: resolveStreamDonePromise } =
    Promise.withResolvers<void>()
  let previousToolCallFinished = streamDonePromise

  const state: Record<string, any> = {
    fingerprintId,
    userId,
    repoId,
    agentTemplate,
    localAgentTemplates,
    sendSubagentChunk,
    agentState,
    agentContext,
    messages,
    system,
    logger,
  }

  function toolCallback<T extends ToolName>(toolName: T) {
    return {
      onTagStart: () => {},
      onTagEnd: async (_: string, input: Record<string, string>) => {
        // delegated to reusable helper
        previousToolCallFinished = executeToolCall({
          ...params,
          toolName,
          input,
          toolCalls,
          toolResults,
          toolResultsToAddAfterStream,
          previousToolCallFinished,
          fullResponse: fullResponseChunks.join(''),
          state,
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
          ...params,
          toolName,
          input,
          toolCalls,
          toolResults,
          toolResultsToAddAfterStream,
          previousToolCallFinished,
          fullResponse: fullResponseChunks.join(''),
          state,
        })
      },
    }
  }

  const streamWithTags = processStreamWithTags({
    ...params,
    processors: Object.fromEntries([
      ...toolNames.map((toolName) => [toolName, toolCallback(toolName)]),
      ...Object.keys(fileContext.customToolDefinitions).map((toolName) => [
        toolName,
        customToolCallback(toolName),
      ]),
    ]),
    defaultProcessor: customToolCallback,
    onError: (toolName, error) => {
      const toolResult: ToolResultPart = {
        type: 'tool-result',
        toolName,
        toolCallId: generateCompactId(),
        output: [{ type: 'json', value: { errorMessage: error } }],
      }
      toolResults.push(cloneDeep(toolResult))
      toolResultsToAddAfterStream.push(cloneDeep(toolResult))
    },
    loggerOptions: {
      userId,
      model: agentTemplate.model,
      agentName: agentTemplate.id,
    },
  })

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
      onResponseChunk(chunk)
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
