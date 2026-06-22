/**
 * Freebuff Desktop — core domain model.
 *
 * Mirrors §14 (Data Model) and the type aliases in §19 of
 * docs/freebuff-desktop-prd.md. These are the persisted entities the scheduler,
 * worktree manager, and orchestrator tool surface all operate on.
 */

export type TaskId = string
export type ProjectId = string

/**
 * Task lifecycle (§19). The scheduler advances tasks through these; the human
 * gates the `awaiting-approval` → `merged` transition.
 *
 *  proposed          — created (by a human seed or the Scout), not yet promoted
 *  ready             — promoted, waiting for a scheduler slot / for parents to merge
 *  running           — a Task Agent is executing its pipeline
 *  awaiting-approval — pipeline finished; PR is open and ready for a human yes/no
 *  merged            — approved + squash-merged to main (terminal, unblocks dependents)
 *  blocked           — needs a human (merge conflict, repeated review failure, bad run-config)
 *  failed            — pipeline errored in a way retries couldn't recover
 *  abandoned         — explicitly dropped; worktree GC'd (terminal)
 */
export type TaskStatus =
  | 'proposed'
  | 'ready'
  | 'running'
  | 'awaiting-approval'
  | 'merged'
  | 'blocked'
  | 'failed'
  | 'abandoned'

/** The fixed, code-backed pipeline stages every task runs (§7). */
export type PipelineStage = 'implement' | 'simplify' | 'review' | 'test' | 'pr'

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  'implement',
  'simplify',
  'review',
  'test',
  'pr',
] as const

/** Governing-doc identities (§10.1). Files live under `.freebuff/docs/`. */
export type DocName =
  | 'product'
  | 'priorities'
  | 'technical'
  | 'implementation'
  | 'review'
  | 'testing'
  | 'task-generation'
  | 'learning'

export const DOC_NAMES: readonly DocName[] = [
  'product',
  'priorities',
  'technical',
  'implementation',
  'review',
  'testing',
  'task-generation',
  'learning',
] as const

/** Which agent role reads which docs (§11) — the orchestrator reads all of them. */
export const ROLE_DOCS: Record<PipelineStage, DocName[]> = {
  implement: ['implementation', 'product'],
  simplify: ['implementation'],
  review: ['review'],
  test: ['testing', 'product'],
  pr: [],
}

/** Where a task came from — powers the §18 autonomy metric. */
export type TaskOrigin = 'human' | 'scout'

export type MergeStrategy = 'squash'

/**
 * Discovered at setup (§6.4), user-editable. These are the commands the testing
 * pass (§7.1) actually runs.
 */
export interface RunConfig {
  build?: string
  devServer?: string
  test?: string
}

export interface Project {
  id: ProjectId
  repoUrl: string
  /** Local path the repo is cloned/managed at; worktrees live under `<root>/.freebuff`. */
  rootPath: string
  defaultBranch: string
  runConfig: RunConfig
  mergeStrategy: MergeStrategy
  /** Set by the Freebuff backend, not the user (§13). Tokens per rolling-24h window. */
  dailyBudget: number
  concurrencyCap: number
  createdAt: number
}

export interface Task {
  id: TaskId
  projectId: ProjectId
  createdAt: number
  title: string
  /** The spec the Task Agent works from. */
  description: string
  status: TaskStatus
  /**
   * Dependency parents (§8). A task may *start* once all parents have finished
   * their workflow (`awaiting-approval` or `merged`); it may only *merge* once all
   * parents are `merged` (see graph.ts `isUnblocked` / `isMergeable`).
   */
  parents: TaskId[]
  branch: string | null
  /**
   * The commit the branch was based on — `main` for an independent task, or an
   * integration base (main + unmerged parent branches) for a dependent that started
   * before its parents merged (§8). Used as the `--onto … <oldBase>` upstream when
   * restacking the child after a parent's tip moves or merges, so only the child's
   * own commits are replayed. Null until the worktree is created.
   */
  baseRef: string | null
  worktreePath: string | null
  prUrl: string | null
  /** Resume marker (§6.5): relaunch re-runs the next stage after this one. */
  lastCompletedStage: PipelineStage | null
  /** Current stage while `running`; null otherwise. */
  stage: PipelineStage | null
  origin: TaskOrigin
  /**
   * The task whose completion spawned this one — set by the Scout (§9) to the
   * just-shipped task it fired off. Lets the UI group proposals under the work
   * that motivated them. Null for human-created tasks and legacy scout tasks.
   * This is provenance only, NOT a dependency edge (see `parents`).
   */
  spawnedFrom: TaskId | null
  /** One-line "why this task" — shown on the card, required for scout tasks (§9). */
  rationale: string | null
  /** Count of review→fix→re-review rounds spent (§7, default cap 2). */
  reviewRetries: number
  /** Count of human request-changes rounds (§12). */
  changesRequestedRounds: number
  updatedAt: number
}

/** `to` depends on `from`: `to` waits until `from` is merged (§8, §19). */
export interface DependencyEdge {
  from: TaskId
  to: TaskId
}

/** Rolling-24h token budget bookkeeping per Freebuff account (§13). */
export interface BudgetLedger {
  accountId: string
  tokensUsed: number
  /** Epoch ms when the current rolling window started. */
  windowStart: number
}

export type TaskSummary = Pick<
  Task,
  'id' | 'title' | 'status' | 'stage' | 'parents' | 'origin' | 'prUrl'
>
