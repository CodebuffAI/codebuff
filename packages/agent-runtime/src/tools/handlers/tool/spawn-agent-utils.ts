import { MAX_AGENT_STEPS_DEFAULT } from '@codebuff/common/constants/agents'
import { toolNames } from '@codebuff/common/tools/constants'
import {
  normalizeAgentIdForLookup,
  parseAgentId,
} from '@codebuff/common/util/agent-id-parsing'
import { generateCompactId } from '@codebuff/common/util/string'

import { loopAgentSteps } from '../../../run-agent-step'
import { getAgentTemplate } from '../../../templates/agent-registry'
import { formatValueForError } from '../../../util/format-value'
import {
  filterUnfinishedToolCalls,
  withSystemTags,
} from '../../../util/messages'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  ParamsExcluding,
  OptionalFields,
} from '@codebuff/common/types/function-params'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  AgentState,
  AgentTemplateType,
  Subgoal,
} from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { ToolSet } from 'ai'

const DEFAULT_EDITOR_PROPOSAL_IDLE_TIMEOUT_MS = 120_000
const DEFAULT_EDITOR_PROPOSAL_HARD_TIMEOUT_MS = 15 * 60_000
const EDITOR_PROPOSAL_COMPLETION_MARKER = 'PROPOSAL_BUNDLE_COMPLETE'

function isEditorProposalAgent(agentId: string): boolean {
  return /^editor-implementor-proposal-(?:\d+|direct)$/.test(agentId)
}

function getEditorProposalTimeoutConfig(spawnParams: unknown): {
  firstProgressTimeoutMs: number | undefined
  idleTimeoutMs: number | undefined
  hardTimeoutMs: number | undefined
} {
  const idleTimeoutMs = getTimeoutMs({
    raw:
      getNumericSpawnParam(spawnParams, 'proposalIdleTimeoutMs') ??
      process.env.OPENBUFF_EDITOR_PROPOSAL_IDLE_TIMEOUT_MS ??
      getNumericSpawnParam(spawnParams, 'proposalTimeoutMs') ??
      process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS,
    defaultMs: DEFAULT_EDITOR_PROPOSAL_IDLE_TIMEOUT_MS,
  })
  if (!idleTimeoutMs || idleTimeoutMs <= 0) {
    return {
      firstProgressTimeoutMs: undefined,
      idleTimeoutMs: undefined,
      hardTimeoutMs: undefined,
    }
  }

  const firstProgressTimeoutMs = getTimeoutMs({
    raw:
      getNumericSpawnParam(spawnParams, 'proposalFirstProgressTimeoutMs') ??
      process.env.OPENBUFF_EDITOR_PROPOSAL_FIRST_PROGRESS_TIMEOUT_MS,
    defaultMs:
      idleTimeoutMs < 1_000
        ? idleTimeoutMs
        : Math.max(idleTimeoutMs * 2, 300_000),
  })

  const hardTimeoutMs = getTimeoutMs({
    raw:
      getNumericSpawnParam(spawnParams, 'proposalHardTimeoutMs') ??
      process.env.OPENBUFF_EDITOR_PROPOSAL_HARD_TIMEOUT_MS,
    defaultMs:
      idleTimeoutMs < 1_000
        ? idleTimeoutMs * 4
        : Math.max(
            DEFAULT_EDITOR_PROPOSAL_HARD_TIMEOUT_MS,
            (firstProgressTimeoutMs ?? idleTimeoutMs) + idleTimeoutMs * 3,
          ),
  })

  return {
    firstProgressTimeoutMs,
    idleTimeoutMs,
    hardTimeoutMs,
  }
}

function getTimeoutMs(params: {
  raw: string | number | undefined
  defaultMs: number
}): number | undefined {
  const { raw, defaultMs } = params
  if (raw === undefined || raw === '') return defaultMs

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return defaultMs
  }
  return parsed === 0 ? undefined : parsed
}

function getNumericSpawnParam(
  spawnParams: unknown,
  key: string,
): string | number | undefined {
  return spawnParams &&
    typeof spawnParams === 'object' &&
    key in spawnParams &&
    (typeof (spawnParams as Record<string, unknown>)[key] === 'string' ||
      typeof (spawnParams as Record<string, unknown>)[key] === 'number')
    ? ((spawnParams as Record<string, string | number>)[key] as
        | string
        | number)
    : undefined
}

