export type AgentRole =
  | 'orchestrator'
  | 'explorer'
  | 'thinker'
  | 'editor'
  | 'repair-editor'
  | 'test-writer'
  | 'doc-writer'
  | 'validator'
  | 'reviewer'

export type AgentHandoff = {
  schemaVersion: 1
  taskId: string
  role: AgentRole
  objective: string
  requirements: Array<{ id: string; text: string; required: boolean }>
  acceptanceCriteria: Array<{ id: string; behavior: string; verification: string }>
  context: Array<{
    path: string
    symbols: string[]
    reason: string
    confidence: 'confirmed' | 'inferred' | 'unknown'
    freshnessHash?: string
  }>
  currentBehavior: string
  desiredBehavior: string
  invariants: string[]
  nonGoals: string[]
  risks: string[]
  unknowns: string[]
  findings: Array<{
    id: string
    text: string
    files: string[]
    snapshotFingerprint: string
  }>
  permissions: {
    readablePaths: string[]
    writablePaths: string[]
    allowedTools: string[]
  }
}

export type AgentReceipt = {
  schemaVersion: 1
  taskId: string
  role: AgentRole
  status: 'completed' | 'partial' | 'blocked'
  changedFiles: Array<{ path: string; beforeHash?: string; afterHash?: string }>
  requirementsAddressed: string[]
  acceptanceCriteriaAddressed: string[]
  findingsAddressed: string[]
  assumptions: string[]
  unresolved: string[]
  requestedValidation: string[]
}

export function isDirectOrchestratorEditEligible(params: {
  fileCount: number
  estimatedChangedLines: number
  behaviorChange: boolean
  publicContractChange: boolean
  requiresTests: boolean
  securityOrConcurrencyRisk: boolean
  hasOpenFindings: boolean
}): boolean {
  return (
    params.fileCount === 1 &&
    params.estimatedChangedLines <= 12 &&
    !params.behaviorChange &&
    !params.publicContractChange &&
    !params.requiresTests &&
    !params.securityOrConcurrencyRisk &&
    !params.hasOpenFindings
  )
}
