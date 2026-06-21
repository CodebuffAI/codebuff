/**
 * Task-graph queries (§8). Pure functions over an adjacency view so they're
 * trivially unit-testable independent of the store.
 *
 * Edge semantics: `from → to` means "to depends on from"; `to` is unblocked only
 * once every `from` (parent) is **merged** (§8). Everything branches from `main`,
 * so dependencies are ordering-only.
 */

import type { DependencyEdge, Task, TaskId, TaskStatus } from './types'

/** A task is unblocked when all of its parents are merged. */
export function isUnblocked(
  task: Pick<Task, 'parents'>,
  statusOf: (id: TaskId) => TaskStatus | undefined,
): boolean {
  return task.parents.every((p) => statusOf(p) === 'merged')
}

/**
 * Would adding edge `from → to` create a cycle? True if `from` is already
 * reachable from `to` by following existing edges (i.e. `to` is an ancestor of
 * `from`), because the new edge would close the loop. Also true for self-edges.
 *
 * The orchestrator's `add_dependency` tool rejects edges where this returns true
 * (§8, §19).
 */
export function wouldCreateCycle(
  edges: DependencyEdge[],
  from: TaskId,
  to: TaskId,
): boolean {
  if (from === to) return true
  // Follow edges forward from `to`; if we reach `from`, the new edge closes a cycle.
  const adjacency = new Map<TaskId, TaskId[]>()
  for (const e of edges) {
    const list = adjacency.get(e.from)
    if (list) list.push(e.to)
    else adjacency.set(e.from, [e.to])
  }
  const seen = new Set<TaskId>()
  const stack: TaskId[] = [to]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node === from) return true
    if (seen.has(node)) continue
    seen.add(node)
    const next = adjacency.get(node)
    if (next) stack.push(...next)
  }
  return false
}

/** Statuses that count as "actively occupying a concurrency slot" (§6.2). */
export const ACTIVE_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'running',
])

/** Statuses past which a task no longer participates in scheduling (terminal). */
export const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'merged',
  'abandoned',
])