function createProgressAwareTimeoutSignal(params: {
  parentSignal: AbortSignal
  firstProgressTimeoutMs: number | undefined
  idleTimeoutMs: number | undefined
  hardTimeoutMs: number | undefined
  firstProgressTimeoutMessage: string
  idleTimeoutMessage: string
  hardTimeoutMessage: string
}): {
  signal: AbortSignal
  didTimeout: () => boolean
  getTimeoutMessage: () => string
  recordProgress: () => void
  cleanup: () => void
} {
  const {
    parentSignal,
    firstProgressTimeoutMs,
    idleTimeoutMs,
    hardTimeoutMs,
    firstProgressTimeoutMessage,
    idleTimeoutMessage,
    hardTimeoutMessage,
  } = params
  if (
    (!firstProgressTimeoutMs || firstProgressTimeoutMs <= 0) &&
    (!idleTimeoutMs || idleTimeoutMs <= 0) &&
    (!hardTimeoutMs || hardTimeoutMs <= 0)
  ) {
    return {
      signal: parentSignal,
      didTimeout: () => false,
      getTimeoutMessage: () => '',
      recordProgress: () => {},
      cleanup: () => {},
    }
  }

  const controller = new AbortController()
  let timedOut = false
  let timeoutMessage = ''
  let sawProgress = false
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let hardTimer: ReturnType<typeof setTimeout> | undefined
  const forwardAbort = () => controller.abort(parentSignal.reason)

  const abortWithTimeout = (message: string) => {
    if (controller.signal.aborted) return
    timedOut = true
    timeoutMessage = message
    controller.abort(new Error(message))
  }

  const armIdleTimer = (timeoutMs: number | undefined, message: string) => {
    if (!timeoutMs || timeoutMs <= 0 || controller.signal.aborted) return
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => abortWithTimeout(message), timeoutMs)
  }

  armIdleTimer(firstProgressTimeoutMs, firstProgressTimeoutMessage)
  if (hardTimeoutMs && hardTimeoutMs > 0) {
    hardTimer = setTimeout(
      () => abortWithTimeout(hardTimeoutMessage),
      hardTimeoutMs,
    )
  }

  const recordProgress = () => {
    if (controller.signal.aborted || !idleTimeoutMs || idleTimeoutMs <= 0) {
      return
    }
    sawProgress = true
    armIdleTimer(idleTimeoutMs, idleTimeoutMessage)
  }

  const clearTimers = () => {
    if (idleTimer) clearTimeout(idleTimer)
    if (hardTimer) clearTimeout(hardTimer)
    idleTimer = undefined
    hardTimer = undefined
  }

  if (parentSignal.aborted) {
    forwardAbort()
  } else {
    parentSignal.addEventListener('abort', forwardAbort, { once: true })
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    getTimeoutMessage: () =>
      timeoutMessage ||
      (sawProgress ? idleTimeoutMessage : firstProgressTimeoutMessage),
    recordProgress,
    cleanup: () => {
      clearTimers()
      parentSignal.removeEventListener('abort', forwardAbort)
    },
  }
}

/**
 * Common context params needed for spawning subagents.
 * These are the params that don't change between different spawn calls
 * and are passed through from the parent agent runtime.
 */
export type SubagentContextParams = AgentRuntimeDeps &
  AgentRuntimeScopedDeps & {
    clientSessionId: string
    costMode?: string
    extraCodebuffMetadata?: Record<string, string>
    fileContext: ProjectFileContext
    localAgentTemplates: Record<string, AgentTemplate>
    repoId: string | undefined
    repoUrl: string | undefined
    signal: AbortSignal
    userId: string | undefined
  }

/**
 * Extracts the common context params needed for spawning subagents.
 * This avoids bugs from spreading all params with `...params` which can
 * accidentally pass through params that should be overridden.
 */
export function extractSubagentContextParams(
  params: SubagentContextParams,
): SubagentContextParams {
  return {
    // AgentRuntimeDeps - Environment
    clientEnv: params.clientEnv,
    ciEnv: params.ciEnv,
    // AgentRuntimeDeps - Database
    getUserInfoFromApiKey: params.getUserInfoFromApiKey,
    fetchAgentFromDatabase: params.fetchAgentFromDatabase,
    startAgentRun: params.startAgentRun,
    finishAgentRun: params.finishAgentRun,
    addAgentStep: params.addAgentStep,
    // AgentRuntimeDeps - Billing
    consumeCreditsWithFallback: params.consumeCreditsWithFallback,
    // AgentRuntimeDeps - LLM
    promptAiSdkStream: params.promptAiSdkStream,
    promptAiSdk: params.promptAiSdk,
    promptAiSdkStructured: params.promptAiSdkStructured,
    // AgentRuntimeDeps - Mutable State
    databaseAgentCache: params.databaseAgentCache,
    // AgentRuntimeDeps - Analytics
    trackEvent: params.trackEvent,
    // AgentRuntimeDeps - Other
    logger: params.logger,
    fetch: params.fetch,

    // AgentRuntimeScopedDeps - Client (WebSocket)
    handleStepsLogChunk: params.handleStepsLogChunk,
    requestToolCall: params.requestToolCall,
    requestMcpToolData: params.requestMcpToolData,
    requestFiles: params.requestFiles,
    requestOptionalFile: params.requestOptionalFile,
    sendAction: params.sendAction,
    sendSubagentChunk: params.sendSubagentChunk,
    apiKey: params.apiKey,

    // Core context params
    clientSessionId: params.clientSessionId,
    costMode: params.costMode,
    extraCodebuffMetadata: params.extraCodebuffMetadata,
    fileContext: params.fileContext,
    localAgentTemplates: params.localAgentTemplates,
    repoId: params.repoId,
    repoUrl: params.repoUrl,
    signal: params.signal,
    userId: params.userId,
  }
}

/**
 * Checks if a parent agent is allowed to spawn a child agent
 */
export function getMatchingSpawn(
  spawnableAgents: AgentTemplateType[],
  childFullAgentId: string,
) {
  const {
    publisherId: childPublisherId,
    agentId: childAgentId,
    version: childVersion,
  } = parseAgentId(normalizeAgentIdForLookup(childFullAgentId))

  if (!childAgentId) {
    return null
  }

  for (const spawnableAgent of spawnableAgents) {
    const {
      publisherId: spawnablePublisherId,
      agentId: spawnableAgentId,
      version: spawnableVersion,
    } = parseAgentId(normalizeAgentIdForLookup(spawnableAgent))

    if (!spawnableAgentId) {
      continue
    }

    if (
      spawnableAgentId === childAgentId &&
      spawnablePublisherId === childPublisherId &&
      spawnableVersion === childVersion
    ) {
      return spawnableAgent
    }
    if (!childVersion && childPublisherId) {
      if (
        spawnablePublisherId === childPublisherId &&
        spawnableAgentId === childAgentId
      ) {
        return spawnableAgent
      }
    }
    if (!childPublisherId && childVersion) {
      if (
        spawnableAgentId === childAgentId &&
        spawnableVersion === childVersion
      ) {
        return spawnableAgent
      }
    }

    if (!childVersion && !childPublisherId) {
      if (spawnableAgentId === childAgentId) {
        return spawnableAgent
      }
    }
  }
  return null
}

