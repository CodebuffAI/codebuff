/**
 * Plan-mode parallel-sharding signals.
 *
 * Behavioral eval for the scope-then-shard guidance added to
 * `buildPlanOnlyInstructionsPrompt` / `buildImplementationInstructionsPrompt`
 * in `agents/base2/base2.ts`. The guidance instructs the agent to, for
 * audit-style requests, first assess codebase scope and then shard parallel
 * subagents (file-pickers + code-searchers, 3-6 for focused audits, 8-12 for
 * whole-codebase audits) rather than doing a single surface-level codesearch.
 *
 * This module is pure (no I/O, no side effects) so it is trivially
 * unit-testable, mirroring the design of `deterministic-signals.ts`. The
 * companion live runner `run-plan-sharding-eval.ts` runs `base2-plan` on an
 * audit-style prompt, captures the `PrintModeEvent` trace, and feeds it
 * through `computePlanShardingSignals` + `evaluateShardingVerdict`.
 *
 * Detection strategy:
 *  - `tool_call` events with `toolName === 'spawn_agents'` carry
 *    `input.agents[]` — a single call listing multiple agents is the
 *    canonical "shard in one batch" signal.
 *  - `subagent_start` / `subagent_finish` events delimit the actual
 *    concurrency window. A run that starts N subagents before finishing any
 *    of them is provably parallel (concurrency = peak in-flight starts).
 *  - A run that only emits a single `code_search` / `query_index` /
 *    `read_files` tool call at the top level (no subagents at all) is the
 *    "surface-level single codesearch" anti-pattern the eval guards against.
 */

import type {
  PrintModeEvent,
  PrintModeToolCall,
} from '@codebuff/common/types/print-mode'

/** Prompt classification used to decide whether sharding is expected. */
export type PromptKind = 'audit' | 'implementation' | 'question' | 'ambiguous'

/** A single `spawn_agents` tool call parsed from a trace. */
export interface SpawnAgentsCall {
  toolCallId: string
  /** Agent types listed in the call (`input.agents[].agent_type`). */
  agentTypes: string[]
  /** Raw count of agents requested in this one call. */
  agentCount: number
}

/** Per-subagent start record relevant to sharding analysis. */
export interface SubagentStartRecord {
  agentId: string
  agentType: string
  onlyChild: boolean
  parentAgentId?: string
}

/** Aggregate sharding signals derived from a trace. */
export interface PlanShardingSignals {
  /** Total number of `spawn_agents` tool calls at the top level of the trace. */
  spawnAgentsCallCount: number
  /** All agents requested across every `spawn_agents` call (flattened). */
  totalRequestedAgents: number
  /** Largest single `spawn_agents` batch (max agents in one call). */
  maxBatchSize: number
  /** Distinct agent types requested across all spawn_agents calls. */
  distinctAgentTypes: string[]
  /** Subagent_start records emitted (in trace order). */
  subagentStarts: SubagentStartRecord[]
  /** Peak number of subagents in-flight simultaneously (started but not finished). */
  peakConcurrency: number
  /** True if at least one subagent was started before the previous one finished. */
  shardedParallely: boolean
  /** True if the trace shows a single top-level read/search tool call and no subagents. */
  singleCodesearchOnly: boolean
  /** Top-level (parentAgentId undefined) tool calls that were NOT spawn_agents. */
  topLevelDirectToolCount: number
  /** Whether the prompt was classified as audit-style. */
  promptKind: PromptKind
}

/** Verdict for the plan-mode sharding eval. */
export type ShardingVerdict = 'pass' | 'fail' | 'skip'

export interface ShardingEvaluation {
  verdict: ShardingVerdict
  signals: PlanShardingSignals
  /** Human-readable reason lines, suitable for an eval report. */
  reasons: string[]
}

// ---------------------------------------------------------------------------
// Prompt classification
// ---------------------------------------------------------------------------

/**
 * Audit-style request keywords. A prompt containing any of these (case
 * insensitive) is classified as `audit`. Intentionally broad — false
 * positives (classifying an implementation prompt as audit) only cause the
 * eval to *expect* sharding, which is harmless; false negatives (missing an
 * audit prompt) are the real risk, so the list errs toward recall.
 */
const AUDIT_PHRASES = [
  'audit',
  'review the codebase',
  'review this codebase',
  'check this codebase',
  'check the codebase',
  'feature improvements',
  'feature improvement',
  'improvements that can be made',
  'find issues',
  'find any issues',
  'find bugs',
  'assess the codebase',
  'explore the codebase',
  'codebase review',
  'codebase audit',
  'architectural review',
  'security review',
  'quality review',
  'opportunities to improve',
  'what can be improved',
  'technical debt',
  'survey the codebase',
  'inventory the codebase',
  'map the codebase',
]

