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
import {
  agentHandoffSchema,
  agentReceiptSchema,
} from '@codebuff/common/types/agent-handoff'
import { rm } from 'node:fs/promises'

import { loopAgentSteps } from '../../../run-agent-step'
import { getAgentTemplate } from '../../../templates/agent-registry'
import { formatValidationIssues } from '../../../util/format-validation-issues'
import { formatValueForError } from '../../../util/format-value'
import { getEffectiveAgentToolNames } from '../../../util/agent-tool-names'
import { narrowFilesystemPatterns } from '../../../util/filesystem-scope'
import { mergeAgentReceiptIntoTaskMemory } from '../../../util/task-memory'
import { appendOrchestrationEvent } from '../../../util/orchestration-ledger'
import {
  extractPinnedContextBlocks,
  filterUnfinishedToolCalls,
  withSystemTags,
} from '../../../util/messages'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type {
  AgentHandoff,
  AgentReceipt,
  AgentRole,
} from '@codebuff/common/types/agent-handoff'
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
    resolveModelContextWindow: params.resolveModelContextWindow,
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

  const compactValue = (value: unknown, depth = 0): unknown => {
    if (typeof value === 'string') {
      if (value.length <= 4_000) return value
      return `${value.slice(0, 3_000)}...[truncated handoff]...${value.slice(-800)}`
    }
    if (value === null || typeof value !== 'object') return value
    if (depth >= 6) return '[truncated nested handoff]'
    if (Array.isArray(value)) {
      return value.slice(0, 64).map((entry) => compactValue(entry, depth + 1))
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 64)
        .map(([key, entry]) => [key, compactValue(entry, depth + 1)]),
    )
  }

  return {
    ...(spawnParams ?? {}),
    handoff: compactValue(normalizedHandoff),
  }
}