/**
 * Validates agent template and permissions
 */
export async function validateAndGetAgentTemplate(
  params: {
    agentTypeStr: string
    parentAgentTemplate: AgentTemplate
    localAgentTemplates: Record<string, AgentTemplate>
    logger: Logger
  } & ParamsExcluding<typeof getAgentTemplate, 'agentId'>,
): Promise<{ agentTemplate: AgentTemplate; agentType: string }> {
  const { agentTypeStr, parentAgentTemplate } = params
  const BASE_AGENTS = ['base', 'base-free', 'base-max', 'base-experimental']
  const isBaseAgent = BASE_AGENTS.includes(parentAgentTemplate.id)
  const agentType = isBaseAgent
    ? normalizeAgentIdForLookup(agentTypeStr)
    : getMatchingSpawn(parentAgentTemplate.spawnableAgents, agentTypeStr)

  if (!agentType) {
    if (toolNames.includes(agentTypeStr as any)) {
      throw new Error(
        `"${agentTypeStr}" is a tool, not an agent. Call it directly as a tool instead of wrapping it in spawn_agents.`,
      )
    }
    throw new Error(
      `Agent type ${parentAgentTemplate.id} is not allowed to spawn child agent type ${agentTypeStr}.`,
    )
  }

  const agentTemplate = await getAgentTemplate({
    ...params,
    agentId: agentType,
  })

  if (!agentTemplate) {
    if (toolNames.includes(agentTypeStr as any)) {
      throw new Error(
        `"${agentTypeStr}" is a tool, not an agent. Call it directly as a tool instead of wrapping it in spawn_agents.`,
      )
    }
    throw new Error(`Agent type ${agentTypeStr} not found.`)
  }

  return { agentTemplate, agentType }
}

/**
 * Validates prompt and params against agent schema
 */
export function validateAgentInput(
  agentTemplate: AgentTemplate,
  agentType: string,
  prompt?: string,
  params?: any,
): void {
  const { inputSchema } = agentTemplate

  // Validate prompt requirement
  if (inputSchema.prompt) {
    const result = inputSchema.prompt.safeParse(prompt ?? '')
    if (!result.success) {
      throw new Error(
        `Invalid prompt for agent ${agentType}: ${JSON.stringify(result.error.issues, null, 2)}\n\nOriginal prompt value:\n${formatValueForError(prompt ?? '')}`,
      )
    }
  }

  // Validate params if schema exists
  if (inputSchema.params) {
    const result = inputSchema.params.safeParse(params ?? {})
    if (!result.success) {
      throw new Error(
        `Invalid params for agent ${agentType}: ${JSON.stringify(result.error.issues, null, 2)}\n\nOriginal params value:\n${formatValueForError(params ?? {})}`,
      )
    }
  }
}

/**
 * Creates a new agent state for spawned agents
 */
export function createAgentState(
  agentType: string,
  agentTemplate: AgentTemplate,
  parentAgentState: AgentState,
  agentContext: Record<string, Subgoal>,
): AgentState {
  const agentId = generateCompactId()

  // When including message history, filter out any tool calls that don't have
  // corresponding tool responses. This prevents the spawned agent from seeing
  // unfinished tool calls which throw errors in the Anthropic API.
  let messageHistory: Message[] = []

  if (agentTemplate.includeMessageHistory) {
    messageHistory = filterUnfinishedToolCalls(parentAgentState.messageHistory)
    messageHistory.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: withSystemTags(`Subagent ${agentType} has been spawned.`),
        },
      ],
      tags: ['SUBAGENT_SPAWN'],
    })
  }

  return {
    agentId,
    agentType,
    agentContext,
    ancestorRunIds: [
      ...parentAgentState.ancestorRunIds,
      parentAgentState.runId ?? 'NULL',
    ],
    subagents: [],
    childRunIds: [],
    messageHistory,
    stepsRemaining: MAX_AGENT_STEPS_DEFAULT,
    creditsUsed: 0,
    directCreditsUsed: 0,
    output: undefined,
    parentId: parentAgentState.agentId,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount: parentAgentState.contextTokenCount,
  }
}

/**
 * Logs agent spawn information
 */
export function logAgentSpawn(params: {
  agentTemplate: AgentTemplate
  agentType: string
  agentId: string
  parentId: string | undefined
  prompt?: string
  spawnParams?: any
  inline?: boolean
  logger: Logger
}): void {
  const {
    agentTemplate,
    agentType,
    agentId,
    parentId,
    prompt,
    spawnParams,
    inline = false,
    logger,
  } = params
  logger.debug(
    {
      agentTemplate,
      prompt,
      params: spawnParams,
      agentId,
      parentId,
    },
    `Spawning agent${inline ? ' inline' : ''} — ${agentType} (${agentId})`,
  )
}

/**
 * Executes a subagent using loopAgentSteps
 */
