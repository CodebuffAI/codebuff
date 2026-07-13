import {
  MAX_AGENT_STEPS_DEFAULT,
  MAX_SPAWN_DEPTH_DEFAULT,
} from '@codebuff/common/constants/agents'
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

const SPAWN_AGENT_TYPE_ALIASES: Readonly<Record<string, string>> = {
  'code-searccher': 'code-searcher',
}

/**
 * Canonicalizes known agent-name typos before permission checks and template
 * lookup. Keep this list narrow so legitimate custom agent IDs are unaffected.
 */
export function normalizeSpawnAgentType(agentTypeStr: string): string {
  return SPAWN_AGENT_TYPE_ALIASES[agentTypeStr] ?? agentTypeStr
}

/**
 * Checks if a parent agent is allowed to spawn a child agent
 */
export function getMatchingSpawn(
  spawnableAgents: AgentTemplateType[],
  childFullAgentId: string,
) {
  const normalizedChildAgentId = normalizeSpawnAgentType(childFullAgentId)
  const {
    publisherId: childPublisherId,
    agentId: childAgentId,
    version: childVersion,
  } = parseAgentId(normalizeAgentIdForLookup(normalizedChildAgentId))

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
  const normalizedAgentType = normalizeSpawnAgentType(agentTypeStr)
  const isParentBaseAgent = isBaseAgent(parentAgentTemplate.id)
  const agentType = isParentBaseAgent
    ? normalizeAgentIdForLookup(normalizedAgentType)
    : getMatchingSpawn(parentAgentTemplate.spawnableAgents, normalizedAgentType)

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

  const normalizedHandoff =
    handoff && typeof handoff === 'object' && !Array.isArray(handoff)
      ? (() => {
          const record = handoff as Record<string, unknown>
          return typeof record.context === 'string'
            ? { ...record, context: { text: record.context } }
            : record
        })()
      : handoff

  return {
    ...(spawnParams ?? {}),
    handoff: normalizedHandoff,
  }
}

export function validateVersionedAgentHandoff(params: {
  agentType: string
  handoff: unknown
}): void {
  if (params.agentType !== 'repair-editor') return
  const record = params.handoff as Record<string, unknown> | undefined
  const findings = record?.findings
  if (
    record?.schemaVersion !== 1 ||
    typeof record.taskId !== 'string' ||
    typeof record.objective !== 'string' ||
    !Array.isArray(findings) ||
    findings.length === 0 ||
    !record.permissions
  ) {
    throw new Error(
      'repair-editor requires a versioned handoff with schemaVersion: 1, taskId, objective, at least one finding, and explicit permissions.',
    )
  }
}

export function normalizeSpawnedAgentOutput(output: any): any {
  if (
    output &&
    typeof output === 'object' &&
    !Array.isArray(output) &&
    (output as Record<string, unknown>).type === 'error'
  ) {
    const message = (output as Record<string, unknown>).message
    return {
      errorMessage:
        typeof message === 'string' && message.trim()
          ? message
          : 'Subagent failed before producing output',
    }
  }
  return output
}

const REQUIRED_EDITOR_BRIEF_FIELDS = [
  'Requirements',
  'Target files',
  'Constraints/non-goals',
  'Patterns',
  'Risks',
] as const

const EMPTY_EDITOR_SECTION_VALUES = new Set([
  '',
  'n/a',
  'na',
  'none',
  'none.',
  'not applicable',
  'tbd',
  'unknown',
  '-',
])

