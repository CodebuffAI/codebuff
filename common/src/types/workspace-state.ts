export type WorkspaceChangeAction = {
  action: 'create' | 'update' | 'delete' | 'move' | 'unknown'
  path?: string
  destinationPath?: string
  beforeHash?: string | null
  afterHash?: string | null
}

export type WorkspaceChangeRecord = {
  revision: number
  source: string
  operationId?: string
  receiptId?: string
  occurredAt: number
  actions: WorkspaceChangeAction[]
}

export type WorkspaceStateV1 = {
  schemaVersion: 1
  revision: number
  snapshotId: string
  updatedAt: number
  changes: WorkspaceChangeRecord[]
}

const MAX_RETAINED_WORKSPACE_CHANGES = 128

function stableHash(text: string): string {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function createInitialWorkspaceState(now = Date.now()): WorkspaceStateV1 {
  return {
    schemaVersion: 1,
    revision: 0,
    snapshotId: 'workspace.v1.0.00000000',
    updatedAt: now,
    changes: [],
  }
}

export function advanceWorkspaceState(
  current: WorkspaceStateV1 | undefined,
  params: {
    source: string
    operationId?: string
    receiptId?: string
    actions: WorkspaceChangeAction[]
    occurredAt?: number
  },
): WorkspaceStateV1 {
  const base = current ?? createInitialWorkspaceState(params.occurredAt)
  const revision = base.revision + 1
  const occurredAt = params.occurredAt ?? Date.now()
  const record: WorkspaceChangeRecord = {
    revision,
    source: params.source,
    ...(params.operationId ? { operationId: params.operationId } : {}),
    ...(params.receiptId ? { receiptId: params.receiptId } : {}),
    occurredAt,
    actions: params.actions.map((action) => ({ ...action })),
  }
  const digest = stableHash(
    JSON.stringify({
      previous: base.snapshotId,
      revision,
      source: record.source,
      operationId: record.operationId,
      receiptId: record.receiptId,
      actions: record.actions,
    }),
  )
  return {
    schemaVersion: 1,
    revision,
    snapshotId: `workspace.v1.${revision}.${digest}`,
    updatedAt: occurredAt,
    changes: [...base.changes, record].slice(-MAX_RETAINED_WORKSPACE_CHANGES),
  }
}