export async function executeSubagent(
  options: OptionalFields<
    {
      agentTemplate: AgentTemplate
      parentAgentState: AgentState
      parentTools?: ToolSet
      onResponseChunk: (chunk: string | PrintModeEvent) => void
      isOnlyChild?: boolean
      ancestorRunIds: string[]
    } & ParamsExcluding<typeof loopAgentSteps, 'agentType' | 'ancestorRunIds'>,
    'isOnlyChild' | 'clearUserPromptMessagesAfterResponse'
  >,
) {
  const withDefaults = {
    isOnlyChild: false,
    clearUserPromptMessagesAfterResponse: true,
    ...options,
  }
  const {
    onResponseChunk,
    agentTemplate,
    parentAgentState,
    isOnlyChild,
    ancestorRunIds,
    prompt,
    spawnParams,
  } = withDefaults
  const isProposalAgent = isEditorProposalAgent(agentTemplate.id)
  const timeoutConfig = isProposalAgent
    ? getEditorProposalTimeoutConfig(spawnParams)
    : {
        firstProgressTimeoutMs: undefined,
        idleTimeoutMs: undefined,
        hardTimeoutMs: undefined,
      }
  const firstProgressTimeoutMessage = buildEditorProposalTimeoutMessage({
    agentId: agentTemplate.id,
    timeoutMs: timeoutConfig.firstProgressTimeoutMs,
    reason: 'without producing progress',
  })
  const idleTimeoutMessage = buildEditorProposalTimeoutMessage({
    agentId: agentTemplate.id,
    timeoutMs: timeoutConfig.idleTimeoutMs,
    reason: 'without new progress',
  })
  const hardTimeoutMessage = buildEditorProposalTimeoutMessage({
    agentId: agentTemplate.id,
    timeoutMs: timeoutConfig.hardTimeoutMs,
    reason: 'hard limit',
  })
  const timeoutSignal = createProgressAwareTimeoutSignal({
    parentSignal: withDefaults.signal,
    firstProgressTimeoutMs: timeoutConfig.firstProgressTimeoutMs,
    idleTimeoutMs: timeoutConfig.idleTimeoutMs,
    hardTimeoutMs: timeoutConfig.hardTimeoutMs,
    firstProgressTimeoutMessage,
    idleTimeoutMessage,
    hardTimeoutMessage,
  })
  const recordProposalProgress = (chunk: string | PrintModeEvent) => {
    if (isProposalAgent && isEditorProposalProgressChunk(chunk)) {
      timeoutSignal.recordProgress()
    }
  }
  const forwardResponseChunk = (chunk: string | PrintModeEvent) => {
    recordProposalProgress(chunk)
    onResponseChunk(chunk)
  }

  const startEvent = {
    type: 'subagent_start' as const,
    agentId: withDefaults.agentState.agentId,
    agentType: agentTemplate.id,
    displayName: agentTemplate.displayName,
    onlyChild: isOnlyChild,
    parentAgentId: parentAgentState.agentId,
    prompt,
    params: spawnParams,
  }
  onResponseChunk(startEvent)

  let result: Awaited<ReturnType<typeof loopAgentSteps>>
  try {
    result = await loopAgentSteps({
      ...withDefaults,
      signal: timeoutSignal.signal,
      onResponseChunk: forwardResponseChunk,
      // Don't propagate parent's image content to subagents.
      // If subagents need to see images, they get them through includeMessageHistory,
      // not by creating new image-containing messages for their prompts.
      content: undefined,
      ancestorRunIds: [...ancestorRunIds, parentAgentState.runId ?? ''],
      agentType: agentTemplate.id,
    })
    if (timeoutSignal.didTimeout()) {
      const timeoutMessage = timeoutSignal.getTimeoutMessage()
      const recoveredResult = buildRecoveredEditorProposalTimeoutResult({
        agentTemplate,
        agentState: withDefaults.agentState,
        spawnParams,
        timeoutConfig,
        timeoutMessage,
      })
      if (recoveredResult) {
        result = recoveredResult
      } else {
        throw new Error(timeoutMessage)
      }
    }
  } catch (error) {
    if (timeoutSignal.didTimeout()) {
      const timeoutMessage = timeoutSignal.getTimeoutMessage()
      const recoveredResult = buildRecoveredEditorProposalTimeoutResult({
        agentTemplate,
        agentState: withDefaults.agentState,
        spawnParams,
        timeoutConfig,
        timeoutMessage,
      })
      if (recoveredResult) {
        result = recoveredResult
      } else {
        throw new Error(timeoutMessage)
      }
    } else {
      const recoveryMessage = buildEditorProposalProviderErrorMessage({
        agentId: agentTemplate.id,
        error,
      })
      const recoveredResult = buildRecoveredEditorProposalTimeoutResult({
        agentTemplate,
        agentState: withDefaults.agentState,
        spawnParams,
        timeoutConfig,
        timeoutMessage: recoveryMessage,
        recoveryReason: 'providerError',
      })
      if (recoveredResult) {
        result = recoveredResult
      } else {
        throw error
      }
    }
  } finally {
    timeoutSignal.cleanup()
  }

  onResponseChunk({
    type: 'subagent_finish',
    agentId: result.agentState.agentId,
    agentType: agentTemplate.id,
    displayName: agentTemplate.displayName,
    onlyChild: isOnlyChild,
    parentAgentId: parentAgentState.agentId,
    prompt,
    params: spawnParams,
  })

  if (result.agentState.runId) {
    parentAgentState.childRunIds.push(result.agentState.runId)
  }

  return result
}

function buildEditorProposalTimeoutMessage(params: {
  agentId: string
  timeoutMs: number | undefined
  reason: string
}): string {
  const { agentId, timeoutMs, reason } = params
  return `Subagent ${agentId} timed out after ${Math.round(
    (timeoutMs ?? 0) / 1000,
  )}s ${reason} while generating an editor proposal. Set OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS=0 to disable this guard.`
}

function buildEditorProposalProviderErrorMessage(params: {
  agentId: string
  error: unknown
}): string {
  const { agentId, error } = params
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown provider error'
  return `Subagent ${agentId} stopped after a provider error while generating an editor proposal. Captured proposal edits were recovered when possible. Provider error: ${message}`
}