function findMissingEditorBriefFields(prompt: string): string[] {
  // Accept both compact labels (`Requirements:`) and ordinary Markdown
  // headings (`## Requirements`). Models frequently choose the latter even
  // when the handoff prompt shows colon labels.
  const headingPattern =
    /^\s*(?:(?:#{1,4}\s+)([^:\n]+?)(?::\s*(.*))?|([^:\n]+):\s*(.*))$/gm
  const matches = [...prompt.matchAll(headingPattern)]
  const values = new Map<string, string>()
  for (const [index, match] of matches.entries()) {
    const start = (match.index ?? 0) + match[0].length
    const end = matches[index + 1]?.index ?? prompt.length
    const label = (match[1] ?? match[3] ?? '').trim().toLowerCase()
    const inlineValue = (match[2] ?? match[4] ?? '').trim()
    const followingLines = prompt.slice(start, end).trim()
    values.set(
      label,
      [inlineValue, followingLines].filter(Boolean).join('\n').trim(),
    )
  }
  const valueFor = (label: (typeof REQUIRED_EDITOR_BRIEF_FIELDS)[number]) => {
    const aliases =
      label === 'Constraints/non-goals'
        ? ['constraints/non-goals', 'constraints', 'non-goals']
        : label === 'Patterns'
          ? ['patterns', 'relevant patterns']
          : label === 'Risks'
            ? ['risks', 'code-level risks']
            : [label.toLowerCase()]
    return aliases
      .map((alias) => values.get(alias)?.trim())
      .find(
        (value) =>
          value !== undefined &&
          !EMPTY_EDITOR_SECTION_VALUES.has(value.toLowerCase()),
      )
  }
  return REQUIRED_EDITOR_BRIEF_FIELDS.filter((label) => !valueFor(label))
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

  if (
    agentTemplate.id === 'editor' ||
    normalizeAgentIdForLookup(agentType) === 'editor'
  ) {
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
          ...REQUIRED_EDITOR_BRIEF_FIELDS.map((field) => `- ${field}`),
          'Do not rely on parent conversation history.',
        ].join('\n'),
      )
    }
    if (missingFields.length > 0) {
      const hasConcreteTargetPath =
        /(?:^|[\s`'"(])(?:\.\.?\/)?[\w@.-]+(?:\/[\w@.-]+)+\.[A-Za-z][\w.-]*/m.test(
          trimmedPrompt,
        )
      const hasActionableImplementationRequest =
        trimmedPrompt.length >= 80 &&
        /\b(?:add|build|change|create|edit|fix|implement|update|wire)\b/i.test(
          trimmedPrompt,
        )

      // Models frequently produce a concrete prose implementation brief rather
      // than the preferred five labeled sections. Accept that equivalent shape
      // when it names at least one real target file and contains a substantive
      // implementation action; keep rejecting vague/incidental prompts.
      if (!hasConcreteTargetPath || !hasActionableImplementationRequest) {
        // Non-empty but incomplete: list ONLY the actually-missing fields so
        // the error is actionable rather than a generic “include everything”.
        throw new Error(
          [
            header,
            'Missing brief fields/sections:',
            ...missingFields.map((label) => `- ${label}`),
            'Re-spawn the editor with a prompt that includes all of the above as labeled sections, or provide a concrete prose implementation brief naming the exact target files. Do not rely on parent conversation history.',
          ].join('\n'),
        )
      }
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
    contextWindowTokens: parentAgentState.contextWindowTokens,
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
      agentTemplate: {
        id: agentTemplate.id,
        displayName: agentTemplate.displayName,
        model: agentTemplate.model,
        toolNames: agentTemplate.toolNames,
        programmaticToolNames: agentTemplate.programmaticToolNames,
        spawnableAgents: agentTemplate.spawnableAgents,
        mcpServerNames: Object.keys(agentTemplate.mcpServers ?? {}),
      },
      prompt,
      params: spawnParams,
      agentId,
      parentId,
    },
    `Spawning agent${inline ? ' inline' : ''} — ${agentType} (${agentId})`,
  )
}

/**
 * Default wall-clock bound for a single subagent execution. This unblocks the
 * parent after a generous 20-minute window even when each step differs enough
 * to avoid the repeated-step watchdog. The timeout aborts
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
      spawnToolCallId?: string
      spawnIndex?: number
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
    spawnToolCallId,
    spawnIndex,
  } = withDefaults

  // Enforce a max spawn depth to prevent unbounded subagent recursion
  // (e.g. file-picker -> file-picker -> ...). The root orchestrator runs at
  // depth 0; each spawn increments depth by 1. ancestorRunIds accumulates one
  // entry per ancestor, so its length equals the current parent's depth.
  const currentDepth = parentAgentState.ancestorRunIds.length
  const maxSpawnDepth = (agentTemplate.maxSpawnDepth ??
    MAX_SPAWN_DEPTH_DEFAULT) as number
  if (currentDepth + 1 > maxSpawnDepth) {
    throw new Error(
      `Maximum spawn depth (${maxSpawnDepth}) reached: cannot spawn agent "${agentTemplate.id}" at depth ${currentDepth + 1}. ` +
        `Re-evaluate whether this subagent is necessary, or perform the work directly in the current agent. ` +
        `Configure "maxSpawnDepth" on the agent template (or MAX_SPAWN_DEPTH_DEFAULT in common/src/constants/agents.ts) to raise the limit.`,
    )
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
    spawnToolCallId,
    spawnIndex,
  }
  onResponseChunk(startEvent)

  // Thread an AbortController through withTimeout so the deadline actually
  // cancels the underlying loopAgentSteps stream. The subagent's signal is the
  // combination of the parent's signal (so a user/parent-level abort still
  // propagates) and the timeout controller (so the deadline cancels this
  // subagent without affecting its siblings). AbortSignal.any is available in
  // Node 20+ and Bun. If unavailable at runtime, fall back to a manual
  // EventTarget bridge so this stays safe on older runtimes.
  const resolvedTimeoutMs = resolveSubagentTimeoutMs(
    agentTemplate,
    subagentTimeoutMs,
  )
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
      spawnToolCallId,
      spawnIndex,
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
      spawnToolCallId,
      spawnIndex,
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