/**
 * Strong implementation intent keywords. If a prompt matches both audit and
 * implementation phrases, audit wins (implementation tasks still benefit
 * from sharded context gathering before edits, per the scope-then-shard
 * guidance).
 */
const IMPLEMENTATION_PHRASES = [
  'implement',
  'add a feature',
  'add the feature',
  'fix the bug',
  'fix this bug',
  'refactor',
  'migrate',
  'update the code',
  'change the code',
]

/**
 * Classify a user prompt by intent. Audit-style prompts are the ones the
 * scope-then-shard guidance targets; for those, the eval expects the agent
 * to shard parallel subagents rather than do a single surface-level
 * codesearch.
 */
export function classifyPrompt(prompt: string): PromptKind {
  const normalized = prompt.toLowerCase()

  const isAudit = AUDIT_PHRASES.some((phrase) =>
    normalized.includes(phrase),
  )
  const isImplementation = IMPLEMENTATION_PHRASES.some((phrase) =>
    normalized.includes(phrase),
  )

  if (isAudit) return 'audit'
  if (isImplementation) return 'implementation'

  // Very short prompts with no verb hint are ambiguous.
  if (normalized.trim().length < 20) return 'ambiguous'

  // Prompts ending in '?' with no audit/implementation keyword read as questions.
  if (normalized.trim().endsWith('?')) return 'question'

  return 'ambiguous'
}

// ---------------------------------------------------------------------------
// Trace extraction
// ---------------------------------------------------------------------------

/**
 * Extract all top-level `spawn_agents` tool calls from a trace. Only calls
 * without a `parentAgentId` count — subagent-internal spawn_agents calls are
 * nested context, not the top-level sharding decision under evaluation.
 */
export function extractSpawnAgentsCalls(
  events: readonly PrintModeEvent[],
): SpawnAgentsCall[] {
  const calls: SpawnAgentsCall[] = []
  for (const event of events) {
    if (event.type !== 'tool_call') continue
    if (event.toolName !== 'spawn_agents') continue
    if (event.parentAgentId !== undefined) continue

    const agents = extractAgentsArray(event)
    calls.push({
      toolCallId: event.toolCallId,
      agentTypes: agents.map((a) => a.agent_type).filter((t): t is string => !!t),
      agentCount: agents.length,
    })
  }
  return calls
}

/**
 * Best-effort extraction of the `agents` array from a spawn_agents tool call.
 * The runtime schema is `{ agents: [{ agent_type, prompt, params }] }` but we
 * defensively tolerate missing/malformed fields since eval traces may contain
 * truncated or slightly drifted payloads.
 */
function extractAgentsArray(
  event: PrintModeToolCall,
): Array<{ agent_type?: unknown }> {
  const raw = (event.input as Record<string, unknown> | undefined)?.agents
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null,
  ) as Array<{ agent_type?: unknown }>
}

/**
 * Extract subagent_start records (top-level children only — those whose
 * parentAgentId matches the root agent, i.e. undefined in the flat trace).
 */
export function extractSubagentStarts(
  events: readonly PrintModeEvent[],
): SubagentStartRecord[] {
  const records: SubagentStartRecord[] = []
  for (const event of events) {
    if (event.type !== 'subagent_start') continue
    if (event.parentAgentId !== undefined) continue
    records.push({
      agentId: event.agentId,
      agentType: event.agentType,
      onlyChild: event.onlyChild,
      parentAgentId: event.parentAgentId,
    })
  }
  return records
}

/**
 * Compute peak concurrency by scanning subagent_start/subagent_finish events
 * in trace order. Assumes events are emitted in chronological order (the
 * runtime streams them as they happen).
 */
function computePeakConcurrency(events: readonly PrintModeEvent[]): number {
  let inFlight = 0
  let peak = 0
  for (const event of events) {
    if (event.type === 'subagent_start') {
      inFlight++
      if (inFlight > peak) peak = inFlight
    } else if (event.type === 'subagent_finish') {
      if (inFlight > 0) inFlight--
    }
  }
  return peak
}

/**
 * Count top-level tool calls that are NOT spawn_agents. These are direct
 * actions by the root agent (e.g. a lone `code_search`, `query_index`,
 * `read_files`). A trace with zero subagents and one direct tool call is the
 * "surface-level single codesearch" anti-pattern.
 */
