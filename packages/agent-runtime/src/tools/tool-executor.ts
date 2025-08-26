import { endsAgentStepParam } from '@codebuff/common/tools/constants'
import { renderToolResults } from '@codebuff/common/tools/utils'
import { generateCompactId } from '@codebuff/common/util/string'
import z from 'zod/v4'
import { convertJsonSchemaToZod } from 'zod-from-json-schema'

import { asSystemMessage } from '../util/messages'
import type { AgentRuntimeEnvironment } from '../runtime/interfaces'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { ToolName } from '@codebuff/common/tools/constants'
import type {
  ClientToolCall,
  ClientToolName,
  CodebuffToolCall,
} from '@codebuff/common/tools/list'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { ToolResult } from '@codebuff/common/types/session-state'
import type {
  customToolDefinitionsSchema,
  ProjectFileContext,
} from '@codebuff/common/util/file'
import type { ToolCallPart } from 'ai'

// Tool definitions and handlers are injected through the environment
// The backend will provide these through the runtime environment

export type CustomToolCall = {
  toolName: string
  input: Record<string, unknown>
} & Omit<ToolCallPart, 'type'>

export type ToolCallError = {
  toolName?: string
  input: Record<string, unknown>
  error: string
} & Pick<CodebuffToolCall, 'toolCallId'>

export function parseRawToolCall<T extends ToolName = ToolName>(
  rawToolCall: {
    toolName: T
    toolCallId: string
    input: Record<string, unknown>
  },
  toolDefs: Record<string, any>,
  autoInsertEndStepParam: boolean = false,
): CodebuffToolCall<T> | ToolCallError {
  const toolName = rawToolCall.toolName

  if (!(toolName in toolDefs)) {
    return {
      toolName,
      toolCallId: rawToolCall.toolCallId,
      input: rawToolCall.input,
      error: `Tool ${toolName} not found`,
    }
  }
  const validName = toolName as T

  const processedParameters: Record<string, any> = {}
  for (const [param, val] of Object.entries(rawToolCall.input ?? {})) {
    processedParameters[param] = val
  }

  // Add the required codebuff_end_step parameter with the correct value for this tool if requested
  if (autoInsertEndStepParam) {
    processedParameters[endsAgentStepParam] =
      toolDefs[validName].endsAgentStep
  }

  const paramsSchema = toolDefs[validName].endsAgentStep
    ? (
        toolDefs[validName]
          .parameters satisfies z.ZodObject as z.ZodObject
      ).extend({
        [endsAgentStepParam]: z.literal(
          toolDefs[validName].endsAgentStep,
        ),
      })
    : toolDefs[validName].parameters
  const result = paramsSchema.safeParse(processedParameters)

  if (!result.success) {
    return {
      toolName: validName,
      toolCallId: rawToolCall.toolCallId,
      input: rawToolCall.input,
      error: `Invalid parameters for ${validName}: ${JSON.stringify(
        result.error.issues,
        null,
        2,
      )}`,
    }
  }

  if (endsAgentStepParam in result.data) {
    delete result.data[endsAgentStepParam]
  }

  return {
    toolName: validName,
    input: result.data,
    toolCallId: rawToolCall.toolCallId,
  } as CodebuffToolCall<T>
}

export interface ExecuteToolCallParams<T extends string = ToolName> {
  toolName: T
  input: Record<string, unknown>
  toolCalls: (CodebuffToolCall | CustomToolCall)[]
  toolResults: ToolResult[]
  previousToolCallFinished: Promise<void>
  agentTemplate: AgentTemplate
  fileContext: ProjectFileContext
  agentStepId: string
  clientSessionId: string
  userInputId: string
  fullResponse: string
  onResponseChunk: (chunk: string | PrintModeEvent) => void
  state: Record<string, any>
  userId: string | undefined
  autoInsertEndStepParam?: boolean
  env: AgentRuntimeEnvironment
}

