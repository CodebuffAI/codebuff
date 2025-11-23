import { toolNames } from '@codebuff/common/tools/constants'
import { buildArray } from '@codebuff/common/util/array'
import {
  jsonToolResult,
  assistantMessage,
} from '@codebuff/common/util/messages'
import { generateCompactId } from '@codebuff/common/util/string'
import { cloneDeep } from 'lodash'

import { processStreamWithTags } from '../tool-stream-parser'
import { executeCustomToolCall, executeToolCall } from './tool-executor'
import { expireMessages } from '../util/messages'

import type { State } from './handlers/handler-function-type'
import type { CustomToolCall, ExecuteToolCallParams } from './tool-executor'
import type { AgentTemplate } from '../templates/types'
import type { ToolName } from '@codebuff/common/tools/constants'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type {
  Message,
  ToolMessage,
} from '@codebuff/common/types/messages/codebuff-message'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { Subgoal } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { ToolCallPart } from 'ai'

export type ToolCallError = {
  toolName?: string
  args: Record<string, unknown>
  error: string
} & Omit<ToolCallPart, 'type'>

export async function processStreamWithTools(
  params: {
    agentContext: Record<string, Subgoal>
    agentTemplate: AgentTemplate
    ancestorRunIds: string[]
    fileContext: ProjectFileContext
    fingerprintId: string
    fullResponse: string
    logger: Logger
    messages: Message[]
    repoId: string | undefined
    runId: string
    signal: AbortSignal
    userId: string | undefined

    onCostCalculated: (credits: number) => Promise<void>
    onResponseChunk: (chunk: string | PrintModeEvent) => void
  } & Omit<
    ExecuteToolCallParams<any>,
    | 'fromHandleSteps'
    | 'fullResponse'
    | 'input'
    | 'previousToolCallFinished'
    | 'state'
    | 'toolCalls'
    | 'toolName'
    | 'toolResults'
    | 'toolResultsToAddAfterStream'
  > &
    ParamsExcluding<
      typeof processStreamWithTags,
      'processors' | 'defaultProcessor' | 'onError' | 'loggerOptions'
    >,
) {
  const {
    agentContext,
    agentTemplate,
    ancestorRunIds,
    fileContext,
    fullResponse,
    onCostCalculated,
    onResponseChunk,
    runId,
    signal,
    userId,
  } = params
  const fullResponseChunks: string[] = [fullResponse]

  const messages = [...params.messages]

  const toolResults: ToolMessage[] = []
  const toolResultsToAddAfterStream: ToolMessage[] = []
  const toolCalls: (CodebuffToolCall | CustomToolCall)[] = []
  const { promise: streamDonePromise, resolve: resolveStreamDonePromise } =
    Promise.withResolvers<void>()
  let previousToolCallFinished = streamDonePromise

  const state: State = {
    agentContext,
    messages,
    promisesByPath: {},
    allPromises: [],
    fileChangeErrors: [],
    fileChanges: [],
    firstFileProcessed: false,
  }

  function toolCallback<T extends ToolName>(toolName: T) {
    return {
      onTagStart: () => {},
      onTagEnd: async (_: string, input: Record<string, string>) => {
        if (signal.aborted) {
          return
        }
        // delegated to reusable helper
        previousToolCallFinished = executeToolCall({
          ...params,
          toolName,
          input,
          fromHandleSteps: false,

          fullResponse: fullResponseChunks.join(''),
          previousToolCallFinished,
          state,
          toolCalls,
          toolResults,
          toolResultsToAddAfterStream,

          onCostCalculated,
        })
      },
    }
  }
  function customToolCallback(toolName: string) {
    return {
      onTagStart: () => {},
      onTagEnd: async (_: string, input: Record<string, string>) => {
        if (signal.aborted) {
          return
        }
        // delegated to reusable helper
        previousToolCallFinished = executeCustomToolCall({
          ...params,
          toolName,
          input,

          fullResponse: fullResponseChunks.join(''),
          previousToolCallFinished,
          state,
          toolCalls,
          toolResults,
          toolResultsToAddAfterStream,
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
      const toolResult: ToolMessage = {
        role: 'tool',
        toolName,
        toolCallId: generateCompactId(),
        content: jsonToolResult({
          errorMessage: error,
        }),
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

  let messageId: string | null = null
  while (true) {
    if (signal.aborted) {
      break
    }
    const { value: chunk, done } = await streamWithTags.next()
    if (done) {
      messageId = chunk
      break
    }

    if (chunk.type === 'reasoning') {
      onResponseChunk({
        type: 'reasoning_delta',
        text: chunk.text,
        ancestorRunIds,
        runId,
      })
    } else if (chunk.type === 'text') {
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
    fullResponseChunks.length > 0 &&
      assistantMessage(fullResponseChunks.join('')),
    ...toolResultsToAddAfterStream,
  ])

  if (!signal.aborted) {
    resolveStreamDonePromise()
    await previousToolCallFinished
  }
  return {
    fullResponse: fullResponseChunks.join(''),
    fullResponseChunks,
    messageId,
    state,
    toolCalls,
    toolResults,
  }
}
