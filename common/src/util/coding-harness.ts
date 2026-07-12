export type EvidenceConfidence = 'confirmed' | 'inferred' | 'unknown'

export type CodingContextItem = {
  path: string
  symbols: string[]
  reason: string
  relevance: number
  freshnessHash?: string
  confidence: EvidenceConfidence
  excluded?: boolean
}

export type CodingContextPacket = {
  request: string
  acceptanceCriteria: string[]
  items: CodingContextItem[]
  diagnostics: string[]
  priorAttempts: CodingAttemptRecord[]
}

export type CodingAttemptOutcome =
  | 'regressed'
  | 'unchanged'
  | 'improved'
  | 'passed'

export type CodingAttemptRecord = {
  hypothesisId: string
  hypothesis: string
  evidence: string[]
  filesChanged: string[]
  diagnosticsBefore: string[]
  diagnosticsAfter: string[]
  outcome: CodingAttemptOutcome
}

export type StrategyDecision = {
  action: 'continue' | 'switch_strategy' | 'root_cause_analysis'
  reason: string
}

export function evaluateCodingStrategy(
  attempts: CodingAttemptRecord[],
): StrategyDecision {
  const latest = attempts.at(-1)
  if (!latest) return { action: 'continue', reason: 'No prior attempts.' }
  const sameHypothesis = attempts.filter(
    (attempt) => attempt.hypothesisId === latest.hypothesisId,
  )
  if (
    sameHypothesis.length >= 2 &&
    sameHypothesis.slice(-2).every((attempt) =>
      ['unchanged', 'regressed'].includes(attempt.outcome),
    )
  ) {
    return {
      action: 'switch_strategy',
      reason: `Hypothesis ${latest.hypothesisId} failed to improve the result twice.`,
    }
  }
  const survivingDiagnostics = latest.diagnosticsAfter.filter((diagnostic) =>
    latest.diagnosticsBefore.includes(diagnostic),
  )
  if (survivingDiagnostics.length > 0 && sameHypothesis.length >= 2) {
    return {
      action: 'root_cause_analysis',
      reason: `Diagnostics survived repeated edits: ${survivingDiagnostics.join('; ')}`,
    }
  }
  return { action: 'continue', reason: 'The latest attempt improved or changed evidence.' }
}

export type RetrievalEffectiveness = {
  precision: number
  recall: number
  lateDiscoveryRate: number
}

export function measureRetrievalEffectiveness(params: {
  retrieved: string[]
  useful: string[]
  decisive: string[]
  decisiveBeforeFirstEdit: string[]
}): RetrievalEffectiveness {
  const retrieved = new Set(params.retrieved)
  const usefulRetrieved = new Set(
    params.useful.filter((file) => retrieved.has(file)),
  )
  const decisive = new Set(params.decisive)
  const early = new Set(params.decisiveBeforeFirstEdit)
  return {
    precision: retrieved.size === 0 ? 0 : usefulRetrieved.size / retrieved.size,
    recall:
      decisive.size === 0
        ? 1
        : [...decisive].filter((file) => retrieved.has(file)).length /
          decisive.size,
    lateDiscoveryRate:
      decisive.size === 0
        ? 0
        : [...decisive].filter((file) => !early.has(file)).length / decisive.size,
  }
}

export function validateContextPacket(packet: CodingContextPacket): string[] {
  const errors: string[] = []
  if (!packet.request.trim()) errors.push('Request is empty.')
  for (const item of packet.items) {
    if (!item.reason.trim()) errors.push(`${item.path}: missing relevance reason.`)
    if (item.relevance < 0 || item.relevance > 1) {
      errors.push(`${item.path}: relevance must be between 0 and 1.`)
    }
    if (item.confidence === 'confirmed' && !item.freshnessHash) {
      errors.push(`${item.path}: confirmed context requires a freshness hash.`)
    }
  }
  return errors
}