function countTopLevelDirectTools(
  events: readonly PrintModeEvent[],
): number {
  let count = 0
  for (const event of events) {
    if (event.type !== 'tool_call') continue
    if (event.parentAgentId !== undefined) continue
    if (event.toolName === 'spawn_agents') continue
    count++
  }
  return count
}

// ---------------------------------------------------------------------------
// Signal aggregation + verdict
// ---------------------------------------------------------------------------

/**
 * Compute plan-sharding signals from a PrintModeEvent trace.
 */
export function computePlanShardingSignals(params: {
  events: PrintModeEvent[]
  prompt: string
}): PlanShardingSignals {
  const { events, prompt } = params

  const spawnCalls = extractSpawnAgentsCalls(events)
  const subagentStarts = extractSubagentStarts(events)
  const peakConcurrency = computePeakConcurrency(events)
  const topLevelDirectToolCount = countTopLevelDirectTools(events)

  const totalRequestedAgents = spawnCalls.reduce(
    (sum, c) => sum + c.agentCount,
    0,
  )
  const maxBatchSize = spawnCalls.reduce(
    (max, c) => Math.max(max, c.agentCount),
    0,
  )
  const distinctAgentTypes = Array.from(
    new Set([
      ...spawnCalls.flatMap((c) => c.agentTypes),
      ...subagentStarts.map((s) => s.agentType),
    ]),
  ).sort()

  const shardedParallely = peakConcurrency >= 2
  const singleCodesearchOnly =
    subagentStarts.length === 0 &&
    spawnCalls.length === 0 &&
    topLevelDirectToolCount === 1

  return {
    spawnAgentsCallCount: spawnCalls.length,
    totalRequestedAgents,
    maxBatchSize,
    distinctAgentTypes,
    subagentStarts,
    peakConcurrency,
    shardedParallely,
    singleCodesearchOnly,
    topLevelDirectToolCount,
    promptKind: classifyPrompt(prompt),
  }
}

/**
 * Evaluate whether the trace satisfies the plan-mode sharding expectation.
 *
 * Pass criteria for an `audit` prompt:
 *  - At least 2 subagents were started, AND
 *  - Peak concurrency >= 2 (true parallel sharding, not sequential), OR
 *  - A single `spawn_agents` call requested >= 2 agents in one batch (the
 *    runtime dispatches these concurrently).
 *
 * The eval is skipped (`skip`) for non-audit prompts since the
 * scope-then-shard guidance only mandates sharding for audit-style requests.
 * For `ambiguous` prompts we still run the check but require the same bar —
 * this catches regressions where a genuinely audit-shaped prompt was
 * misclassified by the heuristic.
 */
export function evaluateShardingVerdict(
  signals: PlanShardingSignals,
): ShardingEvaluation {
  const reasons: string[] = []

  if (signals.promptKind !== 'audit' && signals.promptKind !== 'ambiguous') {
    return {
      verdict: 'skip',
      signals,
      reasons: [
        `Prompt classified as '${signals.promptKind}'; sharding not expected for this prompt kind.`,
      ],
    }
  }

  const batchSharded = signals.maxBatchSize >= 2
  const concurrencySharded = signals.peakConcurrency >= 2

  if (signals.singleCodesearchOnly) {
    reasons.push(
      'Anti-pattern detected: a single top-level tool call and no subagents (surface-level codesearch).',
    )
  }

  if (signals.spawnAgentsCallCount === 0 && signals.subagentStarts.length === 0) {
    reasons.push('No spawn_agents calls and no subagent_start events in trace.')
  }

  if (signals.subagentStarts.length < 2 && !batchSharded) {
    reasons.push(
      `Only ${signals.subagentStarts.length} subagent(s) started and max spawn_agents batch was ${signals.maxBatchSize}; expected >= 2 for an audit-style request.`,
    )
  }

  if (!concurrencySharded && !batchSharded) {
    reasons.push(
      `Peak concurrency was ${signals.peakConcurrency} and max batch was ${signals.maxBatchSize}; expected at least one of >= 2.`,
    )
  }

  const pass = (signals.subagentStarts.length >= 2 || batchSharded) &&
    (concurrencySharded || batchSharded)

  if (pass) {
    reasons.unshift(
      `Sharded ${signals.subagentStarts.length} subagent(s) across ${signals.spawnAgentsCallCount} spawn_agents call(s); peak concurrency ${signals.peakConcurrency}, max batch ${signals.maxBatchSize}, distinct types: ${signals.distinctAgentTypes.join(', ') || '(none)'}.`,
    )
    return { verdict: 'pass', signals, reasons }
  }

  return { verdict: 'fail', signals, reasons }
}
