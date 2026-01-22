/**
 * Helper functions extracted from loopAgentSteps.
 *
 * This module provides reusable utilities for the agent step loop:
 * - initializeAgentRun: Sets up agent template, system prompt, and tools
 * - buildInitialMessages: Constructs initial message history
 * - buildToolDefinitions: Converts ToolSet to serializable format
 * - prepareStepContext: Prepares context for an agent step (token counting)
 * - handleOutputSchemaRetry: Handles missing output schema validation
 * - Error utilities: extractErrorMessage, isPaymentRequiredError, getErrorStatusCode
 */

import { buildArray } from '@codebuff/common/util/array'
import { userMessage } from '@codebuff/common/util/messages'
import { cloneDeep, mapValues } from 'lodash'

import { callTokenCountAPI } from './llm-api/codebuff-web-api'
import { getMCPToolData } from './mcp'
import { additionalSystemPrompts } from './system-prompt/prompts'
import { getAgentTemplate } from './templates/agent-registry'
import { buildAgentToolSet } from './templates/prompts'
import { getAgentPrompt } from './templates/strings'
import { getToolSet } from './tools/prompts'
import {
  withSystemInstructionTags,
  withSystemTags,
  buildUserMessageContent,
} from './util/messages'
import { countTokensJson } from './util/token-counter'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type {
  FetchAgentFromDatabaseFn,
  StartAgentRunFn,
} from '@codebuff/common/types/contracts/database'
import type { ClientEnv, CiEnv } from '@codebuff/common/types/contracts/env'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type {
  TextPart,
  ImagePart,
} from '@codebuff/common/types/messages/content-part'
import type { AgentState } from '@codebuff/common/types/session-state'
import type { CustomToolDefinitions, ProjectFileContext } from '@codebuff/common/util/file'
import type { ToolSet } from 'ai'

// ============================================================================
// Additional Tool Definitions
// ============================================================================

/**
 * Gets additional tool definitions from MCP servers and custom tool definitions.
 *
 * @param params - Parameters including agent template and file context
 * @returns Promise resolving to custom tool definitions
 */
export async function additionalToolDefinitions(
  params: {
    agentTemplate: AgentTemplate
    fileContext: ProjectFileContext
  } & ParamsExcluding<
    typeof getMCPToolData,
    'toolNames' | 'mcpServers' | 'writeTo'
  >,
): Promise<CustomToolDefinitions> {
  const { agentTemplate, fileContext } = params

  const defs = cloneDeep(
    Object.fromEntries(
      Object.entries(fileContext.customToolDefinitions).filter(([toolName]) =>
        agentTemplate.toolNames.includes(toolName),
      ),
    ),
  )
  return getMCPToolData({
    ...params,
    toolNames: agentTemplate.toolNames,
    mcpServers: agentTemplate.mcpServers,
    writeTo: defs,
  })
}

// ============================================================================
// Initialize Agent Run
// ============================================================================

/**
 * Core parameters needed directly by initializeAgentRun.
 */
export interface InitializeAgentRunParams {
  /** Optional pre-resolved agent template (if not provided, will be fetched) */
  agentTemplate?: AgentTemplate
  /** Project file context */
  fileContext: ProjectFileContext
  /** Initial agent state before run starts */
  initialAgentState: AgentState
  /** Local agent templates available for spawning */
  localAgentTemplates: Record<string, AgentTemplate>
  /** Parent's system prompt (used when inheritParentSystemPrompt is true) */
  parentSystemPrompt?: string
  /** Parent's tools (used when inheritParentSystemPrompt is true) */
  parentTools?: ToolSet
  /** Abort signal for cancellation */
  signal: AbortSignal
  /** Function to register the agent run in the database */
  startAgentRun: StartAgentRunFn
  /** Logger instance */
  logger: Logger
  /** The agent type identifier */
  agentType: string
}

/**
 * Result from successfully initializing an agent run.
 */
