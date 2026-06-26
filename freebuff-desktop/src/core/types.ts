/**
 * Freebuff Desktop — core domain model (thread model).
 *
 * A **thread** is one conversation in one browser-style tab. It runs a single
 * full coding agent turn by turn inside its own git worktree, and carries an
 * ordered **queue** of upcoming prompts. The assistant can PROPOSE follow-up
 * prompts ("suggestions") that park in the queue's suggested lane. Skills are
 * reusable named prompts; a workflow is a named ordered list of skills that
 * expands into one queued prompt per skill.
 */

export type ThreadId = string
export type ProjectId = string

/** Governing-doc identities (§10.1). Files live under `.freebuff/docs/`. The
 * `reflect` skill appends durable learnings to `learning`. */
export type DocName =
  | 'product'
  | 'priorities'
  | 'technical'
  | 'learning'

export const DOC_NAMES: readonly DocName[] = [
  'product',
  'priorities',
  'technical',
  'learning',
] as const

export type MergeStrategy = 'squash'

/**
 * Discovered at setup, user-editable. The commands the `test` skill runs.
 */
export interface RunConfig {
  build?: string
  devServer?: string
  test?: string
}

export interface Project {
  id: ProjectId
  repoUrl: string
  /** Local path the repo is managed at; worktrees live under `<root>/.freebuff`. */
  rootPath: string
  defaultBranch: string
  runConfig: RunConfig
  mergeStrategy: MergeStrategy
  /** Tokens/cost per rolling-24h window — informational in the thread model. */
  dailyBudget: number
  createdAt: number
}

export type ThreadStatus = 'open' | 'closed'
/** Whether a turn is currently executing for the thread. */
export type TurnState = 'idle' | 'running'

export interface Thread {
  id: ThreadId
  projectId: ProjectId
  title: string
  status: ThreadStatus
  /** When on, finishing a turn auto-dequeues and runs the next queued prompt. */
  autorun: boolean
  branch: string | null
  worktreePath: string | null
  /** The commit the branch was cut from. Null until the worktree is created. */
  baseRef: string | null
  /** Set by the `open-pr` skill / openPr(). `local://<branch>` when no remote. */
  prUrl: string | null
  turnState: TurnState
  createdAt: number
  updatedAt: number
}

export interface Message {
  role: 'user' | 'assistant'
  text: string
  /** Tool calls the assistant made this turn, for the UI's activity fold. */
  acts: { toolName: string; input: unknown }[]
}

/**
 * Queue item lanes:
 *  - `queued`    — will run, top-down by `position`.
 *  - `running`   — currently executing.
 *  - `done`      — finished (kept for history).
 *  - `suggested` — parked at the bottom; promote to `queued` to run.
 */
export type QueueItemState = 'queued' | 'running' | 'done' | 'suggested'

export type QueueItemSource = 'user' | 'assistant' | 'skill' | 'workflow'

export interface QueueItem {
  id: string
  threadId: ThreadId
  /** The literal prompt text that will be sent to the agent. */
  prompt: string
  /** Short display label (skill name or truncated title); null = show prompt. */
  label: string | null
  state: QueueItemState
  source: QueueItemSource
  /** Set when this item came from a skill. */
  skillName: string | null
  /** Groups all items expanded from one queued workflow. */
  workflowRunId: string | null
  /** Display grouping label (e.g. "ship"). */
  workflowName: string | null
  /** Ordering key within its lane; a float so inserts land between neighbors. */
  position: number
  createdAt: number
  updatedAt: number
}

/** A reusable named prompt, loaded from `.freebuff/skills/<name>.md`. */
export interface Skill {
  name: string
  /** The markdown body sent to the agent as a turn prompt. */
  prompt: string
  /** True if this is a built-in skill (not a user-authored override). */
  builtin: boolean
}

/** A named ordered list of skill names. */
export interface Workflow {
  name: string
  skills: string[]
}

/** Rolling-24h spend bookkeeping per Freebuff account (informational). */
export interface BudgetLedger {
  accountId: string
  tokensUsed: number
  /** Epoch ms when the current rolling window started. */
  windowStart: number
}
