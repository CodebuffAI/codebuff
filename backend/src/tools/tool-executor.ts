import {
  endsAgentStepParam,
  renderToolResults,
  ToolName,
} from '@codebuff/common/constants/tools'
import { CodebuffMessage } from '@codebuff/common/types/message'
import {
  AgentState,
  Subgoal,
  ToolResult,
} from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { ToolCallPart } from 'ai'
import { WebSocket } from 'ws'
import z from 'zod/v4'
import { checkLiveUserInput } from '../live-user-inputs'
import { AgentTemplate } from '../templates/types'
import { logger } from '../util/logger'
import { asSystemMessage } from '../util/messages'
import { requestToolCall } from '../websockets/websocket-action'
import {
  ClientToolCall,
  CodebuffToolCall,
  codebuffToolDefs,
  codebuffToolHandlers,
} from './constants'

export type ToolCallError = {
  toolName?: string
  args: Record<string, unknown>
  error: string
} & Omit<ToolCallPart, 'type'>

export function parseRawToolCall<T extends ToolName = ToolName>(
  rawToolCall: ToolCallPart & {
    toolName: T
    args: Record<string, unknown>
  }
): CodebuffToolCall<T> | ToolCallError {
  const toolName = rawToolCall.toolName

  if (!(toolName in codebuffToolDefs)) {
    return {
      toolName,
      toolCallId: rawToolCall.toolCallId,
      args: rawToolCall.args,
      error: `Tool ${toolName} not found`,
    }
  }
  const validName = toolName as T

  const processedParameters: Record<string, any> = {}
  for (const [param, val] of Object.entries(rawToolCall.args)) {
    processedParameters[param] = val
  }

  const result = (
    codebuffToolDefs[validName].parameters satisfies z.ZodObject as z.ZodObject
  )
    .extend({
      [endsAgentStepParam]: z.literal(
        codebuffToolDefs[validName].endsAgentStep
      ),
    })
    .safeParse(processedParameters)
  if (!result.success) {
    return {
      toolName: validName,
      toolCallId: rawToolCall.toolCallId,
      args: rawToolCall.args,
      error: `Invalid parameters for ${validName}: ${JSON.stringify(result.error.issues, null, 2)}`,
    }
  }

  delete result.data[endsAgentStepParam]
  return {
    toolName: validName,
    args: result.data,
    toolCallId: rawToolCall.toolCallId,
  } as CodebuffToolCall<T>
}

export interface ToolExecutionContext {
  ws: WebSocket
  agentStepId: string
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined
  repoId: string | undefined
  agentTemplate: AgentTemplate
  fileContext: ProjectFileContext
  onResponseChunk: (chunk: string) => void
  state: {
    ws: WebSocket
    fingerprintId: string
    userId: string | undefined
    repoId: string | undefined
    agentTemplate: AgentTemplate
    mutableState: {
      agentState: AgentState
      agentContext: Record<string, Subgoal>
      messages: CodebuffMessage[]
    }
  }
}

/**
 * Execute a single tool call synchronously and return the result
 */
export async function executeSingleTool<T extends ToolName>(
  toolCall: CodebuffToolCall<T>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const {
    ws,
    agentStepId,
    clientSessionId,
    userInputId,
    userId,
    agentTemplate,
    fileContext,
    onResponseChunk,
    state,
  } = context

  // Check if tool is allowed for this agent
  if (!agentTemplate.toolNames.includes(toolCall.toolName)) {
    const errorResult = {
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      result: `Tool \`${toolCall.toolName}\` is not currently available. Make sure to only use tools listed in the system instructions.`,
    }
    return errorResult
  }

  const toolHandler = codebuffToolHandlers[toolCall.toolName]
  if (!toolHandler) {
    const errorResult = {
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      result: `Tool handler for ${toolCall.toolName} not found`,
    }
    return errorResult
  }

  try {
    const { result: toolResultPromise, state: stateUpdate } = (
      toolHandler as any
    )({
      previousToolCallFinished: Promise.resolve(),
      fileContext,
      agentStepId,
      clientSessionId,
      userInputId,
      fullResponse: '',
      writeToClient: onResponseChunk,
      requestClientToolCall: async (clientToolCall: ClientToolCall) => {
        if (!checkLiveUserInput(userId, userInputId, clientSessionId)) {
          return ''
        }

        const clientToolResult = await requestToolCall(
          ws,
          userInputId,
          clientToolCall.toolName,
          clientToolCall.args
        )
        return (
          clientToolResult.error ??
          (typeof clientToolResult.result === 'string'
            ? clientToolResult.result
            : JSON.stringify(clientToolResult.result))
        )
      },
      toolCall,
      state,
    })

    // Update state with any changes from the tool handler
    Object.assign(state, stateUpdate)

    // Wait for the tool to complete and get the result
    const result = await toolResultPromise

    const toolResult = {
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      result,
    }

    // Add tool result to message history
    state.mutableState.messages.push({
      role: 'user' as const,
      content: asSystemMessage(renderToolResults([toolResult])),
    })

    return toolResult
  } catch (error) {
    logger.error(
      { error, toolCall },
      `Error executing tool ${toolCall.toolName}`
    )

    const errorResult = {
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      result: `Error executing ${toolCall.toolName}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    }
    return errorResult
  }
}

/**
 * Create a tool execution context for use with executeSingleTool
 */
export function createToolExecutionContext(options: {
  ws: WebSocket
  agentStepId: string
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined
  repoId: string | undefined
  agentTemplate: AgentTemplate
  fileContext: ProjectFileContext
  onResponseChunk: (chunk: string) => void
  agentState: AgentState
  messages: CodebuffMessage[]
  agentContext?: Record<string, Subgoal>
}): ToolExecutionContext {
  const {
    ws,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    repoId,
    agentTemplate,
    fileContext,
    onResponseChunk,
    agentState,
    messages,
    agentContext = {},
  } = options

  return {
    ws,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    repoId,
    agentTemplate,
    fileContext,
    onResponseChunk,
    state: {
      ws,
      fingerprintId,
      userId,
      repoId,
      agentTemplate,
      mutableState: {
        agentState,
        agentContext,
        messages: [...messages],
      },
    },
  }
}
