import { z } from 'zod/v4'

import type { ComparisonResult } from './compare-runs'
import type { AgentDefinition } from '@openbuff/sdk'

/**
 * Structured config-change proposals emitted by the lessons extractor.
 *
 * Each proposal targets a specific agent and describes one mechanical change
 * to its definition. The `applyProposals` pure function simulates an ordered
 * list of proposals against a copy of agent definitions, producing a
 * human-reviewable dry-run report.
 *
 * Supported proposal kinds (deliberately small + safe):
 *  - append_system_prompt_guidance: append guidance text to systemPrompt
 *  - add_tool: add a tool name to toolNames
 *  - remove_tool: remove a tool name from toolNames
 *  - set_model: change the agent's model
 *  - set_budget: set maxCostCents / maxTokensPerTurn on the agent definition
 *
 * Intentionally NOT supported (too risky for an automated loop):
 *  - Editing existing systemPrompt text (only appending is allowed)
 *  - Removing tools that other agents depend on (no cross-agent graph check)
 *  - Arbitrary JSON mutations (no escape hatch)
 *
 * The closed-loop workflow is: lessons extractor LLM emits proposals →
 * applyProposals(...) produces a human-reviewable dry-run report → manually
 * stage reviewed changes in a separate worktree → re-eval →
 * compareRuns(before, after). This module never persists proposal changes.
 */

const agentTargetSchema = z.object({
  agentId: z
    .string()
    .min(1)
    .describe(
      'The id of the agent definition to modify (e.g. "buffbench-lessons-extractor").',
    ),
})

export const AppendSystemPromptGuidanceSchema = z.object({
  kind: z.literal('append_system_prompt_guidance'),
  target: agentTargetSchema,
  guidance: z
    .string()
    .min(1)
    .max(2000)
    .describe(
      'Text to append to the agent systemPrompt. Should be self-contained guidance (e.g. "When editing exported symbols, run query_index with mode references first."). Will be appended after a blank line separator.',
    ),
  rationale: z
    .string()
    .min(1)
    .max(500)
    .describe(
      'Why this guidance is being proposed (references the lesson it addresses).',
    ),
})

export const AddToolSchema = z.object({
  kind: z.literal('add_tool'),
  target: agentTargetSchema,
  toolName: z
    .string()
    .min(1)
    .describe('The tool name to add to toolNames (e.g. "query_index").'),
  rationale: z.string().min(1).max(500),
})

export const RemoveToolSchema = z.object({
  kind: z.literal('remove_tool'),
  target: agentTargetSchema,
  toolName: z
    .string()
    .min(1)
    .describe('The tool name to remove from toolNames.'),
  rationale: z.string().min(1).max(500),
})

export const SetModelSchema = z.object({
  kind: z.literal('set_model'),
  target: agentTargetSchema,
  model: z
    .string()
    .min(1)
    .describe('The new model id (e.g. "anthropic/claude-sonnet-4-5").'),
  rationale: z.string().min(1).max(500),
})

export const SetBudgetSchema = z.object({
  kind: z.literal('set_budget'),
  target: agentTargetSchema,
  maxCostCents: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe(
      'Per-run cost cap in US cents, or null to leave unchanged. Must be a positive integer.',
    ),
  maxTokensPerTurn: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe(
      'Per-turn token cap, or null to leave unchanged. Must be a positive integer.',
    ),
  rationale: z.string().min(1).max(500),
})

export const ProposalSchema = z.discriminatedUnion('kind', [
  AppendSystemPromptGuidanceSchema,
  AddToolSchema,
  RemoveToolSchema,
  SetModelSchema,
  SetBudgetSchema,
])

export type Proposal = z.infer<typeof ProposalSchema>
export type AppendSystemPromptGuidance = z.infer<
  typeof AppendSystemPromptGuidanceSchema
>
export type AddTool = z.infer<typeof AddToolSchema>
export type RemoveTool = z.infer<typeof RemoveToolSchema>
export type SetModel = z.infer<typeof SetModelSchema>
export type SetBudget = z.infer<typeof SetBudgetSchema>

/**
 * Result of applying a single proposal. `applied` is false when the target
 * agent was not found or the proposal was a no-op (e.g. adding a tool that
 * already exists). `error` is set when the proposal was malformed or unsafe.
 */
export interface ProposalApplicationResult {
  proposal: Proposal
  applied: boolean
  error?: string
  /** The agent id that was matched (or undefined if no match). */
  matchedAgentId?: string
}

/**
 * Result of applying a list of proposals to a set of agent definitions.
 *
 * `modifiedDefinitions` is always a deep copy with proposals simulated. The
 * caller may inspect it for review or comparison, but this helper never
 * persists changes and summary lines are always prefixed with `[dry-run]`.
 */
