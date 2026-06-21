/**
 * The orchestrator tool surface (§19) — the contract between the chat agent and
 * the rest of the system. The orchestrator does NOT write code; it directs the
 * task graph. The Scout reuses the same `createTask`/`addDependency` tools (§19),
 * which is why its output lands as ordinary `proposed` tasks in the same graph.
 *
 * Invariants enforced here (not left to the model, §19):
 *  - `addDependency` rejects cycles and edges to/from non-existent tasks.
 *  - `createTask` parents must already exist.
 *  - `sendGuidance` only targets a live task.
 *  - doc writes never go through the orchestrator — `readDoc` is read-only; to
 *    change a doc the orchestrator creates a normal task (§10.1).
 */

import { DocStore } from './docs'
import { wouldCreateCycle } from './graph'
import type { Store } from './store'
import type {
  DocName,
  PipelineStage,
  TaskId,
  TaskOrigin,
  TaskStatus,
  TaskSummary,
} from './types'

export class OrchestratorError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'task_not_found'
      | 'parent_not_found'
      | 'cycle'
      | 'not_live'
      | 'bad_doc_name',
  ) {
    super(message)
    this.name = 'OrchestratorError'
  }
}

/** Statuses a task can receive guidance in — it must have an active agent or be queued (§19). */
const LIVE_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'ready',
  'running',
  'awaiting-approval',
  'blocked',
])

export interface OrchestratorDeps {
  store: Store
  projectId: string
  docs: DocStore
  /** Deterministic id + clock injection (no Date.now/Math.random in core). */
  idGen: () => TaskId
  clock: () => number
}

export class Orchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  private now() {
    return this.deps.clock()
  }

  private requireTask(taskId: TaskId) {
    const task = this.deps.store.getTask(taskId)
    if (!task) {
      throw new OrchestratorError(`Task ${taskId} not found`, 'task_not_found')
    }
    return task
  }

  // — Task graph management —

  createTask(
    input: { title: string; description: string; parents?: TaskId[] },
    meta: { origin?: TaskOrigin; rationale?: string | null } = {},
  ): { taskId: TaskId } {
    const parents = input.parents ?? []
    for (const parent of parents) {
      if (!this.deps.store.getTask(parent)) {
        throw new OrchestratorError(
          `Parent task ${parent} does not exist`,
          'parent_not_found',
        )
      }
    }
    const taskId = this.deps.idGen()
    this.deps.store.insertTask({
      id: taskId,
      projectId: this.deps.projectId,
      title: input.title,
      description: input.description,
      parents,
      origin: meta.origin ?? 'human',
      rationale: meta.rationale ?? null,
      createdAt: this.now(),
    })
    return { taskId }
  }

  updateTask(input: {
    taskId: TaskId
    title?: string
    description?: string
  }): void {
    this.requireTask(input.taskId)
    const patch: { title?: string; description?: string } = {}
    if (input.title !== undefined) patch.title = input.title
    if (input.description !== undefined) patch.description = input.description
    this.deps.store.updateTask(input.taskId, patch, this.now())
  }

  /** "to depends on from": to waits until from is merged. Rejects cycles (§8). */
  addDependency(input: { from: TaskId; to: TaskId }): void {
    this.requireTask(input.from)
    this.requireTask(input.to)
    const edges = this.deps.store.allEdges(this.deps.projectId)
    if (wouldCreateCycle(edges, input.from, input.to)) {
      throw new OrchestratorError(
        `Adding ${input.from} → ${input.to} would create a dependency cycle`,
        'cycle',
      )
    }
    this.deps.store.insertEdge({ from: input.from, to: input.to })
  }

  removeDependency(input: { from: TaskId; to: TaskId }): void {
    this.deps.store.removeEdge({ from: input.from, to: input.to })
  }

  /**
   * Stop work and mark the task abandoned; its unmerged dependents (which were
   * waiting on its merge and never started) are marked `blocked` for the human to
   * redirect or drop (§8). Worktree GC is performed by the engine reacting to the
   * status change.
   */
  abandonTask(input: { taskId: TaskId }): void {
    const task = this.requireTask(input.taskId)
    const now = this.now()
    this.deps.store.updateTask(task.id, { status: 'abandoned', stage: null }, now)
    for (const childId of this.deps.store.childrenOf(task.id)) {
      const child = this.deps.store.getTask(childId)
      if (child && child.status !== 'merged' && child.status !== 'abandoned') {
        this.deps.store.updateTask(childId, { status: 'blocked' }, now)
      }
    }
  }

  // — Task interaction & inspection —

  /**
   * Route a steer to a live Task Agent ("also handle SSO"). Returns the guidance
   * so the engine can deliver/queue it; throws if the task isn't live (§19).
   */
  sendGuidance(input: { taskId: TaskId; message: string }): {
    taskId: TaskId
    message: string
  } {
    const task = this.requireTask(input.taskId)
    if (!LIVE_STATUSES.has(task.status)) {
      throw new OrchestratorError(
        `Cannot send guidance to ${task.id} in status "${task.status}"`,
        'not_live',
      )
    }
    return { taskId: task.id, message: input.message }
  }

  getTask(input: { taskId: TaskId }): {
    status: TaskStatus
    stage: PipelineStage | null
    prUrl?: string
    parents: TaskId[]
    origin: TaskOrigin
  } {
    const task = this.requireTask(input.taskId)
    return {
      status: task.status,
      stage: task.stage,
      prUrl: task.prUrl ?? undefined,
      parents: task.parents,
      origin: task.origin,
    }
  }

  listTasks(input: { status?: TaskStatus } = {}): TaskSummary[] {
    return this.deps.store
      .listTasks(this.deps.projectId, input.status)
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        stage: t.stage,
        parents: t.parents,
        origin: t.origin,
        prUrl: t.prUrl,
      }))
  }

  // — Governing docs (read-only here) —

  /**
   * Read a governing doc. Writes do NOT happen through the orchestrator — to
   * change a doc it creates a normal task so the edit ships via a PR (§10.1).
   */
  readDoc(input: { name: DocName }): string {
    if (!DocStore.isDocName(input.name)) {
      throw new OrchestratorError(
        `Unknown governing doc "${input.name}"`,
        'bad_doc_name',
      )
    }
    return this.deps.docs.read(input.name)
  }
}