export function validateVersionedAgentHandoff(params: {
  agentType: string
  handoff: unknown
}): void {
  const record = params.handoff as Record<string, unknown> | undefined
  if (!record) {
    if (params.agentType === 'repair-editor') {
      throw new Error(
        'repair-editor requires a versioned handoff with schemaVersion: 1, taskId, objective, at least one finding, and explicit permissions.',
      )
    }
    return
  }
  if (
    record.schemaVersion === undefined &&
    params.agentType !== 'repair-editor'
  ) {
    return
  }
  if (
    record.schemaVersion !== 1 ||
    typeof record.taskId !== 'string' ||
    typeof record.role !== 'string' ||
    typeof record.objective !== 'string'
  ) {
    throw new Error(
      `Invalid versioned handoff for agent ${params.agentType}: schemaVersion 1 requires taskId, role, and objective.`,
    )
  }

  const parsed = agentHandoffSchema.safeParse(record)
  if (!parsed.success) {
    throw new Error(
      `Invalid versioned handoff for agent ${params.agentType}: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'handoff'} ${issue.message}`)
        .join('; ')}.`,
    )
  }

  if (params.agentType !== 'repair-editor') return
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

export function deriveSpawnTemplateCapabilities(params: {
  agentTemplate: AgentTemplate
  handoff: AgentHandoff | undefined
  projectRoot: string
}): AgentTemplate {
  const { agentTemplate, handoff, projectRoot } = params
  if (!handoff) return agentTemplate

  const requestedTools = new Set(handoff.permissions.allowedTools)
  const staticTools = getEffectiveAgentToolNames(agentTemplate)
  const disallowedTools = [...requestedTools].filter(
    (toolName) => !staticTools.includes(toolName),
  )
  if (disallowedTools.length > 0) {
    throw new Error(
      `Handoff attempted to widen ${agentTemplate.id} tool authority with: ${disallowedTools.join(', ')}.`,
    )
  }

  const read = narrowFilesystemPatterns({
    requested: handoff.permissions.readablePaths,
    staticPatterns: agentTemplate.filesystemScope?.read,
    projectRoot,
    access: 'read',
    agentId: agentTemplate.id,
  })
  const write = narrowFilesystemPatterns({
    requested: handoff.permissions.writablePaths,
    staticPatterns: agentTemplate.filesystemScope?.write,
    projectRoot,
    access: 'write',
    agentId: agentTemplate.id,
  })

  return {
    ...agentTemplate,
    toolNames: agentTemplate.toolNames.filter((toolName) =>
      requestedTools.has(toolName),
    ),
    programmaticToolNames: (agentTemplate.programmaticToolNames ?? []).filter(
      (toolName) => requestedTools.has(toolName),
    ),
    spawnableAgents: [],
    filesystemScope: { read, write },
  }
}

const REVIEWER_EVIDENCE_ITEM_LIMIT = 3
const REVIEWER_EVIDENCE_CHARS = 360
const REVIEWER_REQUIREMENT_EVIDENCE_LIMIT = 2
const PARENT_AGENT_OUTPUT_MAX_CHARS = 256_000
const PARENT_AGENT_OUTPUT_STRING_CHARS = 4_000
const PARENT_AGENT_OUTPUT_ARRAY_ITEMS = 48
const CONTROL_PLANE_ARRAY_FIELDS = new Set([
  'reviewedFiles',
  'requirementCoverage',
  'findings',
  'changedFiles',
  'requirementsAddressed',
  'acceptanceCriteriaAddressed',
  'findingsAddressed',
  'errors',
  'unresolved',
  'requestedValidation',
])

function truncateReviewerText(value: unknown, maxChars: number): unknown {
  if (typeof value !== 'string' || value.length <= maxChars) return value
  const suffixChars = Math.min(96, Math.floor(maxChars * 0.25))
  const prefixChars = maxChars - suffixChars - 24
  return `${value.slice(0, prefixChars)}...[truncated]...${value.slice(-suffixChars)}`
}

function compactReviewerOutput(
  output: Record<string, unknown>,
  agentType?: string,
) {
  const isReviewer =
    output.family === 'reviewer' ||
    agentType?.toLowerCase().includes('reviewer')
  if (!isReviewer || typeof output.verdict !== 'string') {
    return output
  }

  const findings = Array.isArray(output.findings)
    ? output.findings.map((finding) => {
        if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
          return finding
        }
        const record = finding as Record<string, unknown>
        return {
          ...record,
          ...(Array.isArray(record.evidence)
            ? {
                evidence: record.evidence
                  .slice(0, REVIEWER_EVIDENCE_ITEM_LIMIT)
                  .map((item) =>
                    truncateReviewerText(item, REVIEWER_EVIDENCE_CHARS),
                  ),
              }
            : {}),
        }
      })
    : output.findings

  const requirementCoverage = Array.isArray(output.requirementCoverage)
    ? output.requirementCoverage.map((requirement) => {
        if (
          !requirement ||
          typeof requirement !== 'object' ||
          Array.isArray(requirement)
        ) {
          return requirement
        }
        const record = requirement as Record<string, unknown>
        return {
          ...record,
          ...(Array.isArray(record.evidence)
            ? {
                evidence: record.evidence
                  .slice(0, REVIEWER_REQUIREMENT_EVIDENCE_LIMIT)
                  .map((item) =>
                    truncateReviewerText(item, REVIEWER_EVIDENCE_CHARS),
                  ),
              }
            : {}),
        }
      })
    : output.requirementCoverage

  return {
    ...output,
    findings,
    requirementCoverage,
  }
}

function compactAgentOutputValue(
  value: unknown,
  depth = 0,
  fieldName?: string,
  truncation = { omittedItems: 0, omittedChars: 0 },
): unknown {
  if (typeof value === 'string') {
    const compacted = truncateReviewerText(
      value,
      PARENT_AGENT_OUTPUT_STRING_CHARS,
    )
    if (typeof compacted === 'string') {
      truncation.omittedChars += Math.max(0, value.length - compacted.length)
    }
    return compacted
  }
  if (value === null || typeof value !== 'object') return value
  if (depth >= 7) return '[truncated nested agent output]'
  if (Array.isArray(value)) {
    const preserveAll = fieldName
      ? CONTROL_PLANE_ARRAY_FIELDS.has(fieldName)
      : false
    const entries = preserveAll
      ? value
      : value.slice(0, PARENT_AGENT_OUTPUT_ARRAY_ITEMS)
    truncation.omittedItems += Math.max(0, value.length - entries.length)
    return entries.map((entry) =>
      compactAgentOutputValue(entry, depth + 1, undefined, truncation),
    )
  }
  const compacted = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 64)
      .map(([key, entry]) => [
        key,
        compactAgentOutputValue(entry, depth + 1, key, truncation),
      ]),
  )
  return compacted
}

function boundAgentOutputForParent(
  value: unknown,
  agentType?: string,
): unknown {
  const truncation = { omittedItems: 0, omittedChars: 0 }
  const rawCompacted = compactAgentOutputValue(value, 0, undefined, truncation)
  const compacted =
    rawCompacted &&
    typeof rawCompacted === 'object' &&
    !Array.isArray(rawCompacted) &&
    (truncation.omittedItems > 0 || truncation.omittedChars > 0)
      ? {
          ...(rawCompacted as Record<string, unknown>),
          truncation: {
            omittedItems: truncation.omittedItems,
            omittedChars: truncation.omittedChars,
          },
        }
      : rawCompacted
  let serialized = ''
  try {
    serialized = JSON.stringify(compacted)
  } catch {
    return {
      type: 'agentReceipt',
      agentType,
      truncated: true,
      summary: 'Agent output was not serializable.',
    }
  }
  if (serialized === undefined) return compacted
  if (serialized.length <= PARENT_AGENT_OUTPUT_MAX_CHARS) return compacted
  if (compacted && typeof compacted === 'object' && !Array.isArray(compacted)) {
    const record = compacted as Record<string, unknown>
    const valueRecord =
      record.value &&
      typeof record.value === 'object' &&
      !Array.isArray(record.value)
        ? (record.value as Record<string, unknown>)
        : record
    if (
      typeof valueRecord.verdict === 'string' ||
      Array.isArray(valueRecord.reviewedFiles) ||
      Array.isArray(valueRecord.requirementCoverage)
    ) {
      return {
        ...(record.type ? { type: record.type } : {}),
        value: {
          schemaVersion: valueRecord.schemaVersion,
          verdict: valueRecord.verdict,
          snapshotFingerprint: valueRecord.snapshotFingerprint,
          reviewedFiles: valueRecord.reviewedFiles,
          findings: valueRecord.findings,
          coverage: valueRecord.coverage,
          dimensions: valueRecord.dimensions,
          requirementCoverage: valueRecord.requirementCoverage,
          truncation: {
            omittedItems: truncation.omittedItems,
            omittedChars:
              truncation.omittedChars +
              Math.max(0, serialized.length - PARENT_AGENT_OUTPUT_MAX_CHARS),
          },
        },
      }
    }
  }
  return {
    type: 'agentReceipt',
    agentType,
    truncated: true,
    summary: `${serialized.slice(0, 48_000)}...[truncated child output]...${serialized.slice(-8_000)}`,
  }
}

export function normalizeSpawnedAgentOutput(
  output: any,
  agentType?: string,
): any {
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
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const record = output as Record<string, unknown>
    if (
      record.type === 'structuredOutput' &&
      record.value &&
      typeof record.value === 'object' &&
      !Array.isArray(record.value)
    ) {
      return boundAgentOutputForParent(
        {
          ...record,
          value: compactReviewerOutput(
            record.value as Record<string, unknown>,
            agentType,
          ),
        },
        agentType,
      )
    }
    return boundAgentOutputForParent(
      compactReviewerOutput(record, agentType),
      agentType,
    )
  }
  return boundAgentOutputForParent(output, agentType)
}

/**
 * Remove a Librarian clone once its answer has been captured unless the spawn
 * contract explicitly requested retention. The deletion target is derived
 * from both the validated repository URL and the child output, so model output
 * alone cannot select an arbitrary /tmp path.
 */
export async function finalizeOwnedLibrarianClone(params: {
  agentType: string
  spawnParams?: Record<string, unknown>
  messageHistory?: Message[]
  output: unknown
  logger: Logger
}): Promise<unknown> {
  if (normalizeAgentIdForLookup(params.agentType) !== 'librarian') {
    return params.output
  }

  const wrapper =
    params.output &&
    typeof params.output === 'object' &&
    !Array.isArray(params.output)
      ? (params.output as Record<string, unknown>)
      : undefined
  const value =
    wrapper?.type === 'structuredOutput' &&
    wrapper.value &&
    typeof wrapper.value === 'object' &&
    !Array.isArray(wrapper.value)
      ? (wrapper.value as Record<string, unknown>)
      : wrapper
  if (!value) return params.output

  const trustedCloneDir = params.messageHistory
    ?.flatMap((message) =>
      Array.isArray(message.content)
        ? message.content.flatMap((part) =>
            part.type === 'text' && typeof part.text === 'string'
              ? [part.text]
              : [],
          )
        : [],
    )
    .map(
      (text) =>
        text.match(/The repository has been cloned to `([^`]+)`\./)?.[1],
    )
    .find((path): path is string => typeof path === 'string')
  const retainClone = params.spawnParams?.retainClone === true
  if (retainClone) {
    const retainedValue = {
      ...value,
      ...(trustedCloneDir ? { cloneDir: trustedCloneDir } : {}),
      cloneRetained: true,
    }
    return wrapper?.type === 'structuredOutput'
      ? { ...wrapper, value: retainedValue }
      : retainedValue
  }

  const repoUrl = params.spawnParams?.repoUrl
  if (typeof repoUrl !== 'string' || !trustedCloneDir) {
    return params.output
  }
  const cloneDir = trustedCloneDir
  const repoName = repoUrl
    .replace(/\/+$/, '')
    .split('/')
    .pop()
    ?.replace(/\.git$/, '')
  const expectedPrefix = repoName ? `/tmp/librarian-${repoName}-` : ''
  const suffix = expectedPrefix ? cloneDir.slice(expectedPrefix.length) : ''
  if (
    !expectedPrefix ||
    !cloneDir.startsWith(expectedPrefix) ||
    !/^\d+$/.test(suffix)
  ) {
    params.logger.warn(
      { cloneDir, repoUrl },
      'Refusing Librarian clone cleanup for an unowned path',
    )
    return params.output
  }

  await rm(cloneDir, { recursive: true, force: true })
  const cleanedValue = { ...value, cloneDir: '', cloneRetained: false }
  return wrapper?.type === 'structuredOutput'
    ? { ...wrapper, value: cleanedValue }
    : cleanedValue
}

