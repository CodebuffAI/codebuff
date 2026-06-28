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
  /**
   * Number of `file-picker` agents counted for the minimum-shard rule
   * (M10.2): the larger of the `subagent_start` records of that type and 1
   * if the type was requested via a `spawn_agents` call. See
   * `evaluateMinimumShardRule`.
   */
  filePickerCount: number
  /**
   * Number of `code-searcher` agents counted for the minimum-shard rule
   * (M10.2): the larger of the `subagent_start` records of that type and 1
   * if the type was requested via a `spawn_agents` call. See
   * `evaluateMinimumShardRule`.
   */
  codeSearcherCount: number
}

/** Verdict for the plan-mode sharding eval. */
export type ShardingVerdict = 'pass' | 'fail' | 'skip'

export interface ShardingEvaluation {
  verdict: ShardingVerdict
  signals: PlanShardingSignals
  /** Human-readable reason lines, suitable for an eval report. */
  reasons: string[]
}

/**
 * Result of evaluating the minimum-shard rule (M10.2, SPEC R10.2). A "pair" is
 * one `file-picker` subagent + one `code-searcher` subagent.
 */
export interface MinimumShardEvaluation {
  /** Required shard pairs: `max(domainCount, 5)` for `broad-audit`, else 0. */
  requiredPairs: number
  /** Actual shard pairs: `min(filePickerCount, codeSearcherCount)`. */
  actualPairs: number
  /** Counted `file-picker` agents (see `evaluateMinimumShardRule`). */
  filePickerCount: number
  /** Counted `code-searcher` agents (see `evaluateMinimumShardRule`). */
  codeSearcherCount: number
  /** True iff `actualPairs >= requiredPairs`. */
  satisfies: boolean
  /** Human-readable explanation. */
  reason: string
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
// Breadth classification (M10.1)
// ---------------------------------------------------------------------------

/** Breadth verdict for a prompt, per SPEC R10.1. */
export type BreadthKind = 'broad-audit' | 'single-target' | 'unclear'

/** Result of classifying a prompt's breadth (how wide its audit scope is). */
export interface BreadthClassification {
  kind: BreadthKind
  /** Distinct subsystems/domains detected in the prompt (e.g. "agents", "sdk", "cli"). */
  domains: string[]
  /** Count of distinct domains detected. */
  domainCount: number
  /** True if a breadth marker phrase ("whole codebase", "entire codebase", etc.) was found. */
  hasBreadthMarker: boolean
  /** True if the prompt targets a single specific file (path literal or "in <file>" phrasing). */
  hasSingleFileTarget: boolean
}

/**
 * Known subsystem/domain tokens for this repo, derived from the top-level
 * directories plus conceptual subsystem names that appear in audit prompts
 * even though they aren't top-level dirs. Matched as whole-word,
 * case-insensitive tokens in the prompt. Kept repo-specific on purpose (per
 * M10.1 non-goals): no generic NLP.
 *
 * Audit (M10.2): matches the `package.json` workspaces
 * (.agents, common, packages/*, scripts, evals, sdk, agents, cli) plus docs/,
 * and the conceptual subsystem names indexer/harness/runtime/provider/auth.
 */
const KNOWN_DOMAINS = [
  'agents',
  'sdk',
  'cli',
  'common',
  'evals',
  'docs',
  'scripts',
  'packages',
  'indexer',
  'harness',
  'runtime',
  'provider',
  'auth',
] as const

/**
 * Breadth marker phrases that signal a whole-codebase audit intent. Matched
 * case-insensitively as substrings (they are distinctive enough on their own).
 */
const BREADTH_MARKERS = [
  'whole codebase',
  'entire codebase',
  'across the codebase',
  'all of the codebase',
  'full codebase',
  'every module',
  'all modules',
] as const

/**
 * Path-like token: at least one slash with a file extension, e.g.
 * "src/foo.ts", "agents/base2/base2.ts". Requires a leading boundary so we
 * don't match inside a longer token.
 */
const PATH_LITERAL_REGEX = /(?:^|\s)[\w-]+(?:\/[\w-]+)+\.\w+/g

/** "in <file>.ext" / "the file <path>" phrasing. */
const IN_FILE_REGEX = /\bin\s+[\w-]+(?:\/[\w-]+)*\.\w+\b/i
const THE_FILE_REGEX = /\bthe file\s+[\w-]+(?:\/[\w-]+)*\.\w+\b/i

/**
 * Classify how broad an audit-style request is. Pure: no I/O, no side effects.
 *
 * Classification rules (SPEC R10.1):
 *  - `broad-audit`: (>= 3 distinct domains OR a breadth marker) AND no single
 *    file target. These confirm the full map-reduce audit flow.
 *  - `single-target`: the prompt names a single specific file (path literal or
 *    "in <file>" phrasing) — skip the audit pattern and review that file.
 *  - `unclear`: everything else (1-2 domains, no breadth marker, no file).
 */
export function classifyBreadth(prompt: string): BreadthClassification {
  const normalized = prompt.toLowerCase()

  // 1. Detect domains via whole-word, case-insensitive token matching.
  const domains = new Set<string>()
  for (const domain of KNOWN_DOMAINS) {
    const re = new RegExp(`(?:^|[^\w])${domain}(?:[^\w]|$)`, 'i')
    if (re.test(normalized)) {
      domains.add(domain)
    }
  }
  const sortedDomains = Array.from(domains).sort()
  const domainCount = sortedDomains.length

  // 2. Detect breadth marker phrases.
  const hasBreadthMarker = BREADTH_MARKERS.some((marker) =>
    normalized.includes(marker),
  )

  // 3. Detect single-file target: a path-like literal OR "in <file>" phrasing.
  PATH_LITERAL_REGEX.lastIndex = 0
  const hasPathLiteral = PATH_LITERAL_REGEX.test(normalized)
  const hasSingleFileTarget =
    hasPathLiteral || IN_FILE_REGEX.test(normalized) || THE_FILE_REGEX.test(normalized)

  // 4. Classify.
  let kind: BreadthKind
  if (hasSingleFileTarget) {
    kind = 'single-target'
  } else if (domainCount >= 3 || hasBreadthMarker) {
    kind = 'broad-audit'
  } else {
    kind = 'unclear'
  }

  return {
    kind,
    domains: sortedDomains,
    domainCount,
    hasBreadthMarker,
    hasSingleFileTarget,
  }
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

/**
 * Count occurrences of an agent type for the minimum-shard rule (M10.2). Uses
 * the larger of (a) the number of `subagent_start` records of that type and
 * (b) 1 if the type appears in `distinctAgentTypes` — a `spawn_agents` batch
 * may list a type before any `subagent_start` fires, and the rule gates the
 * sharding DECISION, which is visible in spawn_agents requests even before
 * subagent_start fires.
 */
function countAgentType(
  subagentStarts: SubagentStartRecord[],
  distinctAgentTypes: string[],
  agentType: string,
): number {
  const startsCount = subagentStarts.filter(
    (s) => s.agentType === agentType,
  ).length
  const distinctCount = distinctAgentTypes.includes(agentType) ? 1 : 0
  return Math.max(startsCount, distinctCount)
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

  const filePickerCount = countAgentType(
    subagentStarts,
    distinctAgentTypes,
    'file-picker',
  )
  const codeSearcherCount = countAgentType(
    subagentStarts,
    distinctAgentTypes,
    'code-searcher',
  )

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
    filePickerCount,
    codeSearcherCount,
  }
}

/**
 * Minimum-shard rule evaluation (M10.2, SPEC R10.2). For a `broad-audit`
 * request the orchestrator must spawn at least `max(domainCount, 5)` shard
 * pairs, where a pair = one `file-picker` subagent + one `code-searcher`
 * subagent. For non-`broad-audit` breadth the rule is vacuously satisfied
 * (`requiredPairs = 0`).
 *
 * Pure: no I/O, no side effects. Counts are derived from `signals` (which are
 * themselves derived purely from a trace) and `breadth` (derived purely from
 * a prompt via `classifyBreadth`).
 */
export function evaluateMinimumShardRule(params: {
  signals: PlanShardingSignals
  breadth: BreadthClassification
}): MinimumShardEvaluation {
  const { signals, breadth } = params
  const filePickerCount = signals.filePickerCount
  const codeSearcherCount = signals.codeSearcherCount

  if (breadth.kind !== 'broad-audit') {
    return {
      requiredPairs: 0,
      actualPairs: 0,
      filePickerCount,
      codeSearcherCount,
      satisfies: true,
      reason: 'minimum-shard rule only applies to broad-audit prompts',
    }
  }

  const requiredPairs = Math.max(breadth.domainCount, 5)
  const actualPairs = Math.min(filePickerCount, codeSearcherCount)
  const satisfies = actualPairs >= requiredPairs
  const reason = satisfies
    ? `>=${actualPairs} shard pairs (>=${requiredPairs} required) across ${breadth.domainCount} domains`
    : `only ${actualPairs} shard pair(s) but ${requiredPairs} required (max(domainCount=${breadth.domainCount}, 5)); file-picker=${filePickerCount}, code-searcher=${codeSearcherCount}`

  return {
    requiredPairs,
    actualPairs,
    filePickerCount,
    codeSearcherCount,
    satisfies,
    reason,
  }
}

// ---------------------------------------------------------------------------
// Coverage matrix (M10.3, SPEC R10.3)
// ---------------------------------------------------------------------------

/** One row of the domain -> shard coverage matrix. */
export interface CoverageMatrixEntry {
  /** Domain name (one of `breadth.domains`). */
  domain: string
  /** Shard pairs assigned to this domain (heuristic: round-robin). */
  assignedPairs: number
  /** True iff `assignedPairs >= 1`. */
  covered: boolean
}

/** Coverage matrix: makes unsharded subsystems visible before synthesis. */
export interface CoverageMatrix {
  /** Per-domain entries, sorted alphabetically by domain. */
  entries: CoverageMatrixEntry[]
  /** Domains with `assignedPairs === 0` (only possible when `actualPairs < domainCount`). */
  uncoveredDomains: string[]
  /** True iff `uncoveredDomains.length === 0`. */
  allCovered: boolean
}

/**
 * Build the domain -> shard coverage matrix (M10.3, SPEC R10.3). Before
 * synthesizing, emit a domain -> shard mapping so unsharded subsystems are
 * visible (prevents silent under-coverage).
 *
 * Rules:
 *  - For `breadth.kind !== 'broad-audit'`: vacuously satisfied (empty matrix,
 *    `allCovered = true`).
 *  - For `broad-audit`: sort `breadth.domains` alphabetically, compute
 *    `actualPairs = min(signals.filePickerCount, signals.codeSearcherCount)`,
 *    then assign pairs round-robin (pair `i` goes to `domains[i % domainCount]`).
 *    `covered` = `assignedPairs >= 1`. `uncoveredDomains` = entries with
 *    `assignedPairs === 0` (happens when `actualPairs < domainCount`).
 *
 * Pure: no I/O, no side effects. Deterministic: alphabetical domain sort +
 * round-robin assignment.
 */
export function buildCoverageMatrix(params: {
  breadth: BreadthClassification
  signals: PlanShardingSignals
}): CoverageMatrix {
  const { breadth, signals } = params

  if (breadth.kind !== 'broad-audit') {
    return { entries: [], uncoveredDomains: [], allCovered: true }
  }

  const domains = [...breadth.domains].sort()
  const domainCount = domains.length
  if (domainCount === 0) {
    return { entries: [], uncoveredDomains: [], allCovered: true }
  }

  const actualPairs = Math.min(
    signals.filePickerCount,
    signals.codeSearcherCount,
  )

  const assigned = new Array<number>(domainCount).fill(0)
  for (let pair = 0; pair < actualPairs; pair++) {
    assigned[pair % domainCount]++
  }

  const entries: CoverageMatrixEntry[] = domains.map((domain, i) => ({
    domain,
    assignedPairs: assigned[i],
    covered: assigned[i] >= 1,
  }))

  const uncoveredDomains = entries
    .filter((e) => e.assignedPairs === 0)
    .map((e) => e.domain)

  return {
    entries,
    uncoveredDomains,
    allCovered: uncoveredDomains.length === 0,
  }
}

// ---------------------------------------------------------------------------
// Subsystem-enumeration guard (M10.4, SPEC R10.4)
// ---------------------------------------------------------------------------

/** Result of the subsystem-enumeration guard check. */
export interface SubsystemEnumeration {
  /** The repo's top-level dirs passed in by the caller (e.g. from `fs.readdirSync`). */
  topLevelDirs: string[]
  /** Top-level dirs that appear in `breadth.domains` (audited/in-scope). */
  auditedDirs: string[]
  /** Top-level dirs NOT in `breadth.domains` (need explicit out-of-scope marking). */
  unenumeratedDirs: string[]
  /** True iff `unenumeratedDirs.length === 0` for `broad-audit`; vacuously true otherwise. */
  satisfies: boolean
}

/**
 * Subsystem-enumeration guard (M10.4, SPEC R10.4). The planner must enumerate
 * the repo's top-level subsystems and confirm each was either audited or
 * explicitly marked out-of-scope.
 *
 * Rules:
 *  - For `breadth.kind !== 'broad-audit'`: vacuously satisfied (guard only
 *    applies to broad-audit).
 *  - For `broad-audit`: `auditedDirs` = `topLevelDirs` present in
 *    `breadth.domains` (case-insensitive comparison). `unenumeratedDirs` =
 *    `topLevelDirs` absent from `breadth.domains`. `satisfies` =
 *    `unenumeratedDirs.length === 0`.
 *
 * Pure: no I/O, no side effects. The caller supplies `topLevelDirs`.
 */
export function evaluateSubsystemEnumeration(params: {
  breadth: BreadthClassification
  topLevelDirs: string[]
}): SubsystemEnumeration {
  const { breadth, topLevelDirs } = params

  if (breadth.kind !== 'broad-audit') {
    return {
      topLevelDirs,
      auditedDirs: [],
      unenumeratedDirs: [],
      satisfies: true,
    }
  }

  const lowerDomains = new Set(
    breadth.domains.map((d) => d.toLowerCase()),
  )

  const auditedDirs = topLevelDirs.filter((d) =>
    lowerDomains.has(d.toLowerCase()),
  )
  const unenumeratedDirs = topLevelDirs.filter(
    (d) => !lowerDomains.has(d.toLowerCase()),
  )

  return {
    topLevelDirs,
    auditedDirs,
    unenumeratedDirs,
    satisfies: unenumeratedDirs.length === 0,
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
  prompt?: string,
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

  let verdict: ShardingVerdict = pass ? 'pass' : 'fail'
  if (pass) {
    reasons.unshift(
      `Sharded ${signals.subagentStarts.length} subagent(s) across ${signals.spawnAgentsCallCount} spawn_agents call(s); peak concurrency ${signals.peakConcurrency}, max batch ${signals.maxBatchSize}, distinct types: ${signals.distinctAgentTypes.join(', ') || '(none)'}.`,
    )
  }

  // Minimum-shard rule (M10.2, SPEC R10.2): for `broad-audit` prompts the
  // orchestrator must spawn >= max(domainCount, 5) (file-picker + code-searcher)
  // pairs. This is an additional gate layered on top of the base sharding
  // check. It only applies to `audit`-classified prompts (not `ambiguous`) and
  // only when a prompt string is supplied so breadth can be classified — when
  // `prompt` is omitted the check is skipped, preserving backward
  // compatibility with the single-arg callers (e.g. `run-plan-sharding-eval.ts`).
  if (signals.promptKind === 'audit' && prompt !== undefined) {
    const breadth = classifyBreadth(prompt)
    const minShard = evaluateMinimumShardRule({ signals, breadth })
    if (!minShard.satisfies) {
      if (verdict === 'pass') {
        verdict = 'fail'
      }
      reasons.push(`Minimum-shard rule (M10.2) violated: ${minShard.reason}`)
    }

    // M10.3 coverage-matrix diagnostic (SPEC R10.3): make uncovered domains
    // visible. NON-downgrading — M10.2 already gates the pair count; this
    // only surfaces coverage gaps so they aren't silently under-covered.
    const coverage = buildCoverageMatrix({ breadth, signals })
    if (!coverage.allCovered) {
      reasons.push(
        `Coverage matrix (M10.3) has uncovered domains: ${coverage.uncoveredDomains.join(', ')}.`,
      )
    }
  }

  return { verdict, signals, reasons }
}
