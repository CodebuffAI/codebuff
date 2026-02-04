import { toolNames } from '@codebuff/common/tools/constants'
import { buildArray } from '@codebuff/common/util/array'
import {
  jsonToolResult,
  assistantMessage,
  userMessage,
} from '@codebuff/common/util/messages'
import { generateCompactId } from '@codebuff/common/util/string'
import { cloneDeep } from 'lodash'

import { processStreamWithTools } from '../tool-stream-parser'
import {
  executeCustomToolCall,
  executeToolCall,
  tryTransformAgentToolCall,
} from './tool-executor'
import { expireMessages, withSystemTags } from '../util/messages'

import type { CustomToolCall, ExecuteToolCallParams } from './tool-executor'
import type { AgentTemplate } from '../templates/types'
import type { FileProcessingState } from './handlers/tool/write-file'
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

export async function processStream(
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
    | 'fileProcessingState'
    | 'fromHandleSteps'
    | 'fullResponse'
    | 'input'
    | 'previousToolCallFinished'
    | 'state'
    | 'toolCallId'
    | 'toolCalls'
    | 'toolName'
    | 'toolResults'
    | 'toolResultsToAddAfterStream'
  > &
    ParamsExcluding<
      typeof processStreamWithTools,
      | 'processors'
      | 'defaultProcessor'
      | 'onError'
      | 'loggerOptions'
      | 'executeXmlToolCall'
    >,
) {
  const {
    agentState,
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

  // === MUTABLE STATE ===
  const toolResults: ToolMessage[] = []
  const toolResultsToAddAfterStream: ToolMessage[] = []
  const toolCalls: (CodebuffToolCall | CustomToolCall)[] = []
  const assistantMessages: Message[] = []
  let hadToolCallError = false
  const errorMessages: Message[] = []
  const { promise: streamDonePromise, resolve: resolveStreamDonePromise } =
    Promise.withResolvers<void>()
  let previousToolCallFinished = streamDonePromise

  const fileProcessingState: FileProcessingState = {
    promisesByPath: {},
    allPromises: [],
    fileChangeErrors: [],
    fileChanges: [],
    firstFileProcessed: false,
  }

  // === RESPONSE HANDLER ===
  // Creates a response handler that captures tool events into assistantMessages.
  // When isXmlMode=true, also captures tool_result events for interleaved ordering.
  function createResponseHandler(isXmlMode: boolean) {
    return (chunk: string | PrintModeEvent) => {
      if (typeof chunk !== 'string') {
        if (chunk.type === 'tool_call') {
          assistantMessages.push(
            assistantMessage({ ...chunk, type: 'tool-call' }),
          )
        } else if (isXmlMode && chunk.type === 'tool_result') {
          const toolResultMessage: ToolMessage = {
            role: 'tool',
            toolName: chunk.toolName,
            toolCallId: chunk.toolCallId,
            content: chunk.output,
          }
          assistantMessages.push(toolResultMessage)
        } else if (chunk.type === 'error') {
          hadToolCallError = true
          errorMessages.push(
            userMessage(
              withSystemTags(
                `Error during tool call: ${chunk.message}. Please check the tool name and arguments and try again.`,
              ),
            ),
          )
        }
      }
      return onResponseChunk(chunk)
    }
  }

  // === TOOL EXECUTION ===
  // Unified callback factory for both native and custom tools.
  // isXmlMode=true: execute immediately, capture results inline (for XML tool calls)
  // isXmlMode=false: defer execution, results added at end (for native tool calls)
  function createToolExecutionCallback(toolName: string, isXmlMode: boolean) {
    const responseHandler = createResponseHandler(isXmlMode)
    const resultsArray = isXmlMode ? [] : toolResultsToAddAfterStream

    return {
      onTagStart: () => {},
      onTagEnd: async (_: string, input: Record<string, string>) => {
        if (signal.aborted) {
          return
        }
        const toolCallId = generateCompactId()
        const isNativeTool = toolNames.includes(toolName as ToolName)

        // Check if this is an agent tool call that should be transformed to spawn_agents
        const transformed = !isNativeTool
          ? tryTransformAgentToolCall({
              toolName,
              input,
              spawnableAgents: agentTemplate.spawnableAgents,
            })
          : null

        // Read previousToolCallFinished at execution time to ensure proper sequential chaining.
        // For XML mode, if this is the first tool call (still pointing to streamDonePromise),
        // start with a resolved promise so we don't wait for the stream to complete.
        const previousPromise =
          isXmlMode && previousToolCallFinished === streamDonePromise
            ? Promise.resolve()
            : previousToolCallFinished

        // Determine which executor to use and with what parameters
        let toolPromise: Promise<void>
        if (isNativeTool || transformed) {
          // Use executeToolCall for native tools or transformed agent calls
          toolPromise = executeToolCall({
            ...params,
            toolName: transformed
              ? transformed.toolName
              : (toolName as ToolName),
            input: transformed ? transformed.input : input,
            fromHandleSteps: false,
            skipDirectResultPush: isXmlMode,
            fileProcessingState,
            fullResponse: fullResponseChunks.join(''),
            previousToolCallFinished: previousPromise,
            toolCallId,
            toolCalls,
            toolResults,
            toolResultsToAddAfterStream: resultsArray,
            onCostCalculated,
            onResponseChunk: responseHandler,
          })
        } else {
          // Use executeCustomToolCall for custom/MCP tools
          toolPromise = executeCustomToolCall({
            ...params,
            toolName,
            input,
            skipDirectResultPush: isXmlMode,
            fileProcessingState,
            fullResponse: fullResponseChunks.join(''),
            previousToolCallFinished: previousPromise,
            toolCallId,
            toolCalls,
            toolResults,
            toolResultsToAddAfterStream: resultsArray,
            onResponseChunk: responseHandler,
          })
        }

        previousToolCallFinished = toolPromise

        // For XML mode, await execution so results appear inline before stream continues
        if (isXmlMode) {
          await toolPromise
        }
      },
    }
  }

  // === STREAM PROCESSING ===
  const streamWithTags = processStreamWithTools({
    ...params,
    processors: Object.fromEntries([
      ...toolNames.map((name) => [
        name,
        createToolExecutionCallback(name, false),
      ]),
      ...Object.keys(fileContext.customToolDefinitions ?? {}).map((name) => [
        name,
        createToolExecutionCallback(name, false),
      ]),
    ]),
    defaultProcessor: (name: string) =>
      createToolExecutionCallback(name, false),
    onError: (toolName, error) => {
      const toolResult: ToolMessage = {
        role: 'tool',
        toolName,
        toolCallId: generateCompactId(),
        content: jsonToolResult({ errorMessage: error }),
      }
      toolResults.push(cloneDeep(toolResult))
      toolResultsToAddAfterStream.push(cloneDeep(toolResult))
    },
    loggerOptions: {
      userId,
      model: agentTemplate.model,
      agentName: agentTemplate.id,
    },
    onResponseChunk: (chunk) => {
      if (chunk.type === 'text') {
        if (chunk.text) {
          assistantMessages.push(assistantMessage(chunk.text))
        }
      } else if (chunk.type === 'error') {
        // do nothing
      } else {
        chunk satisfies never
        throw new Error(
          `Internal error: unhandled chunk type: ${(chunk as { type: unknown }).type}`,
        )
      }
      return onResponseChunk(chunk)
    },
    // Execute XML-parsed tool calls immediately during streaming
    executeXmlToolCall: async ({ toolName, input }) => {
      if (signal.aborted) {
        return
      }
      const callback = createToolExecutionCallback(toolName, true)
      await callback.onTagEnd(toolName, input as Record<string, string>)
    },
  })

  // === STREAM CONSUMPTION LOOP ===
  let messageId: string | null = null

  while (true) {
    if (signal.aborted) {
      break
    }
    const { value: chunk, done } = await streamWithTags.next()
    if (done) {
      // Handle PromptResult: extract value if success, null if aborted
      if (chunk && typeof chunk === 'object' && 'aborted' in chunk) {
        messageId = chunk.aborted ? null : chunk.value
      } else {
        messageId = chunk
      }
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
      hadToolCallError = true
      // Collect error messages to add AFTER all tool results
      // This ensures proper message ordering for Anthropic's API which requires
      // tool results to immediately follow the assistant message with tool calls
      errorMessages.push(
        userMessage(
          withSystemTags(
            `Error during tool call: ${chunk.message}. Please check the tool name and arguments and try again.`,
          ),
        ),
      )
    } else if (chunk.type === 'tool-call') {
      // Tool call handling is done in the processor's onResponseChunk
    } else {
      chunk satisfies never
      throw new Error(
        `Unhandled chunk type: ${(chunk as { type: unknown }).type}`,
      )
    }
  }

  // === FINALIZATION ===
  agentState.messageHistory = buildArray<Message>([
    ...expireMessages(agentState.messageHistory, 'agentStep'),
    ...assistantMessages,
    ...toolResultsToAddAfterStream,
  ])

  if (!signal.aborted) {
    resolveStreamDonePromise()
    await previousToolCallFinished
  }

  // Error messages must come AFTER tool results for proper API ordering
  agentState.messageHistory.push(...errorMessages)

  return {
    fullResponse: fullResponseChunks.join(''),
    fullResponseChunks,
    hadToolCallError,
    messageId,
    toolCalls,
    toolResults,
  }
}