function inferAgentRole(agentType: string, handoff?: AgentHandoff): AgentRole {
  if (handoff) return handoff.role
  if (agentType === 'repair-editor') return 'repair-editor'
  if (agentType.includes('editor')) return 'editor'
  if (agentType === 'test-writer') return 'test-writer'
  if (agentType === 'doc-writer') return 'doc-writer'
  if (agentType === 'dependency-manager') return 'dependency-manager'
  if (agentType === 'debugger') return 'debugger'
  if (agentType === 'security-reviewer') return 'security-reviewer'
  if (agentType.includes('reviewer')) return 'reviewer'
  if (agentType === 'git-committer') return 'committer'
  if (agentType === 'thinker') return 'thinker'
  if (agentType === 'synthesizer') return 'synthesizer'
  if (
    agentType.includes('picker') ||
    agentType.includes('searcher') ||
    agentType.includes('explorer')
  ) {
    return 'explorer'
  }
  return 'specialist'
}

function extractReceiptStringArray(output: unknown, key: string): string[] {
  const found: string[] = []
  const visit = (value: unknown, depth = 0): void => {
    if (!value || depth > 8) return
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }
    if (typeof value !== 'object') return
    const record = value as Record<string, unknown>
    const candidate = record[key]
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (typeof item === 'string' && item.trim()) found.push(item.trim())
        else if (item && typeof item === 'object') {
          const nested = item as Record<string, unknown>
          const text = nested.path ?? nested.id ?? nested.text
          if (typeof text === 'string' && text.trim()) found.push(text.trim())
        }
      }
    }
    for (const nested of Object.values(record)) visit(nested, depth + 1)
  }
  visit(output)
  return [...new Set(found)]
}

