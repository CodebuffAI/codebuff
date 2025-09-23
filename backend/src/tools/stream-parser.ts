import {
  endToolTag,
  startToolTag,
  toolNameParam,
  toolNames,
} from '@codebuff/common/tools/constants'
import { buildArray } from '@codebuff/common/util/array'
import { generateCompactId } from '@codebuff/common/util/string'

import { expireMessages } from '../util/messages'
import { logger } from '../util/logger'
import { sendAction } from '../websockets/websocket-action'
import { processStreamWithTags } from '../xml-stream-parser'
import { executeCustomToolCall, executeToolCall } from './tool-executor'
import {
  executeBatchStrReplaces,
  BatchStrReplaceState,
} from './batch-str-replace'

import type { CustomToolCall } from './tool-executor'
import type { StreamChunk } from '../llm-apis/vercel-ai-sdk/ai-sdk'
import type { AgentTemplate } from '../templates/types'
import type { ToolName } from '@codebuff/common/tools/constants'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
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
  stream: AsyncGenerator<StreamChunk>
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

  const toolResults: ToolResultPart[] = []
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
                  deferredStrReplaces: batchState.deferredStrReplaces,
                  toolCalls,
                  toolResults,
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
            )
          }

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
        type: 'tool-result',
        toolName,
        toolCallId: generateCompactId(),
        output: [{ type: 'json', value: { errorMessage: error } }],
      })
    },
    onResponseChunk,
    {
      userId,
      model: agentTemplate.model,
      agentName: agentTemplate.id,
    },
  )

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
        agentStepId,
        userInputId,
      },
      `toolCallback: Triggering batch str_replace execution (${batchState.deferredStrReplaces.length} deferred tools) due to stream end`,
    )

    batchState.strReplacePhaseComplete = true

    // Execute all deferred str_replace tools as a batch
    previousToolCallFinished = previousToolCallFinished.then(async () => {
      await executeBatchStrReplaces({
        deferredStrReplaces: batchState.deferredStrReplaces,
        toolCalls,
        toolResults,
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
