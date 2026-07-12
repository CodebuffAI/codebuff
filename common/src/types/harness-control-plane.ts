export type HarnessRecordScope = {
  repositoryId: string
  workspaceId: string
  runId: string
  snapshotId: string
}

export type VersionedHarnessRecord = HarnessRecordScope & {
  schemaVersion: 1
  id: string
  revision: number
  createdAt: string
  updatedAt: string
}

export type RepositoryIdentity = {
  id: string
  canonicalRoot: string
  gitCommonDir?: string
}

export type WorkspaceLease = VersionedHarnessRecord & {
  taskId: string
  path: string
  branch?: string
  baseRef?: string
  ownershipToken: string
  heartbeatAt: string
  status:
    | 'creating'
    | 'active'
    | 'validating'
    | 'reviewing'
    | 'committed'
    | 'pushed'
    | 'merged'
    | 'abandoned'
}

export type SnapshotRef = HarnessRecordScope & {
  id: string
  kind:
    | 'files'
    | 'working-tree'
    | 'staged-tree'
    | 'context'
    | 'validation-input'
    | 'build-artifact'
  contentHash: string
  paths: string[]
  createdAt: string
}

export type TaskRecord = VersionedHarnessRecord & {
  title: string
  phase: string
  owner?: string
  requirements: Array<{ id: string; text: string; required: boolean }>
  acceptanceCriteria: Array<{
    id: string
    behavior: string
    verification: string
  }>
  dependencies: string[]
  blockers: string[]
  attempts: Array<{
    id: string
    hypothesis?: string
    outcome: 'regressed' | 'unchanged' | 'improved' | 'passed'
  }>
}

export type ArtifactRef = HarnessRecordScope & {
  id: string
  kind: string
  path?: string
  contentHash: string
  createdAt: string
}

export type ChangeOwnershipReceipt = VersionedHarnessRecord & {
  transactionId: string
  agentRole: string
  findingsAddressed: string[]
  requirementsAddressed: string[]
  changes: Array<{
    path: string
    ownership: 'pre-existing' | 'agent' | 'mixed' | 'generated'
    beforeHash?: string
    afterHash?: string
    ranges?: Array<{ startLine: number; endLine: number }>
  }>
}

export type ScopedValidationEvidence = VersionedHarnessRecord & {
  command: string
  files: string[]
  artifactKinds: string[]
  status: 'passed' | 'failed' | 'skipped'
  assurance: 'full' | 'reduced' | 'none'
  diagnostics: Array<{
    file?: string
    line?: number
    column?: number
    code?: string
    message: string
  }>
}

export type ReviewFindingRecord = VersionedHarnessRecord & {
  reviewerId: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  text: string
  files: string[]
  status: 'open' | 'addressed' | 'resolved' | 'invalidated'
}

export type ApprovalGrant = VersionedHarnessRecord & {
  action: string
  target: string
  grantedBy: 'user'
  expiresAt?: string
  consumedAt?: string
}

export type HarnessControlPlane = {
  repository: RepositoryIdentity
  workspace?: WorkspaceLease
  task?: TaskRecord
  snapshot: SnapshotRef
  artifacts: ArtifactRef[]
  ownership: ChangeOwnershipReceipt[]
  validation: ScopedValidationEvidence[]
  findings: ReviewFindingRecord[]
  approvals: ApprovalGrant[]
}

export function assertExpectedRevision(
  currentRevision: number,
  expectedRevision: number,
): void {
  if (currentRevision !== expectedRevision) {
    throw new Error(
      `Harness record revision conflict: expected ${expectedRevision}, current ${currentRevision}.`,
    )
  }
}