function extractMutationAttestations(value: unknown): Array<{
  path: string
  beforeHash?: string
  afterHash?: string
  mutationReceiptId?: string
  workspaceRevision?: number
  workspaceSnapshotId?: string
}> {
  const byPath = new Map<
    string,
    ReturnType<typeof extractMutationAttestations>[number]
  >()
  const visit = (
    item: unknown,
    inheritedReceiptId?: string,
    depth = 0,
  ): void => {
    if (!item || depth > 12) return
    if (Array.isArray(item)) {
      for (const nested of item) visit(nested, inheritedReceiptId, depth + 1)
      return
    }
    if (typeof item !== 'object') return
    const record = item as Record<string, unknown>
    const receiptId =
      typeof record.receiptId === 'string'
        ? record.receiptId
        : inheritedReceiptId
    if (
      (record.kind === 'file_mutation_result' ||
        record.kind === 'commit_receipt') &&
      Array.isArray(record.actions)
    ) {
      for (const action of record.actions) {
        if (!action || typeof action !== 'object') continue
        const actionRecord = action as Record<string, unknown>
        const applied =
          actionRecord.outcome === 'applied' ||
          actionRecord.status === 'committed'
        if (!applied || typeof actionRecord.path !== 'string') continue
        const paths = [
          actionRecord.path,
          ...(typeof actionRecord.destinationPath === 'string'
            ? [actionRecord.destinationPath]
            : []),
        ]
        for (const path of paths) {
          byPath.set(path, {
            path,
            ...(typeof actionRecord.beforeHash === 'string'
              ? { beforeHash: actionRecord.beforeHash }
              : {}),
            ...(typeof actionRecord.afterHash === 'string'
              ? { afterHash: actionRecord.afterHash }
              : {}),
            ...(receiptId ? { mutationReceiptId: receiptId } : {}),
            ...(typeof record.workspaceRevision === 'number'
              ? { workspaceRevision: record.workspaceRevision }
              : {}),
            ...(typeof record.workspaceSnapshotId === 'string'
              ? { workspaceSnapshotId: record.workspaceSnapshotId }
              : {}),
          })
        }
      }
    }
    for (const nested of Object.values(record)) {
      visit(nested, receiptId, depth + 1)
    }
  }
  visit(value)
  return [...byPath.values()]
}