export interface InitializeAgentRunResult {
  /** Resolved agent template */
  agentTemplate: AgentTemplate
  /** Unique run ID from database */
  runId: string
  /** Generated system prompt */
  system: string
  /** Tool set available to the agent */
  tools: ToolSet
  /** Whether using parent's tools */
  useParentTools: boolean
  /** Lazy-loaded additional tool definitions */
  cachedAdditionalToolDefinitions: () => Promise<CustomToolDefinitions>
}

/**
 * Full parameter type for initializeAgentRun, including pass-through params.
 *
 * This combines InitializeAgentRunParams with parameters needed by downstream functions:
 * - getAgentTemplate: Needs database access params
 * - getAgentPrompt: Needs file context and database params
 * - getMCPToolData: Needs MCP connection params
 * - startAgentRun: Needs user/session identifiers
 */
export type InitializeAgentRunFullParams = InitializeAgentRunParams &
  ParamsExcluding<typeof getAgentTemplate, 'agentId'> &
  ParamsExcluding<typeof getAgentPrompt, 'agentTemplate' | 'promptType' | 'agentTemplates' | 'additionalToolDefinitions'> &
  ParamsExcluding<typeof getMCPToolData, 'toolNames' | 'mcpServers' | 'writeTo'> &
  ParamsExcluding<StartAgentRunFn, 'agentId' | 'ancestorRunIds'>

/**
 * Resolves agent template, starts the run, and prepares system prompt and tools.
 *
 * This function handles the initialization phase of an agent run:
 * 1. Resolves the agent template (from local templates or database)
 * 2. Checks for early cancellation
 * 3. Registers the run in the database
 * 4. Generates the system prompt
 * 5. Builds the tool set
 *
 * @param params - Initialization parameters and pass-through params for downstream functions
 * @returns Either the initialization result or a cancelled state
 *
 * @example
 * ```typescript
 * const result = await initializeAgentRun({
 *   agentType: 'code-editor',
 *   fileContext,
 *   initialAgentState,
 *   localAgentTemplates,
 *   signal: controller.signal,
 *   startAgentRun,
 *   logger,
 *   // ... other required params
 * })
 *
 * if ('cancelled' in result) {
 *   return { agentState: result.agentState, output: { type: 'error' } }
 * }
 *
 * const { agentTemplate, runId, system, tools } = result
 * ```
 */
export async function initializeAgentRun(
  params: InitializeAgentRunFullParams,
): Promise<InitializeAgentRunResult | { cancelled: true; agentState: AgentState }> {
  const {
    agentTemplate: providedTemplate,
    fileContext,
    initialAgentState,
    localAgentTemplates,
    parentSystemPrompt,
    parentTools,
    signal,
    startAgentRun,
    agentType,
    logger,
  } = params

  // Step 1: Resolve agent template
  let agentTemplate = providedTemplate
  if (!agentTemplate) {
    agentTemplate =
      (await getAgentTemplate({
        ...params,
        agentId: agentType,
      })) ?? undefined
  }
  if (!agentTemplate) {
    throw new Error(`Agent template not found for type: ${agentType}`)
  }

  // Step 2: Check for early cancellation
  if (signal.aborted) {
    return {
      cancelled: true,
      agentState: initialAgentState,
    }
  }

  // Step 3: Start the agent run (register in database)
  const runId = await startAgentRun({
    ...params,
    agentId: agentTemplate.id,
    ancestorRunIds: initialAgentState.ancestorRunIds,
  })
  if (!runId) {
    throw new Error('Failed to start agent run')
  }
  initialAgentState.runId = runId

  // Step 4: Create cached additional tool definitions loader
  let cachedAdditionalToolDefs: CustomToolDefinitions | undefined
  const cachedAdditionalToolDefinitions = async () => {
    if (!cachedAdditionalToolDefs) {
      cachedAdditionalToolDefs = await additionalToolDefinitions({
        ...params,
        agentTemplate: agentTemplate!,
      })
    }
    return cachedAdditionalToolDefs
  }

  // Step 5: Determine if we should use parent tools
  const useParentTools =
    agentTemplate.inheritParentSystemPrompt && parentTools !== undefined

  // Step 6: Generate system prompt
  let system: string
  if (agentTemplate.inheritParentSystemPrompt && parentSystemPrompt) {
    system = parentSystemPrompt
  } else {
    const systemPrompt = await getAgentPrompt({
      ...params,
      agentTemplate,
      promptType: { type: 'systemPrompt' },
      agentTemplates: localAgentTemplates,
      additionalToolDefinitions: cachedAdditionalToolDefinitions,
    })
    system = systemPrompt ?? ''
  }

  // Step 7: Build agent tools
  const agentTools = useParentTools
    ? {}
    : await buildAgentToolSet({
        ...params,
        spawnableAgents: agentTemplate.spawnableAgents,
        agentTemplates: localAgentTemplates,
      })

  const tools = useParentTools
    ? parentTools
    : await getToolSet({
        toolNames: agentTemplate.toolNames,
        additionalToolDefinitions: cachedAdditionalToolDefinitions,
        agentTools,
      })

  return {
    agentTemplate,
    runId,
    system,
    tools,
    useParentTools,
    cachedAdditionalToolDefinitions,
  }
}

