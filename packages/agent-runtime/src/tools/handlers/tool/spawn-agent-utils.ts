import { MAX_AGENT_STEPS_DEFAULT } from '@codebuff/common/constants/agents'
import { toolNames } from '@codebuff/common/tools/constants'
import {
  normalizeAgentIdForLookup,
  parseAgentId,
} from '@codebuff/common/util/agent-id-parsing'
import { withTimeout } from '@codebuff/common/util/promise'
import { generateCompactId } from '@codebuff/common/util/string'

import { loopAgentSteps } from '../../../run-agent-step'
import { getAgentTemplate } from '../../../templates/agent-registry'
import { formatValidationIssues } from '../../../util/format-validation-issues'
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
 * Agent IDs that have unrestricted spawning permissions.
 *
 * Base agents can spawn any agent type directly via `normalizeAgentIdForLookup`;
 * non-base agents must declare the child agent in their `spawnableAgents` list
 * and pass through `getMatchingSpawn`. Centralizing this list here keeps the
 * runtime's `validateAndGetAgentTemplate` and `tool-executor.ts` pre-validation
 * paths in lockstep — adding a new base agent is now a single edit.
 */
export const BASE_AGENT_IDS = [
  'base',
  'base-free',
  'base-max',
  'base-experimental',
] as const

/**
 * Returns true if the given agent ID is a base agent with unrestricted
 * spawning permissions. Shared by `validateAndGetAgentTemplate` and the
 * `tool-executor.ts` spawn_agents pre-validation block.
 */
export function isBaseAgent(agentId: string): boolean {
  return (BASE_AGENT_IDS as readonly string[]).includes(agentId)
}

/**
 * Canonical error message when a requested spawn target is a tool rather than
 * an agent. Centralized so wording stays consistent across every callsite that
 * rejects a tool-name being passed to `spawn_agents` / `spawn_agent_inline`.
 */
export function toolNotAgentError(agentTypeStr: string): string {
  return `"${agentTypeStr}" is a tool, not an agent. Call it directly as a tool instead of wrapping it in spawn_agents.`
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
  const isParentBaseAgent = isBaseAgent(parentAgentTemplate.id)
  const agentType = isParentBaseAgent
    ? normalizeAgentIdForLookup(agentTypeStr)
    : getMatchingSpawn(parentAgentTemplate.spawnableAgents, agentTypeStr)

  if (!agentType) {
    if (toolNames.includes(agentTypeStr as any)) {
      throw new Error(toolNotAgentError(agentTypeStr))
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
      throw new Error(toolNotAgentError(agentTypeStr))
    }
    throw new Error(`Agent type ${agentTypeStr} not found.`)
  }

  return { agentTemplate, agentType }
}

export function buildSpawnParamsWithHandoff(params: {
  agentType: string
  handoff?: unknown
  spawnParams?: Record<string, unknown>
}): Record<string, unknown> | undefined {
  const { agentType, handoff, spawnParams } = params

  if (handoff === undefined) {
    return spawnParams
  }

  if (
    spawnParams &&
    Object.prototype.hasOwnProperty.call(spawnParams, 'handoff')
  ) {
    throw new Error(
      `Invalid handoff for agent ${agentType}: use the top-level handoff field, not params.handoff.`,
    )
  }

  return {
    ...(spawnParams ?? {}),
    handoff,
  }
}

/**
 * Required labeled sections in an editor agent's implementation brief, each
 * with lenient case-insensitive alias substrings used to detect the field's
 * presence. A field is considered present if ANY of its aliases appears as a
 * substring of the lowercased prompt.
 */
const REQUIRED_EDITOR_BRIEF_FIELDS: { label: string; aliases: string[] }[] = [
  { label: 'Requirements', aliases: ['Requirements', 'implementation task'] },
  { label: 'Target files', aliases: ['Target files'] },
  {
    label: 'Constraints/non-goals',
    aliases: ['Constraints/non-goals', 'Constraints', 'non-goals'],
  },
  { label: 'Patterns', aliases: ['Patterns', 'relevant patterns'] },
  { label: 'Risks', aliases: ['Risks', 'code-level risks'] },
]

/**
 * Returns the labels of required editor brief fields whose NO alias is present
 * in the (lowercased) prompt. A field is considered present if any of its
 * aliases appears as a case-insensitive substring. Returns ALL labels for an
 * empty/whitespace prompt.
 */
