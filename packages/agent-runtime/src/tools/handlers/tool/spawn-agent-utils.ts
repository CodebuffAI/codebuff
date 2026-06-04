import { MAX_AGENT_STEPS_DEFAULT } from '@codebuff/common/constants/agents'
import { toolNames } from '@codebuff/common/tools/constants'
import {
  normalizeAgentIdForLookup,
  parseAgentId,
} from '@codebuff/common/util/agent-id-parsing'
import { generateCompactId } from '@codebuff/common/util/string'

import { getProposalLedger } from './proposal-ledger-store'
import { loopAgentSteps } from '../../../run-agent-step'
import { getAgentTemplate } from '../../../templates/agent-registry'
import { formatValueForError } from '../../../util/format-value'
import {
  filterUnfinishedToolCalls,
  withSystemTags,
} from '../../../util/messages'

import type { ProposalLedgerArtifact } from './proposal-ledger-store'
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
    ? ((spawnParams as Record<string, string | number>)[key] as string | number)
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
  const streamedProposalResultFiles = new Set<string>()
  const recordProposalProgress = (chunk: string | PrintModeEvent) => {
    if (!isProposalAgent) return
    if (isEditorProposalProgressChunk(chunk)) {
      timeoutSignal.recordProgress()
    }
    if (typeof chunk === 'string' || chunk.type !== 'tool_result') return
    if (!isProposalToolName(chunk.toolName)) return
    for (const file of getProposalResultDiffFiles(chunk.output)) {
      streamedProposalResultFiles.add(file)
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

  // Ledger-backed output contract: the deterministic proposal ledger — not
  // set_output — is the source of truth for proposal bundles. If a proposal
  // agent finishes "successfully" but its structured output is missing,
  // malformed, or empty (e.g. set_output never ran or failed validation),
  // rebuild the output from the recorded ledger artifacts. This is what
  // prevents "diffs were generated, then lost, but the proposal completed":
  // the edits survive even when the model's own output plumbing does not.
  if (isProposalAgent && !outputHasUsableProposal(result.output)) {
    const ledgerResult = buildRecoveredEditorProposalTimeoutResult({
      agentTemplate,
      agentState: result.agentState,
      spawnParams,
      timeoutConfig,
      timeoutMessage:
        'Recovered proposal edits from the deterministic proposal ledger because the agent did not return a usable structured proposal.',
      recoveryReason: 'ledgerFallback',
    })
    if (ledgerResult) {
      // Preserve the live agentState/childRunIds bookkeeping; only swap the
      // output for the ledger-derived proposal bundle.
      result = { ...result, output: ledgerResult.output }
    }
  }

  if (isProposalAgent) {
    emitMissingProposalLedgerEvents({
      agentState: result.agentState,
      parentAgentId: parentAgentState.agentId,
      streamedProposalResultFiles,
      onResponseChunk,
    })
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

function isProposalToolName(
  toolName: string,
): toolName is ProposalLedgerArtifact['toolName'] {
  return (
    toolName === 'propose_str_replace' ||
    toolName === 'propose_write_file' ||
    toolName === 'propose_edit_transaction'
  )
}

function getProposalResultDiffFiles(output: unknown): string[] {
  if (!Array.isArray(output)) return []
  const files = new Set<string>()
  for (const part of output) {
    if (!part || typeof part !== 'object') continue
    const value = (part as { value?: unknown }).value
    if (!value || typeof value !== 'object') continue
    const record = value as Record<string, unknown>
    const file =
      typeof record.file === 'string'
        ? record.file
        : typeof record.path === 'string'
          ? record.path
          : ''
    if (
      file &&
      (typeof record.unifiedDiff === 'string' ||
        typeof record.patch === 'string')
    ) {
      files.add(file)
    }
    if (Array.isArray(record.files)) {
      for (const entry of record.files) {
        if (!entry || typeof entry !== 'object') continue
        const fileEntry = entry as Record<string, unknown>
        const nestedFile =
          typeof fileEntry.file === 'string'
            ? fileEntry.file
            : typeof fileEntry.path === 'string'
              ? fileEntry.path
              : ''
        if (
          nestedFile &&
          (typeof fileEntry.unifiedDiff === 'string' ||
            typeof fileEntry.patch === 'string')
        ) {
          files.add(nestedFile)
        }
      }
    }
  }
  return [...files]
}

function getAvailableProposalLedger(
  agentState: AgentState,
): ProposalLedgerArtifact[] {
  const liveLedger = agentState.runId ? getProposalLedger(agentState.runId) : []
  if (liveLedger.length > 0) return liveLedger

  return Array.isArray((agentState as any).proposalLedger)
    ? ((agentState as any).proposalLedger as ProposalLedgerArtifact[])
    : []
}

function emitMissingProposalLedgerEvents(params: {
  agentState: AgentState
  parentAgentId: string
  streamedProposalResultFiles: Set<string>
  onResponseChunk: (chunk: string | PrintModeEvent) => void
}): void {
  const {
    agentState,
    parentAgentId,
    streamedProposalResultFiles,
    onResponseChunk,
  } = params
  const ledger = getAvailableProposalLedger(agentState)
  if (ledger.length === 0) return

  for (const artifact of ledger) {
    const file = artifact.result.file
    if (!file || streamedProposalResultFiles.has(file)) continue
    const toolCallId = `proposal-ledger-${agentState.runId}-${artifact.seq}`
    const resultValue =
      artifact.toolName === 'propose_edit_transaction'
        ? {
            message: artifact.result.message ?? `Proposed changes to ${file}`,
            files: [
              {
                file,
                ...(artifact.result.unifiedDiff
                  ? { unifiedDiff: artifact.result.unifiedDiff }
                  : {}),
                ...(artifact.result.message
                  ? { messages: [artifact.result.message] }
                  : {}),
              },
            ],
            ...(artifact.result.errorMessage
              ? { errorMessage: artifact.result.errorMessage }
              : {}),
          }
        : {
            file,
            ...(artifact.result.unifiedDiff
              ? { unifiedDiff: artifact.result.unifiedDiff }
              : {}),
            ...(artifact.result.message
              ? { message: artifact.result.message }
              : {}),
            ...(artifact.result.errorMessage
              ? { errorMessage: artifact.result.errorMessage }
              : {}),
          }
    onResponseChunk({
      type: 'tool_call',
      toolCallId,
      toolName: artifact.toolName,
      input: buildApplyableProposalInput(artifact),
      agentId: agentState.agentId,
      parentAgentId,
      includeToolCall: false,
    })
    onResponseChunk({
      type: 'tool_result',
      toolCallId,
      toolName: artifact.toolName,
      output: [
        {
          type: 'json',
          value: resultValue,
        },
      ],
      agentId: agentState.agentId,
      parentAgentId,
    })
    streamedProposalResultFiles.add(file)
  }
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

/**
 * Deterministically summarize the proposal ledger into the parent-facing shape
 * ({ toolCalls, toolResults, unifiedDiffs }). This MUST mirror the implementor's
 * own `summarizeLedger` so a recovered (timeout/provider-error) bundle is byte
 * identical to a normally-completed one for the same recorded artifacts. It is
 * file-count and time agnostic: every successful artifact survives, failures on
 * files that ultimately succeeded are dropped, and genuine failures are kept as
 * telemetry for the parent's completion/repair path.
 */
// Collapse multiple successful edits to the SAME file into the minimal
// deterministic set the parent can apply, regardless of file count or number of
// calls. When artifacts carry finalContent and are independent of a transaction,
// the last successful artifact for that file is the resolved proposed-content
// overlay state, so applying earlier intermediate edits is unnecessary and can
// reintroduce anchor staleness. Files touched by propose_edit_transaction keep
// their ordered artifacts so the transaction fallback and any later same-file
// edits replay consistently. This MUST mirror the implementor's
// reconcileSuccessfulArtifactsByFile so a recovered bundle is byte-identical to
// a normally-completed one for the same artifacts.
function reconcileSuccessfulProposalArtifactsByFile(
  successfulInOrder: ProposalLedgerArtifact[],
): ProposalLedgerArtifact[] {
  const transactionTouchedFiles = new Set(
    successfulInOrder
      .filter((artifact) => artifact.toolName === 'propose_edit_transaction')
      .map((artifact) => artifact.result.file)
      .filter(Boolean),
  )
  const keptByFile = new Map<string, ProposalLedgerArtifact[]>()
  for (const artifact of successfulInOrder) {
    const file = artifact.result.file
    if (!file) continue
    if (
      typeof artifact.result.finalContent === 'string' &&
      !transactionTouchedFiles.has(file)
    ) {
      keptByFile.set(file, [artifact])
      continue
    }
    if (artifact.toolName === 'propose_write_file') {
      if (transactionTouchedFiles.has(file)) {
        const existing = keptByFile.get(file)
        const artifactForOrderedReplay =
          stripProposalFinalContentMetadata(artifact)
        if (existing) {
          existing.push(artifactForOrderedReplay)
        } else {
          keptByFile.set(file, [artifactForOrderedReplay])
        }
      } else {
        // Full rewrite resets this file's accumulated legacy edits.
        keptByFile.set(file, [artifact])
      }
      continue
    }
    const existing = keptByFile.get(file)
    if (existing) {
      existing.push(artifact)
    } else {
      keptByFile.set(file, [artifact])
    }
  }
  const seen = new Set<string>()
  const ordered: ProposalLedgerArtifact[] = []
  for (const artifact of successfulInOrder) {
    const file = artifact.result.file
    if (!file || seen.has(file)) continue
    seen.add(file)
    ordered.push(...(keptByFile.get(file) ?? []))
  }
  return ordered
}

function stripProposalFinalContentMetadata(
  artifact: ProposalLedgerArtifact,
): ProposalLedgerArtifact {
  if (typeof artifact.result.finalContent !== 'string') return artifact
  const { finalContent: _finalContent, ...result } = artifact.result
  return { ...artifact, result }
}

// Collapse the per-file duplicates a single propose_edit_transaction records
// (one ledger artifact per changed file, all sharing the same transaction
// input) down to one apply tool call per unique transaction, preserving
// first-seen order. propose_str_replace/propose_write_file calls are passed
// through untouched because their per-file ordering is load-bearing for
// sequential apply. This MUST mirror the implementor's dedupeTransactionToolCalls
// so a recovered bundle is byte-identical to a normally-completed one.
function dedupeProposalTransactionToolCalls(
  toolCalls: { toolName: string; input: any }[],
): { toolName: string; input: any }[] {
  const seenTransactionSignatures = new Set<string>()
  const deduped: { toolName: string; input: any }[] = []
  for (const toolCall of toolCalls) {
    if (toolCall.toolName !== 'propose_edit_transaction') {
      deduped.push(toolCall)
      continue
    }
    let signature: string
    try {
      signature = JSON.stringify(sanitizeProposalMetadata(toolCall.input))
    } catch {
      // Non-serializable input can't be safely deduped; keep it as-is.
      deduped.push(toolCall)
      continue
    }
    if (seenTransactionSignatures.has(signature)) continue
    seenTransactionSignatures.add(signature)
    deduped.push(toolCall)
  }
  return deduped
}

function sanitizeProposalMetadata(input: any): any {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input
  }
  const {
    __proposalFile: _proposalFile,
    __proposalFinalContent: _finalContent,
    __proposalBaseContentHash: _baseContentHash,
    __proposalBaseContent: _baseContent,
    ...rest
  } = input
  return rest
}

function getProposalTransactionSignature(
  artifact: ProposalLedgerArtifact,
): string | undefined {
  try {
    return JSON.stringify(sanitizeProposalMetadata(artifact.input))
  } catch {
    return undefined
  }
}

function isSuccessfulProposalArtifact(
  artifact: ProposalLedgerArtifact,
): boolean {
  return (
    artifact?.result?.ok === true &&
    typeof artifact.result.unifiedDiff === 'string' &&
    artifact.result.unifiedDiff.trim().length > 0
  )
}

function toProposalToolResult(artifact: ProposalLedgerArtifact): any {
  const { file, unifiedDiff, message, errorMessage } = artifact.result
  return {
    file,
    ...(unifiedDiff ? { unifiedDiff } : {}),
    ...(message ? { message } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  }
}

function summarizeProposalToolResults(
  artifacts: ProposalLedgerArtifact[],
): any[] {
  const seenTransactions = new Set<string>()

  return artifacts.flatMap((artifact) => {
    if (
      artifact.toolName !== 'propose_edit_transaction' ||
      !isSuccessfulProposalArtifact(artifact)
    ) {
      return [toProposalToolResult(artifact)]
    }

    const signature = getProposalTransactionSignature(artifact)
    if (!signature) {
      return [
        {
          message:
            artifact.result.message ??
            `Proposed changes to ${artifact.result.file}`,
          files: [
            {
              file: artifact.result.file,
              ...(artifact.result.unifiedDiff
                ? { unifiedDiff: artifact.result.unifiedDiff }
                : {}),
              ...(artifact.result.message
                ? { messages: [artifact.result.message] }
                : {}),
            },
          ],
        },
      ]
    }
    if (seenTransactions.has(signature)) return []
    seenTransactions.add(signature)

    const files = artifacts
      .filter(
        (candidate) =>
          candidate.toolName === 'propose_edit_transaction' &&
          isSuccessfulProposalArtifact(candidate) &&
          getProposalTransactionSignature(candidate) === signature,
      )
      .map((candidate) => ({
        file: candidate.result.file,
        ...(candidate.result.unifiedDiff
          ? { unifiedDiff: candidate.result.unifiedDiff }
          : {}),
        ...(candidate.result.message
          ? { messages: [candidate.result.message] }
          : {}),
      }))

    return [
      {
        message:
          artifact.result.message ??
          `Proposed transaction changing ${files.length} file${
            files.length === 1 ? '' : 's'
          }`,
        files,
      },
    ]
  })
}

function summarizeProposalLedger(ledger: ProposalLedgerArtifact[]): {
  toolCalls: { toolName: string; input: any }[]
  toolResults: any[]
  unifiedDiffs: string
} {
  const successful = reconcileSuccessfulProposalArtifactsByFile(
    ledger.filter(isSuccessfulProposalArtifact),
  )
  const successfulFiles = new Set(
    successful.map((artifact) => artifact.result.file).filter(Boolean),
  )

  // propose_edit_transaction records ONE ledger artifact per changed file,
  // each carrying the SAME full transaction input. The parent applies one
  // real edit_transaction per tool call, so emitting one tool call per file
  // would re-apply the same transaction N times — the first applies cleanly
  // and the rest fail against the already-changed files (diffs appear
  // generated, then lost, while the proposal still completes). Collapse
  // duplicate transaction artifacts to one apply tool call.
  const toolCalls = dedupeProposalTransactionToolCalls(
    successful.map((artifact) => ({
      toolName: artifact.toolName,
      input: buildApplyableProposalInput(artifact),
    })),
  )

  const resultArtifacts = ledger.filter(
    (artifact) =>
      isSuccessfulProposalArtifact(artifact) ||
      !(artifact.result.file && successfulFiles.has(artifact.result.file)),
  )
  const toolResults = summarizeProposalToolResults(resultArtifacts)

  const unifiedDiffs = successful
    .map(
      (artifact) =>
        `--- ${artifact.result.file} ---\n${artifact.result.unifiedDiff}`,
    )
    .join('\n\n')

  return { toolCalls, toolResults, unifiedDiffs }
}

function buildApplyableProposalInput(artifact: ProposalLedgerArtifact): any {
  const result = artifact.result
  return {
    ...artifact.input,
    ...(result.file ? { __proposalFile: result.file } : {}),
    ...(typeof result.finalContent === 'string'
      ? { __proposalFinalContent: result.finalContent }
      : {}),
    ...('baseContentHash' in result
      ? { __proposalBaseContentHash: result.baseContentHash ?? null }
      : {}),
    ...('baseContent' in result
      ? { __proposalBaseContent: result.baseContent ?? null }
      : {}),
  }
}

/*
 * A proposal agent's output is "usable" only when its structured output
 * carries ledger-shaped per-file results with generated diffs. Bare tool calls
 * or aggregate diff text are not enough; those should fall back to the live
 * deterministic proposal ledger.
 */
function outputHasUsableProposal(output: unknown): boolean {
  if (
    !output ||
    typeof output !== 'object' ||
    (output as { type?: unknown }).type !== 'structuredOutput'
  ) {
    return false
  }
  const value = (output as { value?: unknown }).value
  if (!value || typeof value !== 'object') return false
  // Bare proposal tool calls, or aggregate diff text without per-file tool
  // results, are NOT usable. The proposal ledger is the single source of truth;
  // the only structured output we trust is the ledger-shaped summary containing
  // successful materialized edit results. If those are missing, fall back to the
  // live ledger so the runtime either recovers the real artifacts or correctly
  // reports no proposal.
  const toolResults = (value as { toolResults?: unknown }).toolResults
  return (
    Array.isArray(toolResults) &&
    toolResults.some(
      (result) =>
        Boolean(result) &&
        typeof result === 'object' &&
        typeof (result as { unifiedDiff?: unknown }).unifiedDiff === 'string' &&
        (result as { unifiedDiff: string }).unifiedDiff.trim().length > 0,
    )
  )
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
  recoveryReason?: 'timeout' | 'providerError' | 'ledgerFallback'
}): Awaited<ReturnType<typeof loopAgentSteps>> | undefined {
  const {
    agentTemplate,
    agentState,
    timeoutConfig,
    timeoutMessage,
    recoveryReason = 'timeout',
  } = params
  if (!isEditorProposalAgent(agentTemplate.id)) {
    return undefined
  }

  // Recovery is deterministic: read the same append-only proposal ledger the
  // implementor finalizes from. Never reconstruct artifacts from message
  // history, which can be truncated/aborted mid-stream — that fragile path is
  // exactly what dropped long-running multi-file proposals on timeout.
  const liveLedger = agentState.runId ? getProposalLedger(agentState.runId) : []
  const snapshottedLedger = Array.isArray((agentState as any).proposalLedger)
    ? ((agentState as any).proposalLedger as ProposalLedgerArtifact[])
    : []
  const ledgerSummary = summarizeProposalLedger(
    liveLedger.length > 0 ? liveLedger : snapshottedLedger,
  )
  const latestAttemptMessages = getMessagesSinceLastProposalRetry(
    agentState.messageHistory,
  )
  const toolCalls = ledgerSummary.toolCalls
  const toolResults = ledgerSummary.toolResults
  const unifiedDiffs = ledgerSummary.unifiedDiffs

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
            : recoveryReason === 'providerError'
              ? { recoveredFromProviderError: true }
              : { recoveredFromLedger: true }),
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
  recoveryReason: 'timeout' | 'providerError' | 'ledgerFallback'
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
    recoveredFromLedger: recoveryReason === 'ledgerFallback',
  }
}

/**
 * Derive the recovered bundle's stop reason from the recorded artifacts only —
 * never from prose, filename counting, or completion markers. The ledger is the
 * single source of truth: whatever proposal calls actually executed and produced
 * diffs are exactly what the parent receives, regardless of file count or time
 * taken. Any genuine per-file failure (one no later success superseded) marks
 * the bundle partial so the parent's completion/repair path runs; a fully
 * successful set is clean; nothing at all is no-proposal.
 */
function inferRecoveredProposalStopReason(params: {
  toolCalls: { toolName: string; input: any }[]
  toolResults: any[]
  unifiedDiffs: string
}): 'cleanProposal' | 'noCompletionSignal' | 'noProposal' {
  const { toolCalls, toolResults, unifiedDiffs } = params
  if (toolCalls.length === 0 && !unifiedDiffs) return 'noProposal'
  const hasGenuineFailure = toolResults.some((result) =>
    Boolean(getProposalResultFailureMessage(result)),
  )
  return hasGenuineFailure ? 'noCompletionSignal' : 'cleanProposal'
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