// ============================================================================
// Build Initial Messages
// ============================================================================

/**
 * Parameters for building initial message history.
 */
export interface BuildInitialMessagesParams {
  /** Current agent state with existing message history */
  agentState: AgentState
  /** Agent template (currently unused, kept for future extensibility) */
  agentTemplate: AgentTemplate
  /** Optional image/text content parts */
  content?: Array<TextPart | ImagePart>
  /** Instructions prompt to append */
  instructionsPrompt: string | undefined
  /** Local agent templates (currently unused, kept for future extensibility) */
  localAgentTemplates: Record<string, AgentTemplate>
  /** User's prompt text */
  prompt: string | undefined
  /** Spawn parameters object */
  spawnParams: Record<string, any> | undefined
}

/**
 * Builds the initial message history including user prompt and instructions.
 *
 * This function constructs the message array for the first agent step:
 * 1. Preserves existing message history from agentState
 * 2. Adds user message if prompt, spawnParams, or content provided
 * 3. Adds additional system prompt if prompt matches a known key
 * 4. Adds instructions prompt if provided
 *
 * @param params - Message building parameters
 * @returns Array of messages for the agent
 */
export function buildInitialMessages(
  params: BuildInitialMessagesParams,
): Message[] {
  const {
    agentState,
    content,
    instructionsPrompt,
    prompt,
    spawnParams,
  } = params

  const hasUserMessage = Boolean(
    prompt ||
    (spawnParams && Object.keys(spawnParams).length > 0) ||
    (content && content.length > 0),
  )

  return buildArray<Message>(
    ...agentState.messageHistory,

    hasUserMessage && [
      {
        role: 'user' as const,
        content: buildUserMessageContent(prompt, spawnParams, content),
        tags: ['USER_PROMPT'],
        sentAt: Date.now(),
        keepDuringTruncation: true,
      },
      prompt &&
        prompt in additionalSystemPrompts &&
        userMessage(
          withSystemInstructionTags(
            additionalSystemPrompts[
              prompt as keyof typeof additionalSystemPrompts
            ],
          ),
        ),
    ],

    instructionsPrompt &&
      userMessage({
        content: instructionsPrompt,
        tags: ['INSTRUCTIONS_PROMPT'],
        keepLastTags: ['INSTRUCTIONS_PROMPT'],
      }),
  )
}

// ============================================================================
// Build Tool Definitions
// ============================================================================

/**
 * Serializable tool definition for token counting.
 */
export interface SerializableToolDefinition {
  description: string | undefined
  inputSchema: {}
}