function isEditorProposalProgressChunk(
  chunk: string | PrintModeEvent,
): boolean {
  if (typeof chunk === 'string') {
    return chunk.trim().length > 0
  }

  if (chunk.type === 'text') {
    return chunk.text.trim().length > 0
  }
  if (chunk.type === 'reasoning_delta') {
    return chunk.text.trim().length > 0
  }
  if (chunk.type === 'tool_call') {
    return true
  }
  if (chunk.type === 'tool_result') {
    return Array.isArray(chunk.output) && chunk.output.length > 0
  }
  return false
}

function buildRecoveredEditorProposalTimeoutResult(params: {
  agentTemplate: AgentTemplate
  agentState: AgentState
  spawnParams: unknown
  timeoutConfig: {
    firstProgressTimeoutMs: number | undefined
    idleTimeoutMs: number | undefined
    hardTimeoutMs: number | undefined
  }
  timeoutMessage: string
  recoveryReason?: 'timeout' | 'providerError'
}): Awaited<ReturnType<typeof loopAgentSteps>> | undefined {
  const {
    agentTemplate,
    agentState,
    spawnParams,
    timeoutConfig,
    timeoutMessage,
    recoveryReason = 'timeout',
  } = params
  if (!isEditorProposalAgent(agentTemplate.id)) {
    return undefined
  }

  const latestAttemptMessages = getMessagesSinceLastProposalRetry(
    agentState.messageHistory,
  )
  const rawToolCalls = getProposalToolCallsFromMessages(latestAttemptMessages)
  const rawToolResults = dedupeProposalToolResults(
    getProposalToolResults(latestAttemptMessages),
  )
  const toolResults = filterIgnorableNoOpProposalFailures(
    sanitizeRecoverableMixedProposalResults(rawToolResults),
  )
  const toolCalls = sanitizeProposalToolCallsForRecoverableFailures({
    toolCalls: rawToolCalls,
    rawToolResults,
  })
  const unifiedDiffs = toolResults
    .filter(isSuccessfulProposalToolResult)
    .map((result: any) => `--- ${result.file} ---\n${result.unifiedDiff}`)
    .join('\n\n')

  if (toolCalls.length === 0 && !unifiedDiffs) {
    return undefined
  }

  return {
    agentState,
    output: {
      type: 'structuredOutput',
      value: {
        toolCalls,
        toolResults,
        unifiedDiffs,
        stopReason: inferRecoveredProposalStopReason({
          latestAttemptMessages,
          spawnParams,
          toolCalls,
          toolResults,
          unifiedDiffs,
        }),
        proposalProgress: buildRecoveredProposalProgressTelemetry({
          latestAttemptMessages,
          toolCalls,
          toolResults,
          recoveryReason,
        }),
        proposalBudget: {
          ...timeoutConfig,
          ...(recoveryReason === 'timeout'
            ? { recoveredFromTimeout: true }
            : { recoveredFromProviderError: true }),
        },
        timeoutMessage,
        ...(toolCalls.length === 0 && !unifiedDiffs
          ? { errorMessage: timeoutMessage }
          : {}),
      },
    },
  }
}

function buildRecoveredProposalProgressTelemetry(params: {
  latestAttemptMessages: Message[]
  toolCalls: { toolName: string; input: any }[]
  toolResults: any[]
  recoveryReason: 'timeout' | 'providerError'
}): Record<string, unknown> {
  const { latestAttemptMessages, toolCalls, toolResults, recoveryReason } =
    params
  const proposedFiles = getUniqueProposedFilePaths({ toolCalls, toolResults })

  return {
    readOnlyToolCallCount: countToolCallsInMessages(
      latestAttemptMessages,
      isReadOnlyToolName,
    ),
    proposalToolCallCount: toolCalls.length,
    successfulProposalResultCount: toolResults.filter(
      isSuccessfulProposalToolResult,
    ).length,
    failedProposalResultCount: toolResults.filter((result) =>
      Boolean(getProposalResultFailureMessage(result)),
    ).length,
    proposedFileCount: proposedFiles.length,
    proposedFiles: proposedFiles.slice(0, 20),
    completionSignalSeen: hasProposalCompletionSignal(latestAttemptMessages),
    recoveredFromTimeout: recoveryReason === 'timeout',
    recoveredFromProviderError: recoveryReason === 'providerError',
  }
}

function inferRecoveredProposalStopReason(params: {
  latestAttemptMessages: Message[]
  spawnParams: unknown
  toolCalls: { toolName: string; input: any }[]
  toolResults: any[]
  unifiedDiffs: string
}): 'cleanProposal' | 'noCompletionSignal' | 'noProposal' {
  const {
    latestAttemptMessages,
    spawnParams,
    toolCalls,
    toolResults,
    unifiedDiffs,
  } = params
  if (toolCalls.length === 0 && !unifiedDiffs) return 'noProposal'
  if (!shouldCollectProposalBundle(spawnParams)) return 'cleanProposal'
  if (hasProposalCompletionSignal(latestAttemptMessages)) {
    return 'cleanProposal'
  }
  return getRecoveredProposalCoverageAssessment({
    spawnParams,
    toolCalls,
    toolResults,
  }).canReturnClean
    ? 'cleanProposal'
    : 'noCompletionSignal'
}

function shouldCollectProposalBundle(spawnParams: unknown): boolean {
  if (!spawnParams || typeof spawnParams !== 'object') return false
  const value = (spawnParams as Record<string, unknown>).proposalBundleMode
  return value === true || value === 'true'
}