export interface ApplyProposalsResult {
  modifiedDefinitions: AgentDefinition[]
  perProposal: ProposalApplicationResult[]
  /** Number of proposals that actually changed a definition. */
  appliedCount: number
  /** Number of proposals that were no-ops or had errors. */
  skippedCount: number
  /** Human-readable summary lines, one per proposal. */
  summary: string[]
}

export interface ProposalPromotionPolicy {
  /** Minimum aggregate score improvement required before promotion. */
  minTotalScoreDelta: number
  /** Reject when any compared agent regressed. */
  requireNoRegressions: boolean
  /** Reject when the dry run applied no proposals. */
  requireAppliedProposals: boolean
}

export interface ProposalPromotionDecision {
  accepted: boolean
  reasons: string[]
  proposalSummary: string[]
  comparisonSummary: string
}

/**
 * Apply an ordered list of proposals to a set of agent definitions.
 *
 * Pure dry-run: does not mutate the input `agentDefinitions` (deep-copies
 * first) and does not touch the filesystem. The returned `modifiedDefinitions`
 * are for review/comparison only; callers must not auto-persist them.
 *
 * Proposals are applied in order. A later proposal can build on an earlier
 * one (e.g. add_tool then set_model on the same agent). Unknown agent ids are
 * recorded as skipped (applied=false) rather than throwing — the caller
 * decides whether to fail the whole batch or proceed.
 */
export function applyProposals(params: {
  proposals: Proposal[]
  agentDefinitions: AgentDefinition[]
  /**
   * Deprecated compatibility flag. Proposal application is always dry-run and
   * never signals that callers should persist the modified copy automatically.
   */
  dryRun?: boolean
}): ApplyProposalsResult {
  const { proposals, agentDefinitions } = params

  // Deep copy so we never mutate the caller's definitions. AgentDefinition is
  // a plain JSON-ish object; structuredClone is available in Bun/Node 17+.
  const modified: AgentDefinition[] = agentDefinitions.map((def) =>
    structuredClone(def),
  )

  const perProposal: ProposalApplicationResult[] = []
  const summary: string[] = []
  let appliedCount = 0
  let skippedCount = 0

  for (const proposal of proposals) {
    const result = applyOne(proposal, modified)
    perProposal.push(result)
    if (result.applied) {
      appliedCount++
      summary.push(formatProposalSummary(proposal, result) + ' — APPLIED')
    } else {
      skippedCount++
      summary.push(
        formatProposalSummary(proposal, result) +
          ` — SKIPPED${result.error ? ` (${result.error})` : ''}`,
      )
    }
  }

  return {
    modifiedDefinitions: modified,
    perProposal,
    appliedCount,
    skippedCount,
    summary,
  }
}

function applyOne(
  proposal: Proposal,
  definitions: AgentDefinition[],
): ProposalApplicationResult {
  const idx = definitions.findIndex((d) => d.id === proposal.target.agentId)
  if (idx === -1) {
    return {
      proposal,
      applied: false,
      error: `agent "${proposal.target.agentId}" not found`,
    }
  }
  const def = definitions[idx]
  const matchedAgentId = def.id

  switch (proposal.kind) {
    case 'append_system_prompt_guidance': {
      const existing = def.systemPrompt ?? ''
      const separator = existing.endsWith('\n') ? '\n' : '\n\n'
      const newValue = existing + separator + proposal.guidance
      if (newValue === existing) {
        return { proposal, applied: false, matchedAgentId, error: 'no-op' }
      }
      def.systemPrompt = newValue
      return { proposal, applied: true, matchedAgentId }
    }

    case 'add_tool': {
      const tools = def.toolNames ?? []
      if (tools.includes(proposal.toolName)) {
        return {
          proposal,
          applied: false,
          matchedAgentId,
          error: `tool "${proposal.toolName}" already present`,
        }
      }
      def.toolNames = [...tools, proposal.toolName]
      return { proposal, applied: true, matchedAgentId }
    }

    case 'remove_tool': {
      const tools = def.toolNames ?? []
      if (!tools.includes(proposal.toolName)) {
        return {
          proposal,
          applied: false,
          matchedAgentId,
          error: `tool "${proposal.toolName}" not present`,
        }
      }
      def.toolNames = tools.filter((t) => t !== proposal.toolName)
      return { proposal, applied: true, matchedAgentId }
    }

    case 'set_model': {
      if (def.model === proposal.model) {
        return { proposal, applied: false, matchedAgentId, error: 'no-op' }
      }
      def.model = proposal.model
      return { proposal, applied: true, matchedAgentId }
    }

    case 'set_budget': {
      // AgentDefinition declares maxCostCents? and maxTokensPerTurn? as
      // optional fields, so we can set them directly. The runtime's
      // lazy-init reads them from the template.
      let changed = false
      if (proposal.maxCostCents !== null) {
        if (def.maxCostCents !== proposal.maxCostCents) {
          def.maxCostCents = proposal.maxCostCents
          changed = true
        }
      }
      if (proposal.maxTokensPerTurn !== null) {
        if (def.maxTokensPerTurn !== proposal.maxTokensPerTurn) {
          def.maxTokensPerTurn = proposal.maxTokensPerTurn
          changed = true
        }
      }
      if (!changed) {
        return { proposal, applied: false, matchedAgentId, error: 'no-op' }
      }
      return { proposal, applied: true, matchedAgentId }
    }

    default: {
      // Exhaustiveness check — if a new proposal kind is added to the union
      // without a case here, this will fail to compile (the `never` assertion).
      const _exhaustive: never = proposal
      void _exhaustive
      return {
        proposal,
        applied: false,
        matchedAgentId,
        error: `unsupported proposal kind`,
      }
    }
  }
}

