import { endsAgentStepParam, toolNames } from '@codebuff/common/tools/constants'
import { toolParams } from '@codebuff/common/tools/list'
import { generateCompactId } from '@codebuff/common/util/string'
import { cloneDeep } from 'lodash'

import { getMCPToolData } from '../mcp'
import { MCP_TOOL_SEPARATOR } from '../mcp-constants'
import { getAgentShortName, getAgentToolName } from '../templates/prompts'
import {
  formatValidationIssues,
  type ValidationIssue,
} from '../util/format-validation-issues'
import { formatValueForError } from '../util/format-value'
import { codebuffToolHandlers } from './handlers/list'
import {
  getMatchingSpawn,
  isBaseAgent,
  toolNotAgentError,
} from './handlers/tool/spawn-agent-utils'
import { getAgentTemplate } from '../templates/agent-registry'
import { ensureZodSchema } from './prompts'

import type { AgentTemplate } from '../templates/types'
import type { CodebuffToolHandlerFunction } from './handlers/handler-function-type'
import type { FileProcessingState } from './handlers/tool/write-file'
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
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ToolMessage } from '@codebuff/common/types/messages/codebuff-message'
import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'
import type { ProviderMetadata } from '@codebuff/common/types/messages/provider-metadata'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  AgentTemplateType,
  AgentState,
  Subgoal,
} from '@codebuff/common/types/session-state'
import type {
  CustomToolDefinitions,
  ProjectFileContext,
} from '@codebuff/common/util/file'
import type { ToolCallPart, ToolSet } from 'ai'

export type CustomToolCall = {
  toolName: string
  input: Record<string, unknown>
} & Omit<ToolCallPart, 'type'>

export type ToolCallError = {
  toolName?: string
  input: unknown
  error: string
} & Pick<CodebuffToolCall, 'toolCallId'>

const bareStringFieldRepairAllowlist: Partial<
  Record<string, readonly string[]>
> = {
  code_search: ['pattern'],
  find_files: ['prompt'],
  find_files_matching_content: ['pattern'],
  glob: ['pattern'],
  list_directory: ['path'],
  lookup_agent_info: ['agentId'],
  read_files: ['paths'],
  read_subtree: ['paths'],
  skill: ['name'],
  web_search: ['query'],
}