/**
 * Builds tool definitions in a serializable format for token counting.
 *
 * This extracts the description and inputSchema from each tool,
 * creating a plain object that can be serialized and used for
 * estimating token usage.
 *
 * @param tools - The ToolSet from AI SDK
 * @returns Record of tool names to their serializable definitions
 */
export function buildToolDefinitions(
  tools: ToolSet,
): Record<string, SerializableToolDefinition> {
  return mapValues(tools, (tool) => ({
    description: tool.description,
    inputSchema: tool.inputSchema as {},
  }))
}

// ============================================================================
// Prepare Step Context
// ============================================================================

/**
 * Parameters for preparing agent step context.
 */
export interface PrepareStepContextParams {
  /** Current agent state */
  agentState: AgentState
  /** Agent template */
  agentTemplate: AgentTemplate
  /** Project file context */
  fileContext: ProjectFileContext
  /** Local agent templates */
  localAgentTemplates: Record<string, AgentTemplate>
  /** System prompt */
  system: string
  /** Serializable tool definitions for token counting */
  toolDefinitions: Record<string, SerializableToolDefinition>
  /** Logger instance */
  logger: Logger
  /** Client environment */
  clientEnv: ClientEnv
  /** CI environment */
  ciEnv: CiEnv
  /** Lazy-loaded additional tool definitions */
  cachedAdditionalToolDefinitions: () => Promise<CustomToolDefinitions>
  /** API key for LLM calls */
  apiKey: string
  /** Function to fetch agent from database */
  fetchAgentFromDatabase: FetchAgentFromDatabaseFn
  /** Database agent cache */
  databaseAgentCache: Map<string, AgentTemplate | null>
}

/**
 * Result from preparing step context.
 */
export interface PrepareStepContextResult {
  /** Step-specific prompt (if any) */
  stepPrompt: string | undefined
  /** Messages including the step prompt */
  messagesWithStepPrompt: Message[]
  /** Estimated token count for context */
  contextTokenCount: number
}

/**
 * Prepares the context for an agent step, including token counting.
 *
 * This function:
 * 1. Gets the step-specific prompt from the agent template
 * 2. Builds messages including the step prompt
 * 3. Counts tokens for context management
 *
 * @param params - Step context parameters
 * @returns Promise with step prompt, messages, and token count
 */
export async function prepareStepContext(
  params: PrepareStepContextParams,
): Promise<PrepareStepContextResult> {
  const {
    agentState,
    agentTemplate,
    fileContext,
    localAgentTemplates,
    system,
    toolDefinitions,
    logger,
    clientEnv,
    ciEnv,
    cachedAdditionalToolDefinitions,
    apiKey,
    fetchAgentFromDatabase,
    databaseAgentCache,
  } = params

  // Get step prompt from template
  const stepPrompt = await getAgentPrompt({
    agentTemplate,
    promptType: { type: 'stepPrompt' },
    fileContext,
    agentState,
    agentTemplates: localAgentTemplates,
    logger,
    additionalToolDefinitions: cachedAdditionalToolDefinitions,
    apiKey,
    fetchAgentFromDatabase,
    databaseAgentCache,
  })

  const messagesWithStepPrompt = buildArray(
    ...agentState.messageHistory,
    stepPrompt &&
      userMessage({
        content: stepPrompt,
      }),
  )

  // Get token count from API or estimate locally
  const tokenCountResult = await callTokenCountAPI({
    messages: messagesWithStepPrompt,
    system,
    model: agentTemplate.model,
    fetch,
    logger,
    env: { clientEnv, ciEnv },
  })

  let contextTokenCount: number
  if (tokenCountResult.inputTokens !== undefined) {
    contextTokenCount = tokenCountResult.inputTokens
  } else {
    if (tokenCountResult.error) {
      logger.warn(
        { error: tokenCountResult.error },
        'Failed to get token count from Anthropic API',
      )
    }
    // Fall back to local estimate
    contextTokenCount =
      countTokensJson(agentState.messageHistory) +
      countTokensJson(system) +
      countTokensJson(toolDefinitions)
  }

  return {
    stepPrompt,
    messagesWithStepPrompt,
    contextTokenCount,
  }
}

