import { processStreamWithTags } from '@codebuff/agent-runtime/tool-stream-parser'
import { expireMessages } from '@codebuff/agent-runtime/util/messages'
import {
  endToolTag,
  startToolTag,
  toolNameParam,
  toolNames,
} from '@codebuff/common/tools/constants'
import { buildArray } from '@codebuff/common/util/array'
import { generateCompactId } from '@codebuff/common/util/string'
import { cloneDeep } from 'lodash'

import { executeBatchStrReplaces } from './batch-str-replace'
import { executeCustomToolCall, executeToolCall } from './tool-executor'

import type { BatchStrReplaceState } from './batch-str-replace'
import type { CustomToolCall, ExecuteToolCallParams } from './tool-executor'
import type { AgentTemplate } from '@codebuff/agent-runtime/templates/types'
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
      typeof executeBatchStrReplaces,
      'deferredStrReplaces' | 'toolCalls' | 'toolResults' | 'state'
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

  // Two-phase execution state
  const batchState: BatchStrReplaceState = {
    deferredStrReplaces: [],
    otherToolsQueue: [],
    strReplacePhaseComplete: false,
    failures: [],
  }

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
        // Two-phase execution: defer str_replace tools, queue others
        if (toolName === 'str_replace' && !batchState.strReplacePhaseComplete) {
          // Defer str_replace execution
          const toolCallId = generateCompactId()
          const toolCall: CodebuffToolCall<'str_replace'> = {
            toolName: 'str_replace',
            input: input as any,
            toolCallId,
          }

          batchState.deferredStrReplaces.push({ toolCall })

          // Still emit the tool call event
          onResponseChunk({
            type: 'tool_call',
            toolCallId,
            toolName,
            input,
            // Only include agentId for subagents (agents with a parent)
            ...(agentState.parentId && { agentId: agentState.agentId }),
          })
        } else {
          // First non-str_replace tool marks end of str_replace phase
          if (
            !batchState.strReplacePhaseComplete &&
            batchState.deferredStrReplaces.length > 0
          ) {
            logger.info(
              {
                triggeringTool: toolName,
                deferredCount: batchState.deferredStrReplaces.length,
                agentStepId,
                userInputId,
              },
              `toolCallback: Triggering batch str_replace execution (${batchState.deferredStrReplaces.length} deferred tools) due to ${toolName}`,
            )

            batchState.strReplacePhaseComplete = true

            // Execute all deferred str_replace tools as a batch
            previousToolCallFinished = previousToolCallFinished.then(
              async () => {
                await executeBatchStrReplaces({
                  ...params,
                  deferredStrReplaces: batchState.deferredStrReplaces,
                  toolCalls,
                  toolResults,
                  onResponseChunk,
                  state,
                })
              },
            )
          }

          previousToolCallFinished = executeToolCall({
            ...params,
            toolName,
            input,
            toolCalls,
            toolResults,
            toolResultsToAddAfterStream,
            previousToolCallFinished,
            fullResponse: fullResponseChunks.join(''),
            onResponseChunk,
            state,
          })
        }
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
    stream,
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
    onResponseChunk,
    logger,
    loggerOptions: {
      userId,
      model: agentTemplate.model,
      agentName: agentTemplate.id,
    },
  })

  let reasoning = false
  for await (const chunk of streamWithTags) {
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

  // Handle case where only str_replace tools were generated and stream ended
  if (
    !batchState.strReplacePhaseComplete &&
    batchState.deferredStrReplaces.length > 0
  ) {
    logger.info(
      {
        triggeringEvent: 'stream_end',
        deferredCount: batchState.deferredStrReplaces.length,
        deferredFiles: batchState.deferredStrReplaces.map(
          (d) => d.toolCall.input.path,
        ),
        agentStepId,
        userInputId,
      },
      `stream-parser: Triggering batch str_replace execution (${batchState.deferredStrReplaces.length} deferred tools) due to stream end`,
    )

    batchState.strReplacePhaseComplete = true

    // Execute all deferred str_replace tools as a batch
    previousToolCallFinished = previousToolCallFinished.then(async () => {
      logger.info(
        {
          agentStepId,
          userInputId,
          deferredCount: batchState.deferredStrReplaces.length,
        },
        'stream-parser: About to call executeBatchStrReplaces from stream end handler',
      )
      await executeBatchStrReplaces({
        ...params,
        deferredStrReplaces: batchState.deferredStrReplaces,
        toolCalls,
        toolResults,
        state,
      })
      logger.info(
        {
          agentStepId,
          userInputId,
        },
        'stream-parser: Completed executeBatchStrReplaces from stream end handler',
      )
    })
  }

  await previousToolCallFinished
  return {
    toolCalls,
    toolResults,
    state,
    fullResponse: fullResponseChunks.join(''),
    fullResponseChunks,
  }
}
