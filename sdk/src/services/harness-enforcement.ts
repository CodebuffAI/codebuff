import { randomUUID } from 'node:crypto'

import { LocalHarnessStore } from './local-harness-store'

import type { LocalHarnessRecord } from './local-harness-store'

type RecordScope = {
  repositoryId: string
  workspaceId: string
  runId: string
  snapshotId: string
}

export type ApprovalRecord = LocalHarnessRecord & {
  action: string
  target: string
  grantedBy: 'user'
  expiresAt?: string
  consumedAt?: string
}

export type OwnershipRecord = LocalHarnessRecord & {
  transactionId: string
  agentRole: string
  findingsAddressed: string[]
  requirementsAddressed: string[]
  changes: Array<{
    path: string
    ownership: 'pre-existing' | 'agent' | 'mixed' | 'generated'
    beforeHash?: string
    afterHash?: string
  }>
}

function now(): string {
  return new Date().toISOString()
}

export class HarnessApprovalService {
  constructor(private readonly store: LocalHarnessStore) {}

  grant(
    scope: RecordScope,
    params: { action: string; target: string; expiresAt?: string },
  ): ApprovalRecord {
    const timestamp = now()
    return this.store.put('approvals', {
      schemaVersion: 1,
      id: `approval-${randomUUID()}`,
      revision: 0,
      ...scope,
      createdAt: timestamp,
      updatedAt: timestamp,
      action: params.action,
      target: params.target,
      grantedBy: 'user',
      ...(params.expiresAt ? { expiresAt: params.expiresAt } : {}),
    }) as ApprovalRecord
  }

  consume(params: {
    repositoryId: string
    approvalId: string
    action: string
    target: string
    snapshotId: string
  }): ApprovalRecord {
    const existing = this.store.read(
      params.repositoryId,
      'approvals',
      params.approvalId,
    ) as ApprovalRecord | undefined
    if (!existing) throw new Error('Approval not found.')
    if (existing.consumedAt) throw new Error('Approval was already consumed.')
    if (existing.expiresAt && Date.parse(existing.expiresAt) <= Date.now()) {
      throw new Error('Approval has expired.')
    }
    if (
      existing.action !== params.action ||
      existing.target !== params.target ||
      existing.snapshotId !== params.snapshotId
    ) {
      throw new Error('Approval scope does not match the requested action.')
    }
    return this.store.put(
      'approvals',
      {
        ...existing,
        revision: existing.revision + 1,
        updatedAt: now(),
        consumedAt: now(),
      },
      existing.revision,
    ) as ApprovalRecord
  }
}

export class ChangeOwnershipService {
  constructor(private readonly store: LocalHarnessStore) {}

  record(
    scope: RecordScope,
    params: {
      transactionId: string
      agentRole: string
      findingsAddressed: string[]
      requirementsAddressed: string[]
      changes: OwnershipRecord['changes']
    },
  ): OwnershipRecord {
    if (params.changes.length === 0) {
      throw new Error('Ownership receipts require at least one changed path.')
    }
    const paths = new Set<string>()
    for (const change of params.changes) {
      if (!change.path || change.path.includes('..')) {
        throw new Error(`Invalid ownership path '${change.path}'.`)
      }
      if (paths.has(change.path)) {
        throw new Error(`Duplicate ownership path '${change.path}'.`)
      }
      paths.add(change.path)
    }
    const timestamp = now()
    return this.store.put('ownership', {
      schemaVersion: 1,
      id: `ownership-${params.transactionId}`,
      revision: 0,
      ...scope,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...params,
    }) as OwnershipRecord
  }
}

export type HarnessPolicyDecision =
  | { allowed: true; approvalRequired: false }
  | { allowed: false; approvalRequired: boolean; reason: string }

export function evaluateHarnessActionPolicy(params: {
  action: string
  target: string
  defaultBranch?: string
  branch?: string
  hasMatchingApproval: boolean
}): HarnessPolicyDecision {
  const highImpact = new Set([
    'dependency-install',
    'migration',
    'push',
    'pull-request',
    'release',
    'deploy',
    'workspace-delete',
  ])
  if (
    params.action === 'push' &&
    params.branch &&
    params.defaultBranch === params.branch
  ) {
    return {
      allowed: false,
      approvalRequired: false,
      reason: 'Direct default-branch pushes are prohibited by harness policy.',
    }
  }
  if (highImpact.has(params.action) && !params.hasMatchingApproval) {
    return {
      allowed: false,
      approvalRequired: true,
      reason: `Action '${params.action}' requires a snapshot-scoped user approval for '${params.target}'.`,
    }
  }
  return { allowed: true, approvalRequired: false }
}
