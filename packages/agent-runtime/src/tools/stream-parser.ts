import { toolNames } from '@codebuff/common/tools/constants'
import { buildArray } from '@codebuff/common/util/array'
import { generateCompactId } from '@codebuff/common/util/string'

import { expireMessages } from '../util/messages'
import { executeCustomToolCall, executeToolCall } from './tool-executor'
import type { AgentRuntimeEnvironment } from '../runtime/interfaces'

import type { CustomToolCall } from './tool-executor'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { ToolName } from '@codebuff/common/tools/constants'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { CodebuffMessage } from '@codebuff/common/types/messages/codebuff-message'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  AgentState,
  Subgoal,
  ToolResult,
} from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { ToolCallPart } from 'ai'

export type ToolCallError = {
  toolName?: string
  args: Record<string, unknown>
  error: string
} & Omit<ToolCallPart, 'type'>

// Note: This is a simplified version that assumes we have access to XML stream processing
// The full implementation would need access to the xml-stream-parser from the backend
export async function processStreamWithTools(options: {
  stream: AsyncGenerator<string | PrintModeEvent> | ReadableStream<string>
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
  env: AgentRuntimeEnvironment
}) {
  const {
    stream,
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
    env,
  } = options
  const fullResponseChunks: string[] = [options.fullResponse]

  const messages = [...options.messages]

  const toolResults: ToolResult[] = []
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
    sendSubagentChunk: (data: {
      userInputId: string
      agentId: string
      agentType: string
      chunk: string
      prompt?: string
    }) => {
      // Send subagent chunk through IO environment
      if (env.io.onResponseChunk) {
        env.io.onResponseChunk({
          type: 'text',
          text: data.chunk,
        } as PrintModeEvent)
      }
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
          agentTemplate,
          fileContext,
          agentStepId,
          clientSessionId,
          userInputId,
          fullResponse: fullResponseChunks.join(''),
          onResponseChunk,
          state,
          userId,
          env,
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
          agentTemplate,
          fileContext,
          agentStepId,
          clientSessionId,
          userInputId,
          fullResponse: fullResponseChunks.join(''),
          onResponseChunk,
          state,
          userId,
          env,
        })
      },
    }
  }

  // Note: This is a simplified version without the actual XML stream processing
  // The backend would need to provide this functionality through the environment
  // For now, we'll just process the stream as text
  const streamWithTags = processStreamAsText(
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

// Simplified stream processing - in reality this would need the backend's XML processor
async function* processStreamAsText(
  stream: AsyncGenerator<string | PrintModeEvent> | ReadableStream<string>,
  toolCallbacks: Record<string, any>,
  onToolError: (toolName: string, error: string) => void,
  onResponseChunk: (chunk: string | PrintModeEvent) => void,
  context: {
    userId: string | undefined
    model: string | string[]
    agentName: string
  },
): AsyncGenerator<string> {
  // This is a placeholder implementation
  // The real implementation would parse XML tags and call the appropriate tool callbacks
  
  if (Symbol.asyncIterator in stream) {
    for await (const chunk of stream as AsyncGenerator<string | PrintModeEvent>) {
      if (typeof chunk === 'string') {
        yield chunk
      }
    }
  } else {
    const reader = (stream as ReadableStream<string>).getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        yield value
      }
    } finally {
      reader.releaseLock()
    }
  }
}
