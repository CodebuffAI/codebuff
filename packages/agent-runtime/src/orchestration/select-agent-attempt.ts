import { createHash } from 'node:crypto'

import { getEffectiveAgentToolNames } from '../util/agent-tool-names'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'

export type AgentAttemptCandidate = {
  template: AgentTemplate
  contextWindowTokens?: number
  estimatedCostScore?: number
  reliabilityScore?: number
  latencyScore?: number
  explicitRoute?: boolean
}

export type AgentAttemptSelection = {
  candidate: AgentAttemptCandidate
  capabilityId: string
  contextBudgetTokens?: number
  reasons: string[]
  alternatives: Array<{ agentId: string; rejectedReasons: string[] }>
}

export function selectAgentAttempt(params: {
  candidates: AgentAttemptCandidate[]
  requiredTools: string[]
  requiredWritablePaths: string[]
  minimumContextTokens?: number
  runningForRoot: number
  maxRunningForRoot: number
}): AgentAttemptSelection {
  if (params.runningForRoot >= params.maxRunningForRoot) {
    throw new Error(
      `Agent scheduling quota exceeded (${params.runningForRoot}/${params.maxRunningForRoot} running for this root).`,
    )
  }
  const alternatives: AgentAttemptSelection['alternatives'] = []
  const eligible = params.candidates.filter((candidate) => {
    const rejectedReasons: string[] = []
    const tools = new Set(getEffectiveAgentToolNames(candidate.template))
    const missingTools = params.requiredTools.filter((tool) => !tools.has(tool))
    if (missingTools.length > 0) {
      rejectedReasons.push(`missing tools: ${missingTools.join(', ')}`)
    }
    if (
      params.requiredWritablePaths.length > 0 &&
      (candidate.template.filesystemScope?.write ?? ['**/*']).length === 0
    ) {
      rejectedReasons.push('no writable filesystem capability')
    }
    if (
      params.minimumContextTokens !== undefined &&
      candidate.contextWindowTokens !== undefined &&
      candidate.contextWindowTokens < params.minimumContextTokens
    ) {
      rejectedReasons.push(
        `context window ${candidate.contextWindowTokens} < required ${params.minimumContextTokens}`,
      )
    }
    alternatives.push({ agentId: candidate.template.id, rejectedReasons })
    return rejectedReasons.length === 0
  })
  if (eligible.length === 0) {
    throw new Error(
      `No eligible agent attempt: ${alternatives
        .map((item) => `${item.agentId} (${item.rejectedReasons.join('; ')})`)
        .join(', ')}.`,
    )
  }
  eligible.sort((left, right) => {
    if (!!left.explicitRoute !== !!right.explicitRoute) {
      return left.explicitRoute ? -1 : 1
    }
    const reliability =
      (right.reliabilityScore ?? 0.5) - (left.reliabilityScore ?? 0.5)
    if (reliability !== 0) return reliability
    const cost =
      (left.estimatedCostScore ?? Number.POSITIVE_INFINITY) -
      (right.estimatedCostScore ?? Number.POSITIVE_INFINITY)
    if (cost !== 0) return cost
    const latency =
      (left.latencyScore ?? Number.POSITIVE_INFINITY) -
      (right.latencyScore ?? Number.POSITIVE_INFINITY)
    if (latency !== 0) return latency
    return left.template.id.localeCompare(right.template.id)
  })
  const candidate = eligible[0]
  const capabilityId = createHash('sha256')
    .update(
      JSON.stringify({
        agentId: candidate.template.id,
        tools: getEffectiveAgentToolNames(candidate.template).sort(),
        read: [...(candidate.template.filesystemScope?.read ?? [])].sort(),
        write: [...(candidate.template.filesystemScope?.write ?? [])].sort(),
      }),
    )
    .digest('hex')
    .slice(0, 24)
  return {
    candidate,
    capabilityId,
    contextBudgetTokens: candidate.contextWindowTokens,
    reasons: [
      candidate.explicitRoute
        ? 'Preserved the explicit configured agent/model route.'
        : 'Selected the highest-ranked eligible configured route.',
      `Required tools and writable scope are satisfied by capability ${capabilityId}.`,
      ...(candidate.contextWindowTokens
        ? [`Failover-safe context budget: ${candidate.contextWindowTokens} tokens.`]
        : ['Context budget is unknown; runtime request limits remain authoritative.']),
    ],
    alternatives,
  }
}