function getRecoveredProposalCoverageAssessment(params: {
  spawnParams: unknown
  toolCalls: { toolName: string; input: any }[]
  toolResults: any[]
}): {
  proposedFileCount: number
  requiredFileCount: number
  canReturnClean: boolean
} {
  const proposedFileCount = getUniqueProposedFilePaths(params).length
  if (proposedFileCount === 0) {
    return {
      proposedFileCount,
      requiredFileCount: 0,
      canReturnClean: false,
    }
  }

  const expected = getExpectedProposalFileCount(params.spawnParams)
  const expectsMultipleFiles = getProposalExpectsMultipleFiles(
    params.spawnParams,
  )
  const isComplexUnknownScope = isComplexUnknownProposalScope(
    params.spawnParams,
  )
  const requiredFileCount =
    expected > 0 ? expected : expectsMultipleFiles ? 2 : 0
  const canReturnClean =
    requiredFileCount > 0
      ? proposedFileCount >= requiredFileCount
      : !isComplexUnknownScope && proposedFileCount >= 1

  return {
    proposedFileCount,
    requiredFileCount,
    canReturnClean,
  }
}

function getExpectedProposalFileCount(spawnParams: unknown): number {
  const context = collectProposalSpawnTaskText(spawnParams)
  return Math.min(
    20,
    Math.max(
      countUniqueMatches(
        context,
        /\b(?:\.\/)?[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|yml|yaml|toml|txt)\b/g,
      ),
      inferExpectedTouchedFileCountFromText(context),
    ),
  )
}

function getProposalExpectsMultipleFiles(spawnParams: unknown): boolean {
  const context = collectProposalSpawnTaskText(spawnParams)
  return (
    getExpectedProposalFileCount(spawnParams) > 1 ||
    /\b(multi[- ]file|multiple files|cross[- ]file|several files|many files|few files|multiple pages|several pages|many pages|few pages|multiple screens|several screens)\b/i.test(
      context,
    )
  )
}

function isComplexUnknownProposalScope(spawnParams: unknown): boolean {
  const context = collectProposalSpawnTaskText(spawnParams)
  if (getExpectedProposalFileCount(spawnParams) > 0) return false
  const complexSignals = [
    /\b(multi[- ]file|multiple files|cross[- ]file|several files|many files|few files|multiple pages|several pages|many pages|few pages|multiple screens|several screens)\b/i,
    /\b(create|add|wire|integrate|refactor|implement)\b/i,
    /\b(component|screen|overlay|command|registry|schema|provider|routing|test|tests)\b/i,
    /\bphase\s+\d+\b/i,
    /\bfull[- ]screen\b/i,
  ].filter((pattern) => pattern.test(context)).length

  return complexSignals >= 3 || context.length > 8_000
}

function inferExpectedTouchedFileCountFromText(text: string): number {
  const counts: number[] = []
  const unit = String.raw`(?:files?|pages?|screens?|components?|modules?)`
  const patterns: Array<{ pattern: RegExp; offset: number }> = [
    {
      pattern: new RegExp(
        String.raw`\b(?:more\s+than|over)\s*(\d+)\s*${unit}\b`,
        'gi',
      ),
      offset: 1,
    },
    {
      pattern: new RegExp(
        String.raw`\b(?:at\s+least|minimum\s+of)\s*(\d+)\s*${unit}\b`,
        'gi',
      ),
      offset: 0,
    },
    {
      pattern: new RegExp(String.raw`\b(\d+)\s*\+\s*${unit}\b`, 'gi'),
      offset: 0,
    },
    {
      pattern: new RegExp(
        String.raw`\b(\d+)\s*${unit}(?:\s+or\s+more)?\b`,
        'gi',
      ),
      offset: 0,
    },
  ]

  for (const { pattern, offset } of patterns) {
    for (const match of text.matchAll(pattern)) {
      const parsed = Number(match[1])
      if (Number.isFinite(parsed) && parsed > 0) {
        counts.push(Math.min(20, Math.floor(parsed) + offset))
      }
    }
  }

  return counts.length === 0 ? 0 : Math.max(...counts)
}

function collectProposalSpawnTaskText(spawnParams: unknown): string {
  if (!spawnParams || typeof spawnParams !== 'object') return ''
  const params = spawnParams as Record<string, unknown>
  return [
    params.proposalStrategy,
    extractTaskFacingProposalContext(params.proposalContext),
    params.previousFailure,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
}

function extractTaskFacingProposalContext(value: unknown): string {
  if (typeof value !== 'string') return ''
  const contextMarker =
    '\nCurrent file/search context already gathered by the parent agent:'
  const markerIndex = value.indexOf(contextMarker)
  return markerIndex === -1 ? value : value.slice(0, markerIndex)
}

function countUniqueMatches(text: string, pattern: RegExp): number {
  return new Set(Array.from(text.matchAll(pattern), (match) => match[0])).size
}

function getUniqueProposedFilePaths(input: {
  toolCalls: { toolName: string; input: any }[]
  toolResults: any[]
}): string[] {
  const paths = new Set<string>()
  for (const toolCall of input.toolCalls) {
    const path = getProposalToolCallPath(toolCall)
    if (path) paths.add(path)
  }
  for (const result of input.toolResults) {
    const path = getProposalToolResultPath(result)
    if (path) paths.add(path)
  }
  return [...paths]
}

function getProposalToolCallPath(toolCall: {
  toolName: string
  input: any
}): string {
  return typeof toolCall.input?.path === 'string' ? toolCall.input.path : ''
}

function getProposalToolResultPath(result: any): string {
  if (!result || typeof result !== 'object') return ''
  if (typeof result.file === 'string') return result.file
  return typeof result.path === 'string' ? result.path : ''
}

function getMessagesSinceLastProposalRetry(messages: Message[]): Message[] {
  const lastRetryIndex = messages.findLastIndex(
    (message) =>
      Array.isArray((message as any)?.tags) &&
      (message as any).tags.includes('PROPOSAL_RETRY'),
  )
  return lastRetryIndex === -1 ? messages : messages.slice(lastRetryIndex + 1)
}

function hasProposalCompletionSignal(messages: Message[]): boolean {
  return messages.some((message) =>
    getMessageText(message).includes(EDITOR_PROPOSAL_COMPLETION_MARKER),
  )
}

function getMessageText(message: any): string {
  const content = message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((part: any) => {
      if (typeof part === 'string') return part
      if (part?.type === 'text' && typeof part.text === 'string') {
        return part.text
      }
      if (part?.type === 'json') {
        try {
          return JSON.stringify(part.value)
        } catch {
          return ''
        }
      }
      return ''
    })
    .join('\n')
}

function countToolCallsInMessages(
  messages: Message[],
  predicate: (toolName: any) => boolean,
): number {
  let count = 0
  for (const message of messages as any[]) {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      continue
    }
    for (const part of message.content) {
      if (part?.type === 'tool-call' && predicate(part.toolName)) {
        count++
      }
    }
  }
  return count
}