function findReceiptStatus(
  output: unknown,
): AgentReceipt['status'] | undefined {
  let status: AgentReceipt['status'] | undefined
  const visit = (value: unknown, depth = 0): void => {
    if (status || !value || depth > 8) return
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }
    if (typeof value !== 'object') return
    const record = value as Record<string, unknown>
    if (
      record.status === 'completed' ||
      record.status === 'partial' ||
      record.status === 'blocked' ||
      record.status === 'failed' ||
      record.status === 'cancelled'
    ) {
      status = record.status
      return
    }
    for (const nested of Object.values(record)) visit(nested, depth + 1)
  }
  visit(output)
  return status
}

function extractReceiptEvidence(params: {
  output: unknown
  agentType: string
  workspaceRevision?: number
}): AgentReceipt['evidence'] {
  const evidence: AgentReceipt['evidence'] = []
  const kind = params.agentType.includes('reviewer')
    ? 'review'
    : params.agentType.includes('editor') || params.agentType.includes('writer')
      ? 'edit'
      : 'decision'
  const seen = new Set<string>()
  const add = (summary: string, source?: string, freshnessHash?: string) => {
    const normalized = summary.trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    evidence.push({
      id: `evidence-${generateCompactId()}`,
      kind,
      summary: normalized.slice(0, 2_000),
      source,
      freshnessHash,
      workspaceRevision: params.workspaceRevision,
    })
  }
  const visit = (value: unknown, depth = 0): void => {
    if (!value || depth > 8) return
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }
    if (typeof value !== 'object') return
    const record = value as Record<string, unknown>
    if (Array.isArray(record.evidence)) {
      for (const item of record.evidence) {
        if (typeof item === 'string') add(item)
        else if (item && typeof item === 'object') {
          const entry = item as Record<string, unknown>
          const summary = entry.summary ?? entry.text ?? entry.reason
          if (typeof summary === 'string') {
            add(
              summary,
              typeof entry.source === 'string' ? entry.source : undefined,
              typeof entry.freshnessHash === 'string'
                ? entry.freshnessHash
                : undefined,
            )
          }
        }
      }
    }
    for (const nested of Object.values(record)) visit(nested, depth + 1)
  }
  visit(params.output)
  for (const file of extractReceiptStringArray(
    params.output,
    'reviewedFiles',
  )) {
    add(`Reviewed ${file}`, file)
  }
  return evidence.slice(-128)
}

