import { toolJsonContent } from '@codebuff/common/util/messages'
import { generateCompactId } from '@codebuff/common/util/string'
import { type ToolCallPart } from 'ai'
import { cloneDeep } from 'lodash'
import { convertJsonSchemaToZod } from 'zod-from-json-schema'

import { checkLiveUserInput } from '../live-user-inputs'
import { getMCPToolData } from '../mcp'
import { codebuffToolDefs } from './definitions/list'
import { codebuffToolHandlers } from './handlers/list'

import type { AgentTemplate } from '../templates/types'
import type { CodebuffToolHandlerFunction } from './handlers/handler-function-type'
import type { ToolName } from '@codebuff/common/tools/constants'
import type {
  ClientToolCall,
  ClientToolName,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { ToolMessage } from '@codebuff/common/types/messages/codebuff-message'
import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  customToolDefinitionsSchema,
  ProjectFileContext,
} from '@codebuff/common/util/file'
import type z from 'zod/v4'

export type CustomToolCall = {
  toolName: string
  input: Record<string, unknown>
} & Omit<ToolCallPart, 'type'>

export type ToolCallError = {
  toolName?: string
  input: Record<string, unknown>
  error: string
} & Pick<CodebuffToolCall, 'toolCallId'>

export function parseRawToolCall<T extends ToolName = ToolName>(params: {
  rawToolCall: {
    toolName: T
    toolCallId: string
    input: Record<string, unknown>
  }
  autoInsertEndStepParam?: boolean
}): CodebuffToolCall<T> | ToolCallError {
  const { rawToolCall, autoInsertEndStepParam = false } = params
  const toolName = rawToolCall.toolName

  if (!(toolName in codebuffToolDefs)) {
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

  const paramsSchema = codebuffToolDefs[validName].parameters

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

  return {
    toolName: validName,
    input: result.data,
    toolCallId: rawToolCall.toolCallId,
  } as CodebuffToolCall<T>
}

export type ExecuteToolCallParams<T extends string = ToolName> = {
  toolName: T
  input: Record<string, unknown>
  toolCalls: (CodebuffToolCall | CustomToolCall)[]
  toolResults: ToolMessage[]
  toolCallId?: string
  toolResultsToAddAfterStream: ToolMessage[]
  previousToolCallFinished: Promise<void>
  agentTemplate: AgentTemplate
  fileContext: ProjectFileContext
  runId: string
  agentStepId: string
  clientSessionId: string
  userInputId: string
  fullResponse: string
  repoId: string | undefined
  repoUrl: string | undefined
  signal: AbortSignal
  onResponseChunk: (chunk: string | PrintModeEvent) => void
  state: Record<string, any>
  userId: string | undefined
  autoInsertEndStepParam?: boolean
  excludeToolFromMessageHistory?: boolean
  fetch: typeof globalThis.fetch
  fromHandleSteps?: boolean
  onCostCalculated: (credits: number) => Promise<void>
  ancestorRunIds: string[]
} & AgentRuntimeDeps &
  AgentRuntimeScopedDeps

export function executeToolCall<T extends ToolName>(
  params: ExecuteToolCallParams<T>,
): Promise<void> {
  const {
    toolName,
    input,
    toolCalls,
    toolResults,
    toolResultsToAddAfterStream,
    previousToolCallFinished,
    agentTemplate,
    fileContext,
    agentStepId,
    clientSessionId,
    userInputId,
    fullResponse,
    onResponseChunk,
    state,
    repoId,
    repoUrl,
    userId,
    autoInsertEndStepParam = false,
    excludeToolFromMessageHistory = false,
    requestToolCall,
    requestMcpToolData,
    logger,
    fromHandleSteps = false,
    onCostCalculated,
  } = params

  const toolCallId = params.toolCallId ?? generateCompactId()
  onResponseChunk({
    type: 'tool_call',
    toolCallId: toolCallId ?? generateCompactId(),
    toolName,
    input,
    // Only include agentId for subagents (agents with a parent)
    ...(state.agentState?.parentId && { agentId: state.agentState.agentId }),
    // Include includeToolCall flag if explicitly set to false
    ...(excludeToolFromMessageHistory && { includeToolCall: false }),
  })

  const toolCall: CodebuffToolCall<T> | ToolCallError = parseRawToolCall<T>({
    rawToolCall: {
      toolName,
      toolCallId,
      input,
    },
    autoInsertEndStepParam,
  })
  if ('error' in toolCall) {
    const toolResult: ToolMessage = {
      role: 'tool',
      toolName,
      toolCallId: toolCall.toolCallId,
      content: [
        toolJsonContent({
          errorMessage: toolCall.error,
        }),
      ],
    }
    toolResults.push(cloneDeep(toolResult))
    toolResultsToAddAfterStream.push(cloneDeep(toolResult))
    logger.debug(
      { toolCall, error: toolCall.error },
      `${toolName} error: ${toolCall.error}`,
    )
    return previousToolCallFinished
  }

  toolCalls.push(toolCall)

  // Filter out restricted tools
  if (
    !agentTemplate.toolNames.includes(toolCall.toolName) &&
    !fromHandleSteps
  ) {
    const toolResult: ToolMessage = {
      role: 'tool',
      toolName,
      toolCallId: toolCall.toolCallId,
      content: [
        toolJsonContent({
          errorMessage: `Tool \`${toolName}\` is not currently available. Make sure to only use tools listed in the system instructions.`,
        }),
      ],
    }
    toolResults.push(cloneDeep(toolResult))
    toolResultsToAddAfterStream.push(cloneDeep(toolResult))
    return previousToolCallFinished
  }

  // Cast to any to avoid type errors
  const handler = codebuffToolHandlers[
    toolName
  ] as unknown as CodebuffToolHandlerFunction<T>
  const { result: toolResultPromise, state: stateUpdate } = handler({
    ...params,
    previousToolCallFinished,
    writeToClient: onResponseChunk,
    requestClientToolCall: (async (
      clientToolCall: ClientToolCall<T extends ClientToolName ? T : never>,
    ) => {
      if (!checkLiveUserInput(params)) {
        return []
      }

      const clientToolResult = await requestToolCall({
        userInputId,
        toolName: clientToolCall.toolName,
        input: clientToolCall.input,
      })
      return clientToolResult.output as CodebuffToolOutput<T>
    }) as any,
    toolCall,
    getLatestState: () => state,
    state,
  })

  for (const [key, value] of Object.entries(stateUpdate ?? {})) {
    if (key === 'agentState' && typeof value === 'object' && value !== null) {
      // Replace the agentState reference to ensure all updates are captured
      state.agentState = value
    } else if (key === 'creditsUsed') {
      // Handle both synchronous and asynchronous creditsUsed values
      if (value instanceof Promise) {
        // Store the promise to be awaited later
        state.creditsUsed = value
      } else if (typeof value === 'number') {
        onCostCalculated(value)
      }
    } else {
      state[key] = value
    }
  }

  return toolResultPromise.then(async (result) => {
    const toolResult: ToolMessage = {
      role: 'tool',
      toolName,
      toolCallId: toolCall.toolCallId,
      content: result,
    }
    logger.debug(
      { input, toolResult },
      `${toolName} tool call & result (${toolResult.toolCallId})`,
    )
    if (result === undefined) {
      return
    }

    onResponseChunk({
      type: 'tool_result',
      toolCallId: toolResult.toolCallId,
      toolName: toolResult.toolName,
      output: toolResult.content,
    })

    toolResults.push(toolResult)

    if (!excludeToolFromMessageHistory) {
      state.messages.push(toolResult)
    }

    // After tool completes, resolve any pending creditsUsed promise
    if (state.creditsUsed instanceof Promise) {
      const credits = await state.creditsUsed
      if (typeof credits === 'number') {
        onCostCalculated(credits)
        logger.debug(
          { credits, totalCredits: state.agentState.creditsUsed },
          `Added ${credits} credits from ${toolName} to agent state`,
        )
      }
      delete state.creditsUsed
    }
  })
}

export function parseRawCustomToolCall(params: {
  customToolDefs: z.infer<typeof customToolDefinitionsSchema>
  rawToolCall: {
    toolName: string
    toolCallId: string
    input: Record<string, unknown>
  }
  autoInsertEndStepParam?: boolean
}): CustomToolCall | ToolCallError {
  const { customToolDefs, rawToolCall, autoInsertEndStepParam = false } = params
  const toolName = rawToolCall.toolName

  if (!(toolName in customToolDefs) && !toolName.includes('/')) {
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

  const jsonSchema = cloneDeep(customToolDefs[toolName].inputJsonSchema)
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
  return {
    toolName: toolName,
    input,
    toolCallId: rawToolCall.toolCallId,
  }
}

export async function executeCustomToolCall(
  params: ExecuteToolCallParams<string>,
): Promise<void> {
  const {
    toolName,
    input,
    toolCalls,
    toolResults,
    toolCallId,
    toolResultsToAddAfterStream,
    previousToolCallFinished,
    agentTemplate,
    fileContext,
    userInputId,
    onResponseChunk,
    state,
    autoInsertEndStepParam = false,
    excludeToolFromMessageHistory = false,
    requestToolCall,
    logger,
    fromHandleSteps = false,
  } = params
  const toolCall: CustomToolCall | ToolCallError = parseRawCustomToolCall({
    customToolDefs: await getMCPToolData({
      ...params,
      toolNames: agentTemplate.toolNames,
      mcpServers: agentTemplate.mcpServers,
      writeTo: cloneDeep(fileContext.customToolDefinitions),
    }),
    rawToolCall: {
      toolName,
      toolCallId: toolCallId ?? generateCompactId(),
      input,
    },
    autoInsertEndStepParam,
  })
  if ('error' in toolCall) {
    const toolResult: ToolMessage = {
      role: 'tool',
      toolName,
      toolCallId: toolCall.toolCallId,
      content: [
        toolJsonContent({
          errorMessage: toolCall.error,
        }),
      ],
    }
    toolResults.push(cloneDeep(toolResult))
    toolResultsToAddAfterStream.push(cloneDeep(toolResult))
    logger.debug(
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
    // Only include agentId for subagents (agents with a parent)
    ...(state.agentState?.parentId && { agentId: state.agentState.agentId }),
    // Include includeToolCall flag if explicitly set to false
    ...(excludeToolFromMessageHistory && { includeToolCall: false }),
  })

  toolCalls.push(toolCall)

  // Filter out restricted tools in ask mode unless exporting summary
  if (
    !(agentTemplate.toolNames as string[]).includes(toolCall.toolName) &&
    !fromHandleSteps &&
    !(
      toolCall.toolName.includes('/') &&
      toolCall.toolName.split('/')[0] in agentTemplate.mcpServers
    )
  ) {
    const toolResult: ToolMessage = {
      role: 'tool',
      toolName,
      toolCallId: toolCall.toolCallId,
      content: [
        toolJsonContent({
          errorMessage: `Tool \`${toolName}\` is not currently available. Make sure to only use tools listed in the system instructions.`,
        }),
      ],
    }
    toolResults.push(cloneDeep(toolResult))
    toolResultsToAddAfterStream.push(cloneDeep(toolResult))
    return previousToolCallFinished
  }

  return previousToolCallFinished
    .then(async () => {
      if (!checkLiveUserInput(params)) {
        return null
      }

      const toolName = toolCall.toolName.includes('/')
        ? toolCall.toolName.split('/').slice(1).join('/')
        : toolCall.toolName
      const clientToolResult = await requestToolCall({
        userInputId,
        toolName,
        input: toolCall.input,
        mcpConfig: toolCall.toolName.includes('/')
          ? agentTemplate.mcpServers[toolCall.toolName.split('/')[0]]
          : undefined,
      })
      return clientToolResult.output satisfies ToolResultOutput[]
    })
    .then((result) => {
      if (result === null) {
        return
      }
      const toolResult = {
        role: 'tool',
        toolName,
        toolCallId: toolCall.toolCallId,
        content: result,
      } satisfies ToolMessage
      logger.debug(
        { input, toolResult },
        `${toolName} custom tool call & result (${toolResult.toolCallId})`,
      )
      if (result === undefined) {
        return
      }

      onResponseChunk({
        type: 'tool_result',
        toolName: toolResult.toolName,
        toolCallId: toolResult.toolCallId,
        output: toolResult.content,
      })

      toolResults.push(toolResult)

      if (!excludeToolFromMessageHistory) {
        state.messages.push(toolResult)
      }
      return
    })
}