function isReadOnlyToolName(toolName: any): boolean {
  return (
    toolName === 'read_files' ||
    toolName === 'code_search' ||
    toolName === 'glob' ||
    toolName === 'list_directory'
  )
}

function getProposalToolCallsFromMessages(
  messages: Message[],
): { toolName: string; input: any }[] {
  const toolCalls: { toolName: string; input: any }[] = []
  for (const message of messages) {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      continue
    }
    for (const part of message.content as any[]) {
      if (part.type === 'tool-call') {
        if (isProposalToolName(part.toolName)) {
          toolCalls.push({
            toolName: part.toolName,
            input: part.input ?? part.args ?? {},
          })
        }
      } else if (part.type === 'text' && typeof part.text === 'string') {
        const matches = part.text.matchAll(
          /<codebuff_tool_call>([\s\S]*?)<\/codebuff_tool_call>/g,
        )
        for (const match of matches) {
          try {
            const parsed = JSON.parse(match[1].trim())
            const toolName = parsed.cb_tool_name
            if (isProposalToolName(toolName)) {
              const input = { ...parsed }
              delete input.cb_tool_name
              delete input.cb_easp
              toolCalls.push({ toolName, input })
            }
          } catch {
            // Ignore malformed proposal blocks during timeout recovery.
          }
        }
      }
    }
  }
  return dedupeProposalToolCalls(toolCalls)
}

function getProposalToolResults(messages: Message[]): any[] {
  const results: any[] = []
  for (const message of messages as any[]) {
    if (
      message.role !== 'tool' ||
      !Array.isArray(message.content) ||
      (message.toolName !== 'propose_str_replace' &&
        message.toolName !== 'propose_write_file')
    ) {
      continue
    }

    results.push(...getProposalToolResultValues(message.content))
  }
  return results
}

function getProposalToolResultValues(toolResult: any): any[] {
  if (!Array.isArray(toolResult)) return []
  const results: any[] = []
  for (const part of toolResult) {
    if (part?.type === 'json' && 'value' in part) {
      results.push(...flattenProposalToolResultValues(part.value))
    }
  }
  return results
}

function flattenProposalToolResultValues(value: any): any[] {
  if (Array.isArray(value)) {
    return value.flatMap(flattenProposalToolResultValues)
  }
  if (
    value &&
    typeof value === 'object' &&
    value.type === 'json' &&
    'value' in value
  ) {
    return flattenProposalToolResultValues(value.value)
  }
  return value === undefined || value === null ? [] : [value]
}

function isSuccessfulProposalToolResult(result: any): boolean {
  return Boolean(
    result &&
      typeof result === 'object' &&
      'unifiedDiff' in result &&
      typeof result.unifiedDiff === 'string' &&
      result.unifiedDiff.trim().length > 0 &&
      !getProposalResultFailureMessage(result),
  )
}

function getProposalResultFailureMessage(result: any): string {
  if (!result || typeof result !== 'object') return ''
  if (
    typeof result.errorMessage === 'string' &&
    result.errorMessage.trim().length > 0
  ) {
    return result.errorMessage.trim()
  }
  if (typeof result.error === 'string' && result.error.trim().length > 0) {
    return result.error.trim()
  }
  if (
    typeof result.message === 'string' &&
    /(?:old string[\s\S]*not found|was not found|no change to the file|skipping|found \d+ occurrences|failed|error|does not exist|same as the old content)/i.test(
      result.message,
    )
  ) {
    return result.message.trim()
  }
  return ''
}

function sanitizeRecoverableMixedProposalResults(results: any[]): any[] {
  return results.map((result) =>
    isRecoverableMixedProposalFailure(result)
      ? {
          ...result,
          message:
            'Proposed string replacement; unmatched replacement omitted from proposal.',
        }
      : result,
  )
}

function isRecoverableMixedProposalFailure(result: any): boolean {
  return Boolean(
    result &&
      typeof result === 'object' &&
      typeof result.unifiedDiff === 'string' &&
      result.unifiedDiff.trim().length > 0 &&
      typeof result.message === 'string' &&
      getFailedReplacementOldStrings(result.message).length > 0,
  )
}