export function buildRuntimeAgentReceipt(params: {
  agentType: string
  agentId: string
  handoff?: AgentHandoff
  output: unknown
  agentState?: AgentState
  status?: AgentReceipt['status']
  error?: unknown
}): AgentReceipt {
  const mutationAttestations = extractMutationAttestations([
    params.output,
    params.agentState?.messageHistory,
  ])
  const claimedChangedFiles = extractReceiptStringArray(
    params.output,
    'changedFiles',
  )
  const actualChangedPaths = new Set(
    mutationAttestations.map((entry) => entry.path),
  )
  const overclaimedPaths = claimedChangedFiles.filter(
    (path) => !actualChangedPaths.has(path),
  )
  const errors = [
    ...(params.error
      ? [
          {
            message:
              params.error instanceof Error
                ? params.error.message
                : String(params.error),
            retryable: false,
          },
        ]
      : []),
    ...(overclaimedPaths.length > 0
      ? [
          {
            message: `Child output claimed changed files without mutation receipts: ${overclaimedPaths.join(', ')}.`,
            retryable: false,
          },
        ]
      : []),
  ]
  const changedFiles = mutationAttestations.map(
    ({ path, beforeHash, afterHash, mutationReceiptId }) => ({
      path,
      ...(beforeHash ? { beforeHash } : {}),
      ...(afterHash ? { afterHash } : {}),
      ...(mutationReceiptId ? { mutationReceiptId } : {}),
    }),
  )
  const latestMutation = mutationAttestations
    .filter((entry) => entry.workspaceRevision !== undefined)
    .sort(
      (left, right) =>
        (right.workspaceRevision ?? -1) - (left.workspaceRevision ?? -1),
    )[0]
  const inferredRole = inferAgentRole(params.agentType, params.handoff)
  const mutationAgent = [
    'editor',
    'repair-editor',
    'test-writer',
    'doc-writer',
    'dependency-manager',
  ].includes(inferredRole)
  const claimedFindingIds = extractReceiptStringArray(
    params.output,
    'findingsAddressed',
  )
  const attestedFindingIds = params.handoff
    ? claimedFindingIds.filter((id) => {
        const finding = params.handoff?.findings.find((item) => item.id === id)
        return !!finding?.files.some((path) => actualChangedPaths.has(path))
      })
    : claimedFindingIds
  const receipt = agentReceiptSchema.parse({
    schemaVersion: 1,
    receiptId: generateCompactId(),
    taskId: params.handoff?.taskId ?? `spawn-${params.agentId}`,
    role: inferredRole,
    agentId: params.agentId,
    status:
      params.status ??
      (errors.length > 0 ? 'failed' : findReceiptStatus(params.output)) ??
      (mutationAgent ? 'blocked' : 'completed'),
    workspaceRevision:
      latestMutation?.workspaceRevision ??
      params.agentState?.workspaceState?.revision ??
      params.handoff?.workspaceRevision,
    workspaceSnapshotId:
      latestMutation?.workspaceSnapshotId ??
      params.agentState?.workspaceState?.snapshotId ??
      params.handoff?.workspaceSnapshotId,
    changedFiles,
    requirementsAddressed: extractReceiptStringArray(
      params.output,
      'requirementsAddressed',
    ),
    acceptanceCriteriaAddressed: extractReceiptStringArray(
      params.output,
      'acceptanceCriteriaAddressed',
    ),
    findingsAddressed: attestedFindingIds,
    evidence: extractReceiptEvidence({
      output: params.output,
      agentType: params.agentType,
      workspaceRevision:
        params.agentState?.workspaceState?.revision ??
        params.handoff?.workspaceRevision,
    }),
    assumptions: extractReceiptStringArray(params.output, 'assumptions'),
    unresolved: extractReceiptStringArray(params.output, 'unresolved'),
    requestedValidation: extractReceiptStringArray(
      params.output,
      'requestedValidation',
    ),
    artifacts: extractReceiptStringArray(params.output, 'artifacts'),
    errors,
    output: normalizeSpawnedAgentOutput(params.output, params.agentType) as any,
  })
  return receipt
}