export function executeToolCall<T extends ToolName>({
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
  fullResponse,
  onResponseChunk,
  state,
  userId,
  autoInsertEndStepParam = false,
  env,
}: ExecuteToolCallParams<T>): Promise<void> {
  const toolCall: CodebuffToolCall<T> | ToolCallError = parseRawToolCall<T>(
    {
      toolName,
      toolCallId: generateCompactId(),
      input,
    },
    env.tools.definitions,
    autoInsertEndStepParam,
  )
  if ('error' in toolCall) {
    toolResults.push({
      toolName,
      toolCallId: toolCall.toolCallId,
      output: {
        type: 'text',
        value: toolCall.error,
      },
    })
    env.logger?.debug(
      { toolCall, error: toolCall.error },
      `${toolName} error: ${toolCall.error}`,
    )
    return previousToolCallFinished
  }

  onResponseChunk({
    type: 'tool_call',
    toolCallId: toolCall.toolCallId,
    toolName,
    input: toolCall.input,
  })

  toolCalls.push(toolCall)

  // Filter out restricted tools in ask mode unless exporting summary
  if (!agentTemplate.toolNames.includes(toolCall.toolName)) {
    toolResults.push({
      toolName,
      toolCallId: toolCall.toolCallId,
      output: {
        type: 'text',
        value: `Tool \`${toolName}\` is not currently available. Make sure to only use tools listed in the system instructions.`,
      },
    })
    return previousToolCallFinished
  }

  // Check if user input is still live
  if (!env.inputGate.check(userId, userInputId, clientSessionId)) {
    toolResults.push({
      toolName,
      toolCallId: toolCall.toolCallId,
      output: {
        type: 'text',
        value: 'User input cancelled',
      },
    })
    return previousToolCallFinished
  }

  // Check if this is a server-side tool that should be handled directly
  const serverSideHandler = env.tools.handlers[toolCall.toolName]
  if (serverSideHandler) {
    return previousToolCallFinished.then(async () => {
      try {
        const handlerResult = serverSideHandler({
          previousToolCallFinished: Promise.resolve(),
          toolCall,
          fileContext,
          state,
          clientSessionId,
          userInputId,
        })
        
        // Handle the result which may be a direct value or an object with result and state
        let resultValue: string
        
        if (handlerResult && typeof handlerResult === 'object' && 'result' in handlerResult) {
          // Handler returned { result: Promise<string>, state: {...} }
          resultValue = await handlerResult.result
          if (handlerResult.state) {
            // Merge the returned state into our current state
            // Special handling for agentState to ensure proper reference updates
            Object.assign(state, handlerResult.state)
          }
        } else {
          // Handler returned a direct value or Promise
          const result = await handlerResult
          resultValue = typeof result === 'string' ? result : (result?.value || 'Success')
        }
        
        const toolResult = {
          toolName,
          toolCallId: toolCall.toolCallId,
          output: {
            type: 'text' as const,
            value: resultValue,
          },
        }
        
        env.logger?.debug(
          { input, toolResult },
          `${toolName} server-side tool call & result (${toolResult.toolCallId})`,
        )

        onResponseChunk({
          type: 'tool_result',
          toolCallId: toolResult.toolCallId,
          output: toolResult.output,
        })

        toolResults.push(toolResult)

        state.messages.push({
          role: 'user' as const,
          content: asSystemMessage(renderToolResults([toolResult])),
        })
      } catch (error) {
        const errorMessage = `Server-side tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        const toolResult = {
          toolName,
          toolCallId: toolCall.toolCallId,
          output: {
            type: 'text' as const,
            value: errorMessage,
          },
        }
        
        env.logger?.error(
          { input, error, toolResult },
          `${toolName} server-side tool execution error`,
        )

        onResponseChunk({
          type: 'tool_result',
          toolCallId: toolResult.toolCallId,
          output: toolResult.output,
        })

        toolResults.push(toolResult)

        state.messages.push({
          role: 'user' as const,
          content: asSystemMessage(renderToolResults([toolResult])),
        })
      }
    })
  }

  // For client tools, request execution from client
  return previousToolCallFinished.then(async () => {
    const clientToolResult = await env.io.requestToolCall(
      userInputId,
      toolCall.toolName,
      toolCall.input,
    )
    
    const result = clientToolResult.error ??
      (clientToolResult.output?.type === 'text'
        ? clientToolResult.output.value
        : 'undefined')

    const toolResult = {
      toolName,
      toolCallId: toolCall.toolCallId,
      output: {
        type: 'text' as const,
        value: result as string,
      },
    }
    
    env.logger?.debug(
      { input, toolResult },
      `${toolName} client tool call & result (${toolResult.toolCallId})`,
    )
    
    if (result === undefined) {
      return
    }

    onResponseChunk({
      type: 'tool_result',
      toolCallId: toolResult.toolCallId,
      output: toolResult.output,
    })

    toolResults.push(toolResult)

    state.messages.push({
      role: 'user' as const,
      content: asSystemMessage(renderToolResults([toolResult])),
    })
  })
}

export function parseRawCustomToolCall(
  customToolDefs: z.infer<typeof customToolDefinitionsSchema>,
  rawToolCall: {
    toolName: string
    toolCallId: string
    input: Record<string, unknown>
  },
  autoInsertEndStepParam: boolean = false,
): CustomToolCall | ToolCallError {
  const toolName = rawToolCall.toolName

  if (!(toolName in customToolDefs)) {
    return {
      toolName,
      toolCallId: rawToolCall.toolCallId,
      input: rawToolCall.input,
      error: `Tool ${toolName} not found`,
    }
  }

  const processedParameters: Record<string, any> = {}
  for (const [param, val] of Object.entries(rawToolCall.input ?? {})) {
    processedParameters[param] = val
  }

  // Add the required codebuff_end_step parameter with the correct value for this tool if requested
  if (autoInsertEndStepParam) {
    processedParameters[endsAgentStepParam] =
      customToolDefs[toolName].endsAgentStep
  }

  const jsonSchema = JSON.parse(
    JSON.stringify(customToolDefs[toolName].inputJsonSchema),
  )
  if (customToolDefs[toolName].endsAgentStep) {
    if (!jsonSchema.properties) {
      jsonSchema.properties = {}
    }
    jsonSchema.properties[endsAgentStepParam] = {
      const: true,
      type: 'boolean',
      description: 'Easp flag must be set to true',
    }
    if (!jsonSchema.required) {
      jsonSchema.required = []
    }
    jsonSchema.required.push(endsAgentStepParam)
  }
  const paramsSchema = convertJsonSchemaToZod(jsonSchema)
  const result = paramsSchema.safeParse(
    processedParameters,
  ) as z.ZodSafeParseResult<any>

  if (!result.success) {
    return {
      toolName: toolName,
      toolCallId: rawToolCall.toolCallId,
      input: rawToolCall.input,
      error: `Invalid parameters for ${toolName}: ${JSON.stringify(
        result.error.issues,
        null,
        2,
      )}`,
    }
  }

  const input = JSON.parse(JSON.stringify(rawToolCall.input))
  if (endsAgentStepParam in input) {
    delete input[endsAgentStepParam]
  }
  return {
    toolName: toolName,
    input,
    toolCallId: rawToolCall.toolCallId,
  }
}

export function executeCustomToolCall({
  toolName,
  input,
  toolCalls,
  toolResults,
  previousToolCallFinished,
  agentTemplate,
  fileContext,
  clientSessionId,
  userInputId,
  onResponseChunk,
  state,
  userId,
  autoInsertEndStepParam = false,
  env,
}: ExecuteToolCallParams<string>): Promise<void> {
  const toolCall: CustomToolCall | ToolCallError = parseRawCustomToolCall(
    fileContext.customToolDefinitions,
    {
      toolName,
      toolCallId: generateCompactId(),
      input,
    },
    autoInsertEndStepParam,
  )
  if ('error' in toolCall) {
    toolResults.push({
      toolName,
      toolCallId: toolCall.toolCallId,
      output: {
        type: 'text',
        value: toolCall.error,
      },
    })
    env.logger?.debug(
      { toolCall, error: toolCall.error },
      `${toolName} error: ${toolCall.error}`,
    )
    return previousToolCallFinished
  }

  onResponseChunk({
    type: 'tool_call',
    toolCallId: toolCall.toolCallId,
    toolName,
    input: toolCall.input,
  })

  toolCalls.push(toolCall)

  // Filter out restricted tools in ask mode unless exporting summary
  if (!(agentTemplate.toolNames as string[]).includes(toolCall.toolName)) {
    toolResults.push({
      toolName,
      toolCallId: toolCall.toolCallId,
      output: {
        type: 'text',
        value: `Tool \`${toolName}\` is not currently available. Make sure to only use tools listed in the system instructions.`,
      },
    })
    return previousToolCallFinished
  }

  return previousToolCallFinished
    .then(async () => {
      if (!env.inputGate.check(userId, userInputId, clientSessionId)) {
        return ''
      }

      const clientToolResult = await env.io.requestToolCall(
        userInputId,
        toolCall.toolName,
        toolCall.input,
      )
      return (
        clientToolResult.error ??
        (clientToolResult.output?.type === 'text'
          ? clientToolResult.output.value
          : 'undefined')
      )
    })
    .then((result) => {
      const toolResult = {
        toolName,
        toolCallId: toolCall.toolCallId,
        output: {
          type: 'text' as const,
          value: result as string,
        },
      }
      env.logger?.debug(
        { input, toolResult },
        `${toolName} custom tool call & result (${toolResult.toolCallId})`,
      )
      if (result === undefined) {
        return
      }

      onResponseChunk({
        type: 'tool_result',
        toolCallId: toolResult.toolCallId,
        output: toolResult.output,
      })

      toolResults.push(toolResult)

      state.messages.push({
        role: 'user' as const,
        content: asSystemMessage(renderToolResults([toolResult])),
      })
    })
}