function sanitizeProposalToolCallsForRecoverableFailures(input: {
  toolCalls: { toolName: string; input: any }[]
  rawToolResults: any[]
}): { toolName: string; input: any }[] {
  const failedOldStringsByPath = getRecoverableFailedOldStringsByPath(
    input.rawToolResults,
  )
  if (failedOldStringsByPath.size === 0) return input.toolCalls

  return input.toolCalls
    .map((toolCall) =>
      sanitizeProposalToolCallForRecoverableFailures(
        toolCall,
        failedOldStringsByPath,
      ),
    )
    .filter(
      (
        toolCall,
      ): toolCall is {
        toolName: string
        input: any
      } => Boolean(toolCall),
    )
}

function sanitizeProposalToolCallForRecoverableFailures(
  toolCall: { toolName: string; input: any },
  failedOldStringsByPath: Map<string, Set<string>>,
): { toolName: string; input: any } | undefined {
  if (toolCall.toolName !== 'propose_str_replace') return toolCall

  const path = getProposalToolCallPath(toolCall)
  const failedOldStrings = failedOldStringsByPath.get(path)
  if (!failedOldStrings || !Array.isArray(toolCall.input?.replacements)) {
    return toolCall
  }

  const replacements = toolCall.input.replacements.filter(
    (replacement: any) =>
      !replacementMatchesFailedOldString(replacement, failedOldStrings),
  )
  if (replacements.length === 0) return undefined
  if (replacements.length === toolCall.input.replacements.length) {
    return toolCall
  }

  return {
    ...toolCall,
    input: {
      ...toolCall.input,
      replacements,
    },
  }
}

function getRecoverableFailedOldStringsByPath(
  rawToolResults: any[],
): Map<string, Set<string>> {
  const byPath = new Map<string, Set<string>>()
  for (const result of rawToolResults) {
    if (!isRecoverableMixedProposalFailure(result)) continue

    const path = getProposalToolResultPath(result)
    if (!path) continue

    const failedOldStrings = getFailedReplacementOldStrings(result.message)
    if (failedOldStrings.length === 0) continue

    const existing = byPath.get(path) ?? new Set<string>()
    for (const oldString of failedOldStrings) {
      existing.add(oldString)
    }
    byPath.set(path, existing)
  }
  return byPath
}

function replacementMatchesFailedOldString(
  replacement: any,
  failedOldStrings: Set<string>,
): boolean {
  const oldString = getReplacementOldString(replacement)
  return Boolean(oldString && failedOldStrings.has(oldString))
}

function getReplacementOldString(replacement: any): string {
  if (!replacement || typeof replacement !== 'object') return ''
  if (typeof replacement.oldString === 'string') return replacement.oldString
  return typeof replacement.old === 'string' ? replacement.old : ''
}

function getFailedReplacementOldStrings(message: string): string[] {
  const failedOldStrings = new Set<string>()
  const quotedPatterns = [
    /old string\s+("(?:\\.|[^"\\])*")\s+was not found/gi,
    /found \d+ occurrences of\s+("(?:\\.|[^"\\])*")/gi,
  ]

  for (const pattern of quotedPatterns) {
    for (const match of message.matchAll(pattern)) {
      const parsed = parseJsonQuotedString(match[1])
      if (parsed) failedOldStrings.add(parsed)
    }
  }

  return [...failedOldStrings]
}

function parseJsonQuotedString(value: string | undefined): string {
  if (!value) return ''
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'string' ? parsed : ''
  } catch {
    return value.replace(/^"|"$/g, '')
  }
}

function filterIgnorableNoOpProposalFailures(results: any[]): any[] {
  const successfulPaths = new Set(
    results
      .filter(isSuccessfulProposalToolResult)
      .map(getProposalToolResultPath)
      .filter(Boolean),
  )
  if (successfulPaths.size === 0) return results

  return results.filter(
    (result) => !isIgnorableNoOpProposalFailure(result, successfulPaths),
  )
}

function isIgnorableNoOpProposalFailure(
  result: any,
  successfulPaths: Set<string>,
): boolean {
  const failureMessage = getProposalResultFailureMessage(result)
  if (
    !/(?:no change to the file|same as the old content)/i.test(failureMessage)
  ) {
    return false
  }

  const path = getProposalToolResultPath(result)
  return Boolean(path && successfulPaths.has(path))
}

function isProposalToolName(toolName: any): boolean {
  return (
    toolName === 'propose_str_replace' || toolName === 'propose_write_file'
  )
}

function dedupeProposalToolResults(results: any[]): any[] {
  const seen = new Set<string>()
  const deduped: any[] = []
  for (const result of results) {
    const key = getProposalToolResultKey(result)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    deduped.push(result)
  }
  return deduped
}

function getProposalToolResultKey(result: any): string {
  if (!result || typeof result !== 'object') return ''
  const file = typeof result.file === 'string' ? result.file : ''
  const unifiedDiff =
    typeof result.unifiedDiff === 'string' ? result.unifiedDiff : ''
  const errorMessage =
    typeof result.errorMessage === 'string' ? result.errorMessage : ''
  const error = typeof result.error === 'string' ? result.error : ''
  const message = typeof result.message === 'string' ? result.message : ''
  if (!file && !unifiedDiff && !errorMessage && !error && !message) {
    return ''
  }
  return [file, unifiedDiff, errorMessage, error, message].join('\0')
}

function dedupeProposalToolCalls(
  toolCalls: { toolName: string; input: any }[],
): { toolName: string; input: any }[] {
  const seen = new Set<string>()
  const deduped: { toolName: string; input: any }[] = []
  for (const toolCall of toolCalls) {
    const key = getProposalToolCallKey(toolCall)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    deduped.push(toolCall)
  }
  return deduped
}

function getProposalToolCallKey(toolCall: {
  toolName: string
  input: any
}): string {
  try {
    return `${toolCall.toolName}\0${JSON.stringify(toolCall.input)}`
  } catch {
    return toolCall.toolName
  }
}
