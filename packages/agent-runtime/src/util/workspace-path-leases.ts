import { randomUUID } from 'node:crypto'
import path from 'node:path'

import type { AgentState } from '@codebuff/common/types/session-state'

type ActiveLease = {
  leaseId: string
  projectRoot: string
  ownerAgentId: string
  paths: string[]
  expiresAt: number
}

const activeLeases = new Map<string, ActiveLease>()
const DEFAULT_LEASE_MS = 30 * 60_000

function normalizePattern(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
}

function stablePrefix(value: string): string {
  const normalized = normalizePattern(value)
  const wildcard = normalized.search(/[?*{[]/)
  return (wildcard < 0 ? normalized : normalized.slice(0, wildcard))
    .replace(/\/+$/, '')
}

function overlaps(left: string, right: string): boolean {
  const leftPrefix = stablePrefix(left)
  const rightPrefix = stablePrefix(right)
  if (!leftPrefix || !rightPrefix) return true
  return (
    leftPrefix === rightPrefix ||
    leftPrefix.startsWith(`${rightPrefix}/`) ||
    rightPrefix.startsWith(`${leftPrefix}/`)
  )
}

function sweep(now = Date.now()): void {
  for (const [leaseId, lease] of activeLeases) {
    if (lease.expiresAt <= now) activeLeases.delete(leaseId)
  }
}

export function acquireWorkspacePathLease(params: {
  state: AgentState
  projectRoot: string
  ownerAgentId: string
  taskId?: string
  paths: string[]
  leaseMs?: number
}): string | undefined {
  const requested = [...new Set(params.paths.map(normalizePattern).filter(Boolean))]
  if (requested.length === 0) return undefined
  sweep()
  const projectRoot = path.resolve(params.projectRoot)
  for (const lease of activeLeases.values()) {
    if (
      lease.projectRoot === projectRoot &&
      lease.ownerAgentId !== params.ownerAgentId &&
      requested.some((candidate) =>
        lease.paths.some((existing) => overlaps(candidate, existing)),
      )
    ) {
      throw new Error(
        `Workspace path lease conflict: ${params.ownerAgentId} overlaps active owner ${lease.ownerAgentId} on ${lease.paths.join(', ')}.`,
      )
    }
  }
  const leaseId = randomUUID()
  const now = Date.now()
  const expiresAt = now + Math.max(1, params.leaseMs ?? DEFAULT_LEASE_MS)
  activeLeases.set(leaseId, {
    leaseId,
    projectRoot,
    ownerAgentId: params.ownerAgentId,
    paths: requested,
    expiresAt,
  })
  params.state.workspacePathLeases ??= []
  params.state.workspacePathLeases.push({
    leaseId,
    ownerAgentId: params.ownerAgentId,
    taskId: params.taskId,
    paths: requested,
    status: 'active',
    acquiredAt: now,
    expiresAt,
  })
  return leaseId
}

export function releaseWorkspacePathLease(
  state: AgentState,
  leaseId: string | undefined,
): void {
  if (!leaseId) return
  activeLeases.delete(leaseId)
  const durable = state.workspacePathLeases?.find(
    (lease) => lease.leaseId === leaseId,
  )
  if (durable && durable.status === 'active') {
    durable.status = 'released'
    durable.releasedAt = Date.now()
  }
}

export function reconcileInterruptedPathLeases(state: AgentState): void {
  for (const lease of state.workspacePathLeases ?? []) {
    if (lease.status !== 'active') continue
    if (!activeLeases.has(lease.leaseId)) {
      lease.status = 'interrupted'
      lease.releasedAt = Date.now()
    }
  }
}