function findMissingEditorBriefFields(prompt: string): string[] {
  const lower = prompt.toLowerCase()
  return REQUIRED_EDITOR_BRIEF_FIELDS.filter(
    (field) =>
      !field.aliases.some((alias) => lower.includes(alias.toLowerCase())),
  ).map((field) => field.label)
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
        `Invalid prompt for agent ${agentType}: ${formatValidationIssues({ issues: result.error.issues })}\n\nOriginal prompt value:\n${formatValueForError(prompt ?? '')}`,
      )
    }
  }

  if (agentType === 'editor') {
    const trimmedPrompt = (prompt ?? '').trim()
    const missingFields = findMissingEditorBriefFields(trimmedPrompt)
    const header =
      'Editor agent requires a concrete implementation brief in the prompt.'
    if (!trimmedPrompt) {
      // Empty prompt: list ALL required fields so the caller knows the full
      // expected shape.
      throw new Error(
        [
          header,
          'Missing brief fields/sections:',
          ...REQUIRED_EDITOR_BRIEF_FIELDS.map(
            (field) => `- ${field.label}`,
          ),
          'Do not rely on parent conversation history.',
        ].join('\n'),
      )
    }
    if (missingFields.length > 0) {
      // Non-empty but incomplete: list ONLY the actually-missing fields so
      // the error is actionable rather than a generic “include everything”.
      throw new Error(
        [
          header,
          'Missing brief fields/sections:',
          ...missingFields.map((label) => `- ${label}`),
          'Re-spawn the editor with a prompt that includes all of the above as labeled sections. Do not rely on parent conversation history.',
        ].join('\n'),
      )
    }
  }

  // Validate params if schema exists
  if (inputSchema.params) {
    const result = inputSchema.params.safeParse(params ?? {})
    if (!result.success) {
      throw new Error(
        `Invalid params for agent ${agentType}: ${formatValidationIssues({ issues: result.error.issues })}\n\nOriginal params value:\n${formatValueForError(params ?? {})}`,
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
    cacheInputTokens: 0,
    cacheTotalInputTokens: 0,
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
 * Default wall-clock bound for a single subagent execution. A stuck subagent
 * would otherwise burn up to {@link MAX_AGENT_STEPS_DEFAULT} steps; this
 * unblocks the parent after a generous 20-minute window. The timeout now aborts
 * the AbortController threaded into loopAgentSteps (via AbortSignal.any with
 * the parent signal), so the stuck LLM stream is actually cancelled rather than
 * orphaned.
 */
const DEFAULT_SUBAGENT_TIMEOUT_MS = 20 * 60 * 1000

/**
 * Resolves the wall-clock timeout (ms) for a subagent execution, in precedence
 * order: explicit per-spawn override > agent template default > shared
 * DEFAULT_SUBAGENT_TIMEOUT_MS. A non-positive value (-1, 0) disables the
 * timeout entirely (used by genuinely long-running agents).
 */
export function resolveSubagentTimeoutMs(
  agentTemplate: AgentTemplate,
  subagentTimeoutMs?: number,
): number {
  if (subagentTimeoutMs !== undefined) {
    return subagentTimeoutMs
  }
  if (agentTemplate.defaultTimeoutMs !== undefined) {
    return agentTemplate.defaultTimeoutMs
  }
  return DEFAULT_SUBAGENT_TIMEOUT_MS
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
      subagentTimeoutMs?: number
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
    subagentTimeoutMs,
  } = withDefaults

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

  // Thread an AbortController through withTimeout so the deadline actually
  // cancels the underlying loopAgentSteps stream. The subagent's signal is the
  // combination of the parent's signal (so a user/parent-level abort still
  // propagates) and the timeout controller (so the deadline cancels this
  // subagent without affecting its siblings). AbortSignal.any is available in
  // Node 20+ and Bun. If unavailable at runtime, fall back to a manual
  // EventTarget bridge so this stays safe on older runtimes.
  const resolvedTimeoutMs = resolveSubagentTimeoutMs(agentTemplate, subagentTimeoutMs)
  const timeoutController =
    resolvedTimeoutMs > 0 ? new AbortController() : undefined
  const parentSignal = withDefaults.signal
  const subagentSignal =
    timeoutController && parentSignal
      ? (AbortSignal as any).any
        ? (AbortSignal as any).any([parentSignal, timeoutController.signal])
        : createCombinedAbortSignal(parentSignal, timeoutController.signal)
      : timeoutController
        ? timeoutController.signal
        : parentSignal

  let result
  let timedOut = false
  try {
    result = await withTimeout(
      loopAgentSteps({
        ...withDefaults,
        signal: subagentSignal as AbortSignal,
        onResponseChunk,
        // Don't propagate parent's image content to subagents.
        // If subagents need to see images, they get them through includeMessageHistory,
        // not by creating new image-containing messages for their prompts.
        content: undefined,
        ancestorRunIds: [...ancestorRunIds, parentAgentState.runId ?? ''],
        agentType: agentTemplate.id,
      }),
      resolvedTimeoutMs,
      `Subagent ${agentTemplate.id} exceeded wall-clock timeout of ${resolvedTimeoutMs}ms`,
      timeoutController ? { controller: timeoutController } : {},
    )
  } catch (error) {
    // withTimeout rejects on deadline and has already aborted timeoutController,
    // which cancels loopAgentSteps via the combined signal (loopAgentSteps checks
    // signal.aborted at lines 889/1104/1369). Emit a finish event so the UI
    // doesn't show a subagent that started but never finished, then re-throw so
    // the parent sees the error via Promise.allSettled.
    timedOut = true
    onResponseChunk({
      type: 'subagent_finish',
      agentId: withDefaults.agentState.agentId,
      agentType: agentTemplate.id,
      displayName: agentTemplate.displayName,
      onlyChild: isOnlyChild,
      parentAgentId: parentAgentState.agentId,
      prompt,
      params: spawnParams,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }

  if (!timedOut) {
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
  }

  if (result.agentState.runId) {
    parentAgentState.childRunIds.push(result.agentState.runId)
  }

  return result
}

/**
 * Fallback combiner for runtimes without AbortSignal.any (Node < 20, very old
 * Bun). Returns an AbortSignal that fires as soon as EITHER input signal fires.
 * Aborts with the reason from whichever signal fired first. Used only when
 * AbortSignal.any is unavailable at runtime.
 */
export function createCombinedAbortSignal(
  a: AbortSignal,
  b: AbortSignal,
): AbortSignal {
  const controller = new AbortController()
  const abort = (reason?: any) => {
    if (!controller.signal.aborted) {
      try {
        controller.abort(reason)
      } catch {
        // ignore — never let the bridge throw
      }
    }
  }
  if (a.aborted) {
    abort(a.reason)
  } else {
    a.addEventListener('abort', () => abort(a.reason), { once: true })
  }
  if (b.aborted) {
    abort(b.reason)
  } else {
    b.addEventListener('abort', () => abort(b.reason), { once: true })
  }
  return controller.signal
}

