import { toolNames } from '@codebuff/common/tools/constants'
import { buildArray } from '@codebuff/common/util/array'
import {
  toolJsonContent,
  assistantMessage,
} from '@codebuff/common/util/messages'
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
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type {
  AssistantMessage,
  Message,
  ToolMessage,
} from '@codebuff/common/types/messages/codebuff-message'
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
    clientSessionId: string
    fingerprintId: string
    userId: string | undefined
    repoId: string | undefined
    ancestorRunIds: string[]
    runId: string
    agentTemplate: AgentTemplate
    localAgentTemplates: Record<string, AgentTemplate>
    fileContext: ProjectFileContext
    messages: Message[]
    system: string
    agentState: AgentState
    agentContext: Record<string, Subgoal>
    signal: AbortSignal
    onResponseChunk: (chunk: string | PrintModeEvent) => void
    fullResponse: string
    sendSubagentChunk: SendSubagentChunkFn
    logger: Logger
    onCostCalculated: (credits: number) => Promise<void>
  } & Omit<
    ExecuteToolCallParams<any>,
    | 'fullResponse'
    | 'input'
    | 'previousToolCallFinished'
    | 'state'
    | 'toolCalls'
    | 'toolName'
    | 'toolResults'
    | 'toolResultsToAddAfterStream'
    | 'toolCallId'
  > &
    ParamsExcluding<
      typeof processStreamWithTags,
      'defaultProcessor' | 'loggerOptions' | 'onError' | 'processors'
    >,
) {
  const {
    agentContext,
    agentTemplate,
    agentState,
    ancestorRunIds,
    fileContext,
    fingerprintId,
    localAgentTemplates,
    logger,
    repoId,
    runId,
    signal,
    system,
    userId,
    onCostCalculated,
    onResponseChunk,
    sendSubagentChunk,
  } = params
  const fullResponseChunks: string[] = [params.fullResponse]

  const messages = [...params.messages]

  const toolResults: ToolMessage[] = []
  const assistantMessages: AssistantMessage[] = []
  const toolResultsToAddAfterStream: ToolMessage[] = []
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
        if (signal.aborted) {
          return
        }
        // delegated to reusable helper
        previousToolCallFinished = executeToolCall({
          ...params,
          onResponseChunk: (chunk) => {
            if (typeof chunk !== 'string' && chunk.type === 'tool_call') {
              assistantMessages.push(
                assistantMessage({ ...chunk, type: 'tool-call' }),
              )
            }
            return onResponseChunk(chunk)
          },
          toolName,
          input,
          toolCalls,
          toolResults,
          toolResultsToAddAfterStream,
          previousToolCallFinished,
          fullResponse: fullResponseChunks.join(''),
          state,
          fromHandleSteps: false,
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
          onResponseChunk: (chunk) => {
            if (typeof chunk !== 'string' && chunk.type === 'tool_call') {
              assistantMessages.push(
                assistantMessage({ ...chunk, type: 'tool-call' }),
              )
            }
            return onResponseChunk(chunk)
          },
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
    onResponseChunk: (chunk) => {
      logger.info({ chunk }, 'asdf chunk from stream parser')
      if (chunk.type === 'text') {
        if (chunk.text) {
          assistantMessages.push(assistantMessage(chunk.text))
        }
      } else if (chunk.type === 'error') {
        // do nothing
      } else {
        chunk satisfies never
        throw new Error(
          `Internal error: unhandled chunk type: ${(chunk as any).type}`,
        )
      }
      return onResponseChunk(chunk)
    },
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
        content: [
          toolJsonContent({
            errorMessage: error,
          }),
        ],
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
    } else if (chunk.type === 'tool-call') {
      // do nothing
    } else {
      chunk satisfies never
      throw new Error(
        `Internal error: unhandled chunk type: ${(chunk as any).type}`,
      )
    }
  }

  state.messages = buildArray<Message>([
    ...expireMessages(state.messages, 'agentStep'),
    ...assistantMessages,
    ...toolResultsToAddAfterStream,
  ])

  if (!signal.aborted) {
    resolveStreamDonePromise()
    await previousToolCallFinished
  }
  return {
    toolCalls,
    toolResults,
    state,
    fullResponse: fullResponseChunks.join(''),
    fullResponseChunks,
    messageId,
  }
}
