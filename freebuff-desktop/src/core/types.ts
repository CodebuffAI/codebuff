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

import type { Part } from './parts'

export type ThreadId = string
export type ProjectId = string
export type HarnessId = 'codebuff' | 'claude-code'

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
  /** Which agent (Codebuff / Claude Code) runs this thread's turns. Per-thread so
   *  different tabs can run on different agents at the same time. Null while the
   *  thread is using the engine's default (newly-created threads inherit it). */
  harnessId: HarnessId | null
  /** When on, assistant-suggested prompts are dropped straight into the queue
   *  (which always auto-drains) instead of parking in the suggested lane. */
  autoQueueSuggestions: boolean
  branch: string | null
  worktreePath: string | null
  /**
   * The branch's tip SHA at the moment the thread was closed. Persisted so a
   * closed thread's full file tree can be rehydrated from git's object store
   * on reopen (no separate snapshot DB needed). Null while the thread is open
   * (the branch's tip IS the snapshot; git has it).
   */
  lastSeenHead: string | null
  /** The commit the branch was cut from. Null until the worktree is created. */
  baseRef: string | null
  /** Set by the `open-pr` skill / openPr(). `local://<branch>` when no remote. */
  prUrl: string | null
  /**
   * Inferred PR lifecycle, derived from observed tool calls (e.g. `gh pr create`,
   * `gh pr merge`). Drives the tab icon's PR shape so users can tell at a glance
   * whether a thread has an open PR, has merged, or was closed without a merge.
   * Persisted so the indicator survives reload and rehydrate.
   */
  prState: 'none' | 'open' | 'merged' | 'closed'
  turnState: TurnState
  /**
   * Outcome of the most recent turn, so the tab can mark a stopped or errored
   * turn distinctly from one that completed cleanly. Reset to `null` while a
   * turn is running (the running pulse already conveys "in flight").
   */
  lastTurnOutcome: 'completed' | 'stopped' | 'error' | null
  createdAt: number
  updatedAt: number
}

export interface Message {
  role: 'user' | 'assistant'
  text: string
  /** Tool calls the assistant made this turn, for the UI's activity fold. */
  acts: { toolName: string; input: unknown }[]
  /**
   * The turn's reasoning/text/tool calls in the exact order they streamed in, so
   * the transcript renders chronologically (see `parts.ts`). Source of truth for
   * the render; `text` + `acts` are kept as derived columns for backward-compat.
   */
  parts?: Part[]
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

/** A skill listed by the skills.sh registry (a candidate to acquire). */
export interface SkillSearchResult {
  /** Fully-qualified id, e.g. `owner/repo/skill-slug`. */
  id: string
  /** Display name of the skill, e.g. `vercel-react-best-practices`. */
  name: string
  /** Skill slug within its repo, used to download it. */
  slug: string
  /** Source repo, e.g. `vercel-labs/agent-skills`. */
  source: string
  /** Cumulative install count (popularity), if known. */
  installs: number
}

/** A named ordered list of skill names. */
export interface Workflow {
  name: string
  skills: string[]
}