function repairBareStringFieldObject(input: string, toolName: string): unknown {
  const allowedFields = bareStringFieldRepairAllowlist[toolName]
  if (!allowedFields) {
    return undefined
  }

  const match = input
    .trim()
    .match(
      /^\{\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*:\s*([^"{}\[\],][^{}\[\],]*)\s*\}$/,
    )
  if (!match) {
    return undefined
  }

  const [, field, rawValue] = match
  if (!allowedFields.includes(field)) {
    return undefined
  }

  const value = rawValue.trim()
  if (!value || value === 'null' || value === 'undefined') {
    return undefined
  }

  return { [field]: value }
}

function parseStringifiedToolInput(
  input: unknown,
  toolName: string,
): { input: unknown; parseError?: string } {
  let parsed = input
  let parseError: string | undefined

  // Some providers/models double-encode tool arguments, for example an input
  // value like "\"{\\\"path\\\":\\\"file.ts\\\"}\"". Repeated JSON.parse
  // handles that before falling back to narrow, tool-specific repairs.
  for (let i = 0; i < 3 && typeof parsed === 'string'; i++) {
    const stringInput = parsed
    try {
      parsed = JSON.parse(stringInput)
      parseError = undefined
    } catch (error) {
      const repaired = repairBareStringFieldObject(stringInput, toolName)
      if (repaired !== undefined) {
        parsed = repaired
        parseError = undefined
      } else {
        parseError = error instanceof Error ? error.message : String(error)
      }
      break
    }
  }

  return { input: parsed, parseError }
}

function stringInputError(
  toolName: string,
  toolCallId: string,
  parseError?: string,
): ToolCallError {
  const parseDetails = parseError
    ? ` Parsing as JSON failed: ${parseError}. The arguments may be malformed or incomplete.`
    : ' Parsing succeeded, but the parsed value was still a string.'
  return {
    toolName,
    toolCallId,
    input: {},
    error: `Invalid parameters for ${toolName}: expected the tool arguments to be an object, but received a string.${parseDetails} Re-issue the tool call with the full arguments object and properly escaped string values.`,
  }
}

function getFieldSpecificHint(
  toolName: string,
  issues: ValidationIssue[],
): string | undefined {
  // Fix D: when the model emits the wrong JS type for a known-typed field,
  // surface the exact expected shape so it can self-correct on the next attempt
  // instead of looping on a generic Zod message. This covers the three fields
  // most commonly emitted with the wrong type during edit-tool calls.
  if (toolName !== 'str_replace' && toolName !== 'propose_str_replace') {
    return undefined
  }

  const paths = new Set(
    issues
      .map((issue) => issue.path?.map((segment) => String(segment)).join('.'))
      .filter((p): p is string => Boolean(p)),
  )
  const fieldNames = new Set(
    issues.flatMap((issue) => issue.path?.map((segment) => String(segment)) ?? []),
  )

  if (
    paths.has('atomic') ||
    fieldNames.has('atomic') ||
    // Equivalent fields on other edit tools, kept for forward symmetry.
    fieldNames.has('useAtomicBatch')
  ) {
    return [
      'Hint: `atomic` must be a boolean (true/false), not a string. Omit it entirely for the default (false).',
      'Example: { "path": "file.ts", "atomic": true, "replacements": [{ ... }] }',
    ].join('\n')
  }

  if (paths.has('basedOnRead') || fieldNames.has('basedOnRead')) {
    return [
      'Hint: `basedOnRead` must be a read-capability token string returned by read_files (e.g. "cap.<base64>") OR an object { startLine, endLine, hash }. A wrapped object like { "$text": "..." } is not accepted.',
      'Copy the `readCapability` value verbatim from the read_files range header output.',
    ].join('\n')
  }

  if (paths.has('occurrenceIndex') || fieldNames.has('occurrenceIndex')) {
    return [
      'Hint: `occurrenceIndex` must be a positive integer (1-indexed), not a string. Omit it unless you need to target a specific duplicate.',
    ].join('\n')
  }

  return undefined
}

function getToolValidationHint(
  toolName: string,
  issues?: ValidationIssue[],
): string | undefined {
  const fieldHint = issues ? getFieldSpecificHint(toolName, issues) : undefined

  if (toolName === 'str_replace' || toolName === 'propose_str_replace') {
    const base = [
      'Expected shape: { "path": string, "replacements": [{ "oldString": string, "newString": string, "allowMultiple"?: boolean }] }.',
      'If a previous edit failed, stop retrying from memory: re-read the exact current lines with read_files before issuing another replacement.',
    ].join('\n')
    return fieldHint ? `${base}\n\n${fieldHint}` : base
  }
  if (toolName === 'write_file' || toolName === 'propose_write_file') {
    const base =
      'Expected shape: { "path": string, "instructions": string, "content": string }. Quote string values and escape newlines/quotes inside content.'
    return fieldHint ? `${base}\n\n${fieldHint}` : base
  }
  return fieldHint
}

function isFileChangingTool(toolName: string): boolean {
  return (
    toolName === 'apply_patch' ||
    toolName === 'apply_smart_patch' ||
    toolName === 'edit_transaction' ||
    toolName === 'replace_range' ||
    toolName === 'rewrite_symbol' ||
    toolName === 'str_replace' ||
    toolName === 'write_file'
  )
}

export function parseRawToolCall<T extends ToolName = ToolName>(params: {
  rawToolCall: {
    toolName: T
    toolCallId: string
    input: unknown
    providerOptions?: ProviderMetadata
  }
}): CodebuffToolCall<T> | ToolCallError {
  const { rawToolCall } = params
  const toolName = rawToolCall.toolName

  const processedParameters = parseStringifiedToolInput(
    rawToolCall.input,
    toolName,
  )
  const paramsSchema = toolParams[toolName].inputSchema

  if (typeof processedParameters.input === 'string') {
    return stringInputError(
      toolName,
      rawToolCall.toolCallId,
      processedParameters.parseError,
    )
  }

  const result = paramsSchema.safeParse(processedParameters.input)

  if (!result.success) {
    const issues = result.error.issues as ValidationIssue[]
    const hint = getToolValidationHint(toolName, issues)
    const summary = formatValidationIssues({ issues, toolName })
    const validationDetails = JSON.stringify(result.error.issues, null, 2)
    return {
      toolName,
      toolCallId: rawToolCall.toolCallId,
      input: rawToolCall.input,
      error: `Invalid parameters for ${toolName}: ${summary}\n\nRaw validation issues:\n${validationDetails}${hint ? `\n\n${hint}` : ''}`,
    }
  }

  if (endsAgentStepParam in result.data) {
    delete result.data[endsAgentStepParam]
  }

  return {
    toolName,
    input: result.data,
    toolCallId: rawToolCall.toolCallId,
    ...(rawToolCall.providerOptions && {
      providerOptions: rawToolCall.providerOptions,
    }),
  } as CodebuffToolCall<T>
}

export type ExecuteToolCallParams<T extends string = ToolName> = {
  toolName: T
  input: Record<string, unknown>
  autoInsertEndStepParam?: boolean
  excludeToolFromMessageHistory?: boolean

  agentContext: Record<string, Subgoal>
  agentState: AgentState
  agentStepId: string
  ancestorRunIds: string[]
  agentTemplate: AgentTemplate
  clientSessionId: string
  fileContext: ProjectFileContext
  fileProcessingState: FileProcessingState
  fingerprintId: string
  fromHandleSteps?: boolean
  fullResponse: string
  localAgentTemplates: Record<string, AgentTemplate>
  logger: Logger
  previousToolCallFinished: Promise<void>
  // True when this is a named-path write waiting behind a prior same-path write
  // that is still in flight. Threaded through so the emitted `tool_call` event
  // can carry `queued`, and so a `tool_start` transition can fire once the
  // barrier resolves. Omitted (undefined) for read-only tools and custom/
  // unknown-path writes.
  queued?: boolean
  prompt: string | undefined
  providerOptions?: ProviderMetadata
  repoId: string | undefined
  repoUrl: string | undefined
  runId: string
  signal: AbortSignal
  system: string
  tools: ToolSet
  toolCallId: string | undefined
  toolCalls: (CodebuffToolCall | CustomToolCall)[]
  toolCallsToAddToMessageHistory: (CodebuffToolCall | CustomToolCall)[]
  toolResults: ToolMessage[]
  toolResultsToAddToMessageHistory: ToolMessage[]
  userId: string | undefined
  userInputId: string

  fetch: typeof globalThis.fetch
  onCostCalculated: (providerCostCents: number) => Promise<void>
  onResponseChunk: (chunk: string | PrintModeEvent) => void
} & AgentRuntimeDeps &
  AgentRuntimeScopedDeps

export async function executeToolCall<T extends ToolName>(
  params: ExecuteToolCallParams<T>,
): Promise<void> {
  const {
    toolName,
    input,
    excludeToolFromMessageHistory = false,
    fromHandleSteps = false,

    agentState,
    agentTemplate,
    logger,
    previousToolCallFinished,
    toolCalls,
    toolCallsToAddToMessageHistory,
    toolResults,
    toolResultsToAddToMessageHistory,
    userInputId,

    onCostCalculated,
    onResponseChunk,
    requestToolCall,
    queued,
  } = params
  const toolCallId = params.toolCallId ?? generateCompactId()

  const toolCall: CodebuffToolCall<T> | ToolCallError = parseRawToolCall<T>({
    rawToolCall: {
      toolName,
      toolCallId,
      input,
      providerOptions: params.providerOptions,
    },
  })

  // Filter out restricted tools - emit error instead of tool call/result
  // This prevents the CLI from showing tool calls that the agent doesn't have permission to use
  if (
    toolCall.toolName &&
    !agentTemplate.toolNames.includes(toolCall.toolName) &&
    !fromHandleSteps
  ) {
    // Emit an error event instead of tool call/result pair
    // The stream parser will convert this to a user message for proper API compliance
    onResponseChunk({
      type: 'error',
      message: `Tool \`${toolName}\` is not currently available. Make sure to only use tools provided at the start of the conversation AND that you most recently have permission to use.`,
    })
    return previousToolCallFinished
  }

  if ('error' in toolCall) {
    const formattedInput = formatValueForError(input)
    onResponseChunk({
      type: 'error',
      message: `${toolCall.error}\n\nOriginal tool call input:\n${formattedInput}`,
    })
    logger.debug(
      { toolCall, error: toolCall.error },
      `${toolName} error: ${toolCall.error}`,
    )
    return previousToolCallFinished
  }

  const canSuggestFollowups = (agentState as { canSuggestFollowups?: boolean })
    .canSuggestFollowups
  if (toolName === 'suggest_followups') {
    if (
      canSuggestFollowups === false ||
      toolCalls.some((call) => isFileChangingTool(call.toolName))
    ) {
      onResponseChunk({
        type: 'error',
        message:
          'Tool `suggest_followups` is not available yet. Finish the requested work first; for edited code, wait until the automated validation/reviewer gate has passed and you have written a user-visible completion summary.',
      })
      return previousToolCallFinished
    }
  } else if (
    canSuggestFollowups === true &&
    isFileChangingTool(toolName) &&
    toolCalls.some((call) => call.toolName === 'suggest_followups')
  ) {
    onResponseChunk({
      type: 'error',
      message:
        'File-changing tools are not available after suggest_followups in the same step. If more edits are needed, make them before final follow-up suggestions so validation and review can rerun.',
    })
    return previousToolCallFinished
  }

  // Retract suggest_followups permission for the remainder of this step as
  // soon as a file-changing tool executes. canSuggestFollowups is computed
  // once at the top of the orchestrator's loop from the prior gate state;
  // without this, an LLM could make edits in one tool-call batch and then
  // call suggest_followups in a later batch of the same step (before the
  // post-step edits-detected block re-evaluates the gate), bypassing the
  // validation/reviewer gate. The same-batch case is already covered by the
  // toolCalls.some(isFileChangingTool) check above; this covers cross-batch.
  if (isFileChangingTool(toolName) && canSuggestFollowups !== false) {
    ;(agentState as { canSuggestFollowups?: boolean }).canSuggestFollowups =
      false
  }

  // TODO: Allow tools to provide a validation function, and move this logic into the spawn_agents validation function.
  // Pre-validate spawn_agents to filter out non-existent agents before streaming
  let effectiveInput = toolCall.input as Record<string, unknown>
  if (toolName === 'spawn_agents') {
    const agents = effectiveInput.agents
    if (Array.isArray(agents)) {
      const isParentBaseAgent = isBaseAgent(agentTemplate.id)

      const validationResults = await Promise.allSettled(
        agents.map(async (agent) => {
          if (!agent || typeof agent !== 'object') {
            return { valid: false as const, error: 'Invalid agent entry' }
          }
          const agentTypeStr = (agent as Record<string, unknown>).agent_type
          if (typeof agentTypeStr !== 'string' || !agentTypeStr) {
            return {
              valid: false as const,
              error: 'Agent entry missing agent_type',
            }
          }

          let agentIdToLoad = agentTypeStr
          if (!isParentBaseAgent) {
            const matchingSpawn = getMatchingSpawn(
              agentTemplate.spawnableAgents,
              agentTypeStr,
            )
            if (!matchingSpawn) {
              if (toolNames.includes(agentTypeStr as ToolName)) {
                return {
                  valid: false as const,
                  error: toolNotAgentError(agentTypeStr),
                }
              }
              return {
                valid: false as const,
                error: `Agent "${agentTypeStr}" is not available to spawn`,
              }
            }
            agentIdToLoad = matchingSpawn
          }

          try {
            const template = await getAgentTemplate({
              agentId: agentIdToLoad,
              localAgentTemplates: params.localAgentTemplates,
              fetchAgentFromDatabase: params.fetchAgentFromDatabase,
              databaseAgentCache: params.databaseAgentCache,
              logger,
              apiKey: params.apiKey,
            })
            if (!template) {
              if (toolNames.includes(agentTypeStr as ToolName)) {
                return {
                  valid: false as const,
                  error: toolNotAgentError(agentTypeStr),
                }
              }
              return {
                valid: false as const,
                error: `Agent "${agentTypeStr}" does not exist`,
              }
            }
          } catch {
            return {
              valid: false as const,
              error: `Agent "${agentTypeStr}" could not be loaded`,
            }
          }

          return { valid: true as const, agent }
        }),
      )

      const validAgents: unknown[] = []
      const errors: string[] = []

      for (const result of validationResults) {
        if (result.status === 'rejected') {
          errors.push('Agent validation failed unexpectedly')
        } else if (result.value.valid) {
          validAgents.push(result.value.agent)
        } else {
          errors.push(result.value.error)
        }
      }

      if (errors.length > 0) {
        if (validAgents.length === 0) {
          const errorMsg = `Failed to spawn agents: ${errors.join('; ')}`
          onResponseChunk({ type: 'error', message: errorMsg })
          logger.debug(
            { toolName, errors },
            'All agents in spawn_agents are invalid, not streaming tool call',
          )
          return previousToolCallFinished
        }
        const errorMsg = `Some agents could not be spawned: ${errors.join('; ')}. Proceeding with valid agents only.`
        onResponseChunk({ type: 'error', message: errorMsg })
        effectiveInput = { ...effectiveInput, agents: validAgents }
      }
    }
  }

  // Only emit tool_call event after permission check passes
  onResponseChunk({
    type: 'tool_call',
    toolCallId,
    toolName,
    input: effectiveInput,
    agentId: agentState.agentId,
    parentAgentId: agentState.parentId,
    includeToolCall: !excludeToolFromMessageHistory,
    ...(queued !== undefined && { queued }),
  })

  // When this write is queued behind a prior same-path write, emit a
  // `tool_start` transition once the barrier resolves so the CLI can flip the
  // block from "queued" to "pending". This is non-blocking: we do NOT await
  // `previousToolCallFinished` here (the handler still awaits it internally;
  // double-resolution is harmless). Attach the `.then` immediately after the
  // `tool_call` emit so ordering vs `tool_result` is guaranteed.
  if (queued === true) {
    previousToolCallFinished.then(() => {
      onResponseChunk({ type: 'tool_start', toolCallId })
    })
  }

  // Cast to any to avoid type errors
  const handler = codebuffToolHandlers[
    toolName
  ] as unknown as CodebuffToolHandlerFunction<T>

  // Use effective input for spawn_agents so the handler receives the correct agent types
  const finalToolCall =
    toolName === 'spawn_agents'
      ? { ...toolCall, input: effectiveInput }
      : toolCall

  toolCalls.push(finalToolCall)
  if (!excludeToolFromMessageHistory) {
    toolCallsToAddToMessageHistory.push(finalToolCall)
  }

  const toolResultPromise = handler({
    ...params,
    toolCall: finalToolCall,
    previousToolCallFinished,
    writeToClient: onResponseChunk,
    requestClientToolCall: (async (
      clientToolCall: ClientToolCall<T extends ClientToolName ? T : never>,
    ) => {
      if (params.signal.aborted) {
        return []
      }

      const clientToolResult = await requestToolCall({
        userInputId,
        toolName: clientToolCall.toolName,
        input: clientToolCall.input,
        signal: params.signal,
      })
      return clientToolResult.output as CodebuffToolOutput<T>
    }) as any,
  })

  return toolResultPromise.then(async ({ output, creditsUsed }) => {
    const toolResult: ToolMessage = {
      role: 'tool',
      toolName,
      toolCallId: toolCall.toolCallId,
      content: output,
    }

    onResponseChunk({
      type: 'tool_result',
      toolCallId: toolResult.toolCallId,
      toolName: toolResult.toolName,
      output: toolResult.content,
      agentId: agentState.agentId,
      parentAgentId: agentState.parentId,
    })

    toolResults.push(toolResult)

    if (!excludeToolFromMessageHistory) {
      toolResultsToAddToMessageHistory.push(toolResult)
    }

    // After tool completes, resolve any pending creditsUsed promise
    if (creditsUsed) {
      onCostCalculated(creditsUsed)
      logger.debug(
        { credits: creditsUsed, totalCredits: agentState.creditsUsed },
        `Added ${creditsUsed} credits from ${toolName} to agent state`,
      )
    }
  })
}

export function parseRawCustomToolCall(params: {
  customToolDefs: CustomToolDefinitions
  rawToolCall: {
    toolName: string
    toolCallId: string
    input: unknown
    providerOptions?: ProviderMetadata
  }
  autoInsertEndStepParam?: boolean
}): CustomToolCall | ToolCallError {
  const { customToolDefs, rawToolCall, autoInsertEndStepParam = false } = params
  const toolName = rawToolCall.toolName

  if (
    !(customToolDefs && toolName in customToolDefs) &&
    !toolName.includes(MCP_TOOL_SEPARATOR)
  ) {
    return {
      toolName,
      toolCallId: rawToolCall.toolCallId,
      input: rawToolCall.input,
      error: `Tool ${toolName} not found`,
    }
  }

  const parsedInput = parseStringifiedToolInput(rawToolCall.input, toolName)

  if (typeof parsedInput.input === 'string') {
    return stringInputError(
      toolName,
      rawToolCall.toolCallId,
      parsedInput.parseError,
    )
  }

  const processedParameters: Record<string, any> = {}
  for (const [param, val] of Object.entries(parsedInput.input ?? {})) {
    processedParameters[param] = val
  }

  // Add the required codebuff_end_step parameter with the correct value for this tool if requested
  if (autoInsertEndStepParam) {
    processedParameters[endsAgentStepParam] =
      customToolDefs?.[toolName]?.endsAgentStep
  }

  const rawSchema = customToolDefs?.[toolName]?.inputSchema
  if (rawSchema) {
    const paramsSchema = ensureZodSchema(rawSchema)
    const result = paramsSchema.safeParse(processedParameters)

    if (!result.success) {
      const issues = result.error.issues as ValidationIssue[]
      return {
        toolName: toolName,
        toolCallId: rawToolCall.toolCallId,
        input: rawToolCall.input,
        error: `Invalid parameters for ${toolName}: ${formatValidationIssues({ issues, toolName })}`,
      }
    }
  }

  const input = JSON.parse(JSON.stringify(parsedInput.input))
  if (endsAgentStepParam in input) {
    delete input[endsAgentStepParam]
  }
  return {
    toolName: toolName,
    input,
    toolCallId: rawToolCall.toolCallId,
    ...(rawToolCall.providerOptions && {
      providerOptions: rawToolCall.providerOptions,
    }),
  }
}

export async function executeCustomToolCall(
  params: ExecuteToolCallParams<string>,
): Promise<void> {
  const {
    toolName,
    input,
    autoInsertEndStepParam = false,
    excludeToolFromMessageHistory = false,
    fromHandleSteps = false,

    agentState,
    agentTemplate,
    fileContext,
    logger,
    onResponseChunk,
    previousToolCallFinished,
    requestToolCall,
    toolCallId,
    toolCalls,
    toolCallsToAddToMessageHistory,
    toolResults,
    toolResultsToAddToMessageHistory,
    userInputId,
    queued,
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
      providerOptions: params.providerOptions,
    },
    autoInsertEndStepParam,
  })

  // Filter out restricted tools - emit error instead of tool call/result
  // This prevents the CLI from showing tool calls that the agent doesn't have permission to use
  if (
    toolCall.toolName &&
    !(agentTemplate.toolNames as string[]).includes(toolCall.toolName) &&
    !fromHandleSteps &&
    !(
      toolCall.toolName.includes(MCP_TOOL_SEPARATOR) &&
      toolCall.toolName.split(MCP_TOOL_SEPARATOR)[0] in agentTemplate.mcpServers
    )
  ) {
    // Emit an error event instead of tool call/result pair
    // The stream parser will convert this to a user message for proper API compliance
    onResponseChunk({
      type: 'error',
      message: `Tool \`${toolName}\` is not currently available. Make sure to only use tools listed in the system instructions.`,
    })
    return previousToolCallFinished
  }

  if ('error' in toolCall) {
    const formattedInput = formatValueForError(input)
    onResponseChunk({
      type: 'error',
      message: `${toolCall.error}\n\nOriginal tool call input:\n${formattedInput}`,
    })
    logger.debug(
      { toolCall, error: toolCall.error },
      `${toolName} error: ${toolCall.error}`,
    )
    return previousToolCallFinished
  }

  // Only emit tool_call event after permission check passes
  onResponseChunk({
    type: 'tool_call',
    toolCallId: toolCall.toolCallId,
    toolName,
    input: toolCall.input,
    agentId: agentState.agentId,
    parentAgentId: agentState.parentId,
    // Include includeToolCall flag if explicitly set to false
    ...(excludeToolFromMessageHistory && { includeToolCall: false }),
    ...(queued !== undefined && { queued }),
  })

  // When this write is queued behind a prior same-path write, emit a
  // `tool_start` transition once the barrier resolves so the CLI can flip the
  // block from "queued" to "pending". Non-blocking: do NOT await
  // `previousToolCallFinished` here (the handler still awaits it internally).
  // For custom/unknown-path writes `queued` is typically undefined, so this
  // is a no-op in practice — guarded for consistency with native writes.
  if (queued === true) {
    previousToolCallFinished.then(() => {
      onResponseChunk({
        type: 'tool_start',
        toolCallId: toolCall.toolCallId,
      })
    })
  }

  toolCalls.push(toolCall)
  if (!excludeToolFromMessageHistory) {
    toolCallsToAddToMessageHistory.push(toolCall)
  }

  return previousToolCallFinished
    .then(async () => {
      if (params.signal.aborted) {
        return null
      }

      const toolName = toolCall.toolName.includes(MCP_TOOL_SEPARATOR)
        ? toolCall.toolName
            .split(MCP_TOOL_SEPARATOR)
            .slice(1)
            .join(MCP_TOOL_SEPARATOR)
        : toolCall.toolName
      const clientToolResult = await requestToolCall({
        userInputId,
        toolName,
        input: toolCall.input,
        mcpConfig: toolCall.toolName.includes(MCP_TOOL_SEPARATOR)
          ? agentTemplate.mcpServers[
              toolCall.toolName.split(MCP_TOOL_SEPARATOR)[0]
            ]
          : undefined,
        signal: params.signal,
      })
      return clientToolResult.output satisfies ToolResultOutput[]
    })
    .then((result) => {
      if (!result) {
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
      onResponseChunk({
        type: 'tool_result',
        toolName: toolResult.toolName,
        toolCallId: toolResult.toolCallId,
        output: toolResult.content,
        agentId: agentState.agentId,
        parentAgentId: agentState.parentId,
      })

      toolResults.push(toolResult)

      if (!excludeToolFromMessageHistory) {
        toolResultsToAddToMessageHistory.push(toolResult)
      }

      return
    })
}

export function tryTransformAgentToolCall(params: {
  toolName: string
  input: Record<string, unknown>
  spawnableAgents: AgentTemplateType[]
}): { toolName: 'spawn_agents'; input: Record<string, unknown> } | null {
  const { toolName, input, spawnableAgents } = params

  const matchesAgentToolName = (agentType: AgentTemplateType) =>
    getAgentToolName(agentType) === toolName ||
    getAgentShortName(agentType) === toolName

  // Find the full agent type for this direct-call alias.
  const fullAgentType = spawnableAgents.find(matchesAgentToolName)
  if (!fullAgentType) {
    return null
  }

  // Convert to spawn_agents call - input already has prompt and params as top-level fields
  // (consistent with spawn_agents schema)
  const agentEntry: Record<string, unknown> = {
    agent_type: fullAgentType,
  }
  if (typeof input.prompt === 'string') {
    agentEntry.prompt = input.prompt
  }
  if (Object.hasOwn(input, 'params')) {
    agentEntry.params = input.params
  }
  if (Object.hasOwn(input, 'handoff')) {
    agentEntry.handoff = input.handoff
  }
  const spawnAgentsInput = {
    agents: [agentEntry],
  }

  return { toolName: 'spawn_agents', input: spawnAgentsInput }
}
