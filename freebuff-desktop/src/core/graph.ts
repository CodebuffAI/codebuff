/**
 * Task-graph queries (§8). Pure functions over an adjacency view so they're
 * trivially unit-testable independent of the store.
 *
 * Edge semantics: `from → to` means "to depends on from". There are two gates (§8):
 *  - **Start** — `to` may *run* once every parent has finished its workflow
 *    (`awaiting-approval` or `merged`); it branches off an integration base built
 *    from its unmerged parents' branches, so it sees their code before they merge.
 *  - **Merge** — `to` may only *merge* once every parent is `merged` (its branch
 *    sits on top of the parents' commits, so it can't land ahead of them).
 */

import type { DependencyEdge, Task, TaskId, TaskStatus } from './types'

/**
 * Statuses that mean a parent's pipeline (implement → review → test → PR) is
 * complete, so its dependents may start even though it isn't merged yet (§8).
 */
export const WORKFLOW_DONE_STATUSES: ReadonlySet<TaskStatus> =
  new Set<TaskStatus>(['awaiting-approval', 'merged'])

/**
 * Start gate (§8): a task may run once every parent has finished its workflow
 * (review + testing done). Dependents start before the human merges the parent.
 */
export function isUnblocked(
  task: Pick<Task, 'parents'>,
  statusOf: (id: TaskId) => TaskStatus | undefined,
): boolean {
  return task.parents.every((p) => {
    const s = statusOf(p)
    return s !== undefined && WORKFLOW_DONE_STATUSES.has(s)
  })
}

/**
 * Merge gate (§8): a task may merge only once every parent is `merged`. A child's
 * branch is stacked on its parents' commits, so it cannot land ahead of them — when
 * a parent merges the engine restacks the child onto `main`, then it's mergeable.
 */
export function isMergeable(
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

/**
 * Statuses in which a dependent is actively progressing and safe to restack when a
 * parent's tip moves (§8). Excludes `blocked`/`failed` (awaiting human action, reviewed
 * on a stable diff) and `proposed` (not yet started, no branch).
 */
export const RESTACKABLE_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'ready',
  'running',
  'awaiting-approval',
])

/**
 * All non-terminal transitive dependents of `rootId` (§8). Terminal tasks act as
 * barriers — a merged/abandoned dependent shields its own subtree (a child that
 * already merged is on `main`, so abandoning its ancestor doesn't invalidate it).
 * Cycle-safe via a `seen` set. Used by the abandon cascade to decide which dependents
 * to block + GC.
 */
export function transitiveDependents(
  rootId: TaskId,
  childrenOf: (id: TaskId) => TaskId[],
  isTerminal: (id: TaskId) => boolean,
): TaskId[] {
  const out: TaskId[] = []
  const seen = new Set<TaskId>()
  const stack = [...childrenOf(rootId)]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    if (isTerminal(id)) continue // barrier: don't block it, don't descend past it
    out.push(id)
    stack.push(...childrenOf(id))
  }
  return out
}