function formatProposalSummary(
  proposal: Proposal,
  result: ProposalApplicationResult,
): string {
  const mode = '[dry-run]'
  const target = result.matchedAgentId ?? proposal.target.agentId
  switch (proposal.kind) {
    case 'append_system_prompt_guidance':
      return `${mode} ${target}: append system-prompt guidance (${proposal.guidance.length} chars)`
    case 'add_tool':
      return `${mode} ${target}: add tool "${proposal.toolName}"`
    case 'remove_tool':
      return `${mode} ${target}: remove tool "${proposal.toolName}"`
    case 'set_model':
      return `${mode} ${target}: set model "${proposal.model}"`
    case 'set_budget': {
      const parts: string[] = []
      if (proposal.maxCostCents !== null)
        parts.push(`cost=${proposal.maxCostCents}c`)
      if (proposal.maxTokensPerTurn !== null)
        parts.push(`tokens=${proposal.maxTokensPerTurn}`)
      return `${mode} ${target}: set budget (${parts.join(', ') || 'no-op'})`
    }
  }
}

const defaultPromotionPolicy: ProposalPromotionPolicy = {
  minTotalScoreDelta: 0.25,
  requireNoRegressions: true,
  requireAppliedProposals: true,
}

export function decideProposalPromotion(params: {
  dryRun: ApplyProposalsResult
  comparison: ComparisonResult
  policy?: Partial<ProposalPromotionPolicy>
}): ProposalPromotionDecision {
  const policy = { ...defaultPromotionPolicy, ...params.policy }
  const reasons: string[] = []

  if (policy.requireAppliedProposals && params.dryRun.appliedCount === 0) {
    reasons.push('no proposals applied in dry run')
  }
  if (params.comparison.overall.totalScoreDelta < policy.minTotalScoreDelta) {
    reasons.push(
      `score delta ${params.comparison.overall.totalScoreDelta.toFixed(2)} is below required ${policy.minTotalScoreDelta.toFixed(2)}`,
    )
  }
  if (policy.requireNoRegressions && params.comparison.hasRegressions) {
    reasons.push(
      `regressions detected for ${params.comparison.overall.regressedAgentIds.join(', ')}`,
    )
  }

  return {
    accepted: reasons.length === 0,
    reasons:
      reasons.length > 0
        ? reasons
        : ['meets promotion threshold with no regressions'],
    proposalSummary: params.dryRun.summary,
    comparisonSummary: `score ${params.comparison.overall.totalScoreDelta >= 0 ? '+' : ''}${params.comparison.overall.totalScoreDelta.toFixed(2)}, cost ${params.comparison.overall.totalCostDelta >= 0 ? '+' : ''}${params.comparison.overall.totalCostDelta.toFixed(0)}c, runs ${params.comparison.overall.totalBeforeRuns}→${params.comparison.overall.totalAfterRuns}`,
  }
}

export function formatProposalPromotionReport(
  decision: ProposalPromotionDecision,
): string {
  const lines: string[] = []
  lines.push('## Proposal Promotion Report')
  lines.push('')
  lines.push(`Decision: ${decision.accepted ? 'ACCEPT' : 'REJECT'}`)
  lines.push(`Comparison: ${decision.comparisonSummary}`)
  lines.push('')
  lines.push('Reasons:')
  for (const reason of decision.reasons) lines.push(`- ${reason}`)
  lines.push('')
  lines.push('Proposal dry-run:')
  for (const summary of decision.proposalSummary) lines.push(`- ${summary}`)
  return lines.join('\n')
}

/**
 * Parse and validate a list of proposal objects (e.g. from an LLM structured
 * output or a JSON file). Returns `{valid, proposals, errors}`.
 */
export function parseProposals(raw: unknown): {
  valid: boolean
  proposals: Proposal[]
  errors: string[]
} {
  const result = z.array(ProposalSchema).safeParse(raw)
  if (result.success) {
    return { valid: true, proposals: result.data, errors: [] }
  }
  const errors = result.error.issues.map(
    (iss) => `${iss.path.join('.')}: ${iss.message}`,
  )
  return { valid: false, proposals: [], errors }
}