export function reconcileAgentReceiptIntoParent(params: {
  parentAgentState: AgentState
  receipt: AgentReceipt
  agentType: string
  objective?: string
}): void {
  params.parentAgentState.taskMemory = mergeAgentReceiptIntoTaskMemory({
    current: params.parentAgentState.taskMemory,
    receipt: params.receipt,
    objective: params.objective,
  })
  appendOrchestrationEvent({
    state: params.parentAgentState,
    event: {
      type: 'receipt_reconciled',
      runId: params.parentAgentState.runId ?? params.parentAgentState.agentId,
      receiptId: params.receipt.receiptId,
      taskId: params.receipt.taskId,
      agentType: params.agentType,
      status: params.receipt.status,
      workspaceRevision: params.parentAgentState.workspaceState?.revision,
      workspaceSnapshotId: params.parentAgentState.workspaceState?.snapshotId,
    },
  })
  appendOrchestrationEvent({
    state: params.parentAgentState,
    event: {
      type: 'spawn_finished',
      runId: params.parentAgentState.runId ?? params.parentAgentState.agentId,
      spawnId: params.receipt.agentId,
      agentType: params.agentType,
      status: params.receipt.status,
      receiptId: params.receipt.receiptId,
      workspaceRevision: params.parentAgentState.workspaceState?.revision,
      workspaceSnapshotId: params.parentAgentState.workspaceState?.snapshotId,
    },
  })
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
      const issuePaths = new Set(
        result.error.issues.map((issue) =>
          issue.path.map((segment) => String(segment)).join('.'),
        ),
      )
      const normalizedAgentType = normalizeAgentIdForLookup(agentType)
      const recoveryHint =
        normalizedAgentType === 'basher' && issuePaths.has('command')
          ? '\n\nRecovery: spawn Basher with { "agent_type": "basher", "params": { "command": "<shell command>" } }. A command mentioned only in prompt prose is never executed.'
          : normalizedAgentType === 'compatibility-reviewer' &&
              issuePaths.has('snapshot_id')
            ? '\n\nRecovery: set params.snapshot_id to the exact current snapshot fingerprint from get_change_review_bundle, for example { "agent_type": "compatibility-reviewer", "params": { "snapshot_id": "<current fingerprint>" } }. Do not invent or reuse a stale fingerprint.'
            : ''
      throw new Error(
        `Invalid params for agent ${agentType}: ${formatValidationIssues({ issues: result.error.issues })}${recoveryHint}\n\nOriginal params value:\n${formatValueForError(params ?? {})}`,
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

  const messageHistoryMode =
    agentTemplate.messageHistoryMode ??
    (agentTemplate.includeMessageHistory ? 'full' : 'none')

  if (messageHistoryMode === 'full') {
    messageHistory = filterUnfinishedToolCalls(parentAgentState.messageHistory)
  } else if (messageHistoryMode === 'pinned') {
    const pinnedBlocks = extractPinnedContextBlocks(
      parentAgentState.messageHistory,
    )
    if (pinnedBlocks.length > 0) {
      messageHistory = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: withSystemTags(
                [
                  'Bounded parent operational context for this subagent:',
                  ...pinnedBlocks,
                ].join('\n\n'),
              ),
            },
          ],
          tags: ['SUBAGENT_CONTEXT'],
          keepDuringTruncation: true,
        },
      ]
    }
  }

  if (messageHistoryMode !== 'none') {
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
    // A child may route to a different model/provider than its parent. Do not
    // inherit the parent's resolved window: the child's first model request
    // resolves its own value through onModelContextResolved. Until then the
    // context-pruning policy uses its conservative unknown-window fallback.
    contextWindowTokens: undefined,
    // Operational memory is structured state, not transcript inheritance.
    // Transfer it only when the selected parent-history mode permits bounded
    // context, and clone so children cannot mutate the parent's source of truth.
    taskMemory:
      messageHistoryMode === 'none'
        ? undefined
        : parentAgentState.taskMemory
          ? structuredClone(parentAgentState.taskMemory)
          : undefined,
    workspaceState: parentAgentState.workspaceState
      ? structuredClone(parentAgentState.workspaceState)
      : undefined,
    backgroundAgentJobs: [],
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
        toolNames: getEffectiveAgentToolNames(agentTemplate),
        programmaticToolNames: agentTemplate.programmaticToolNames,
        spawnableAgents: agentTemplate.spawnableAgents,
        mcpServerNames: Object.keys(agentTemplate.mcpServers ?? {}),
      },
      promptMetadata: {
        length: prompt?.length ?? 0,
        supplied: Boolean(prompt),
      },
      spawnMetadata: {
        keys:
          spawnParams && typeof spawnParams === 'object'
            ? Object.keys(spawnParams)
            : [],
        handoffTaskId:
          spawnParams?.handoff &&
          typeof spawnParams.handoff === 'object' &&
          typeof (spawnParams.handoff as Record<string, unknown>).taskId ===
            'string'
            ? (spawnParams.handoff as Record<string, unknown>).taskId
            : undefined,
      },
      agentId,
      parentId,
    },
    `Spawning agent${inline ? ' inline' : ''} — ${agentType} (${agentId})`,
  )
}

/**
 * Shared wall-clock default for a single subagent execution.
 *
 * Productive subagents are unlimited by default. Callers can opt into a
 * deadline with timeout_seconds or a positive template-specific timeout.
 */
const DEFAULT_SUBAGENT_TIMEOUT_MS = -1

/**
 * Resolves the wall-clock timeout (ms) for a subagent execution, in precedence
 * order: explicit per-spawn override > agent template default > shared
 * DEFAULT_SUBAGENT_TIMEOUT_MS. A non-positive explicit or template value
 * (-1, 0) disables the timeout entirely.
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

  result = {
    ...result,
    output: await finalizeOwnedLibrarianClone({
      agentType: agentTemplate.id,
      spawnParams,
      messageHistory: result.agentState.messageHistory,
      output: result.output,
      logger: withDefaults.logger,
    }),
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