// ============================================================================
// Handle Output Schema Retry
// ============================================================================

/**
 * Parameters for handling output schema retry logic.
 */
export interface HandleOutputSchemaRetryParams {
  /** Current agent state */
  agentState: AgentState
  /** Agent template (contains outputSchema) */
  agentTemplate: AgentTemplate
  /** Whether we've already retried once */
  hasRetriedOutputSchema: boolean
  /** Whether the turn would end */
  shouldEndTurn: boolean
  /** Run ID for logging */
  runId: string
  /** Agent type for logging */
  agentType: string
  /** Logger instance */
  logger: Logger
}

/**
 * Result from output schema retry check.
 */
export interface HandleOutputSchemaRetryResult {
  /** Updated agent state (may have new message) */
  agentState: AgentState
  /** Whether turn should end (false if retrying) */
  shouldEndTurn: boolean
  /** Whether we've now retried */
  hasRetriedOutputSchema: boolean
}

/**
 * Checks if the agent needs to retry due to missing output schema.
 *
 * When an agent has an outputSchema defined but finishes without
 * calling set_output, this function will:
 * 1. Log a warning
 * 2. Add a system message instructing the agent to use set_output
 * 3. Return shouldEndTurn: false to continue the loop
 *
 * This only retries once to avoid infinite loops.
 *
 * @param params - Retry check parameters
 * @returns Updated state and flags
 */
export function handleOutputSchemaRetry(
  params: HandleOutputSchemaRetryParams,
): HandleOutputSchemaRetryResult {
  const {
    agentState,
    agentTemplate,
    hasRetriedOutputSchema,
    shouldEndTurn,
    runId,
    agentType,
    logger,
  } = params

  // Check if output is required but missing
  if (
    agentTemplate.outputSchema &&
    agentState.output === undefined &&
    shouldEndTurn &&
    !hasRetriedOutputSchema
  ) {
    logger.warn(
      {
        agentType,
        agentId: agentState.agentId,
        runId,
      },
      'Agent finished without setting required output, restarting loop',
    )

    // Add system message instructing to use set_output
    const outputSchemaMessage = withSystemTags(
      `You must use the "set_output" tool to provide a result that matches the output schema before ending your turn. The output schema is required for this agent.`,
    )

    return {
      agentState: {
        ...agentState,
        messageHistory: [
          ...agentState.messageHistory,
          userMessage({
            content: outputSchemaMessage,
            keepDuringTruncation: true,
          }),
        ],
      },
      shouldEndTurn: false,
      hasRetriedOutputSchema: true,
    }
  }

  return {
    agentState,
    shouldEndTurn,
    hasRetriedOutputSchema,
  }
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Type guard for objects with a numeric statusCode property.
 */
function hasStatusCode(error: unknown): error is { statusCode: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
  )
}

/**
 * Extracts a clean error message from an error object.
 *
 * For Error instances, returns the message and stack trace.
 * For other values, returns String(error).
 *
 * @param error - The error to extract a message from
 * @returns Human-readable error message
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message + (error.stack ? `\n\n${error.stack}` : '')
  }
  return String(error)
}

/**
 * Checks if an error is a payment required error (HTTP 402).
 *
 * These errors should typically be propagated to the user
 * rather than being handled as general agent errors.
 *
 * @param error - The error to check
 * @returns True if this is a 402 Payment Required error
 */
export function isPaymentRequiredError(error: unknown): boolean {
  return hasStatusCode(error) && error.statusCode === 402
}

/**
 * Gets the HTTP status code from an error if available.
 *
 * @param error - The error to extract status code from
 * @returns The status code, or undefined if not present
 */
export function getErrorStatusCode(error: unknown): number | undefined {
  return hasStatusCode(error) ? error.statusCode : undefined
}
