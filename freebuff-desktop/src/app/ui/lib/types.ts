/** Client-side mirror of the backend thread-model types (see src/core/types.ts). */

import type { AttachmentKind } from '../../../core/attachments'
import type { Part } from '../../../core/parts'

export type { AgentPart, AgentStatus, Part, ReasoningCollapse } from '../../../core/parts'
export type { AttachmentKind, AttachmentMeta } from '../../../core/attachments'

/** A file/photo/folder staged in the composer before send (absolute path + label). */
export interface PendingAttachment {
  path: string
  name: string
  kind: AttachmentKind
}

export type ThreadStatus = 'open' | 'closed'
export type TurnState = 'idle' | 'running'

export interface Thread {
  id: string
  projectId: string
  title: string
  status: ThreadStatus
  /** Per-tab agent pick. Null = inherit the project's default (see Snapshot.agent). */
  harnessId: HarnessId | null
  /** Per-tab Freebuff model (hosted agent). Null = engine's recommended default. */
  freebuffModel: string | null
  autoQueueSuggestions: boolean
  branch: string | null
  worktreePath: string | null
  baseRef: string | null
  /** Branch tip at the time this thread was last closed (engine keeps it so a
   *  rehydrated tab materializes the user's exact file tree). The UI doesn't
   *  read this — mirror only so the wire shape round-trips. */
  lastSeenHead?: string | null
  prUrl: string | null
  /** Inferred PR lifecycle (see core/types for source). Drives the tab icon. */
  prState: 'none' | 'open' | 'merged' | 'closed'
  turnState: TurnState
  /**
   * Outcome of the most recent turn — null while running, then completed /
   * stopped / error. The tab icon uses this when the thread is idle to mark a
   * stopped or errored turn distinctly from one that completed cleanly.
   */
  lastTurnOutcome: 'completed' | 'stopped' | 'error' | null
  createdAt: number
  updatedAt: number
}

export type QueueItemState = 'queued' | 'running' | 'done' | 'suggested'
export type QueueItemSource = 'user' | 'assistant' | 'skill' | 'workflow'

export interface QueueItem {
  id: string
  threadId: string
  prompt: string
  label: string | null
  state: QueueItemState
  source: QueueItemSource
  skillName: string | null
  workflowRunId: string | null
  workflowName: string | null
  position: number
  createdAt: number
  updatedAt: number
}

export interface ToolCall {
  id: string
  toolName: string
  input: unknown
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  /**
   * The turn's reasoning/text/tool calls in stream order (see core/parts.ts).
   * Rendered chronologically so tools interleave with prose instead of grouping.
   */
  parts: Part[]
  /** False while the assistant message is still streaming. */
  done: boolean
}

export interface Skill {
  name: string
  prompt: string
  builtin: boolean
}

export type HarnessId = 'codebuff' | 'claude-code'

export interface AgentOption {
  id: HarnessId
  label: string
  model: string
  modelLabel: string
  description: string
}

export type FreebuffAccessTier = 'full' | 'limited'

/** Mirror of @codebuff/common FreebuffModelOption — the picker's per-model row.
 *  `premiumBucket` is added by the engine: true for models that occupy the
 *  one-per-user premium concurrency slot (premium models + MiniMax M3). */
export interface FreebuffModelOption {
  id: string
  displayName: string
  tagline: string
  availability: 'always' | 'deployment_hours'
  warning?: string
  premium: boolean
  multimodal: boolean
  premiumBucket: boolean
}

/** Folder-picker listing from /api/fs/list (mirrors server BrowseResult). */
export interface BrowseEntry {
  name: string
  path: string
  isRepo: boolean
}
export interface BrowseResult {
  path: string
  parent: string | null
  isRepo: boolean
  entries: BrowseEntry[]
}

/** A skill from the skills.sh registry — a candidate to acquire. */
export interface SkillSearchResult {
  id: string
  name: string
  slug: string
  source: string
  installs: number
}

/** Mirror of the engine's ProjectSettings (see core/settings.ts). v1 is
 *  deliberately narrow — `preview.entry` is the only knob. */
export interface ProjectSettings {
  version: number
  preview: { entry?: string }
}

export interface FreebuffSnapshot {
  accessTier: FreebuffAccessTier
  models: FreebuffModelOption[]
  /** Thread id holding the single premium concurrency slot, or null. */
  premiumSlotHolder: string | null
  authed: boolean
  user: { id?: string; name?: string; email?: string } | null
}

export interface Snapshot {
  project: { id: string; defaultBranch: string; rootPath: string }
  threads: Thread[]
  agent?: { harnessId: HarnessId; options: AgentOption[] }
  /** Freebuff free-mode state for the model picker (tier, models, premium slot). */
  freebuff?: FreebuffSnapshot
  /** True when the project has a previewable entry (resolved against settings). */
  previewReady?: boolean
  /** Project settings as the engine currently sees them. */
  settings?: ProjectSettings
}

/** SSE event shapes emitted by the server (see EngineEvent). */
export type ServerEvent =
  | { type: 'state'; snapshot: Snapshot }
  | { type: 'thread'; threadId: string; thread: Thread; items: QueueItem[] }
  | { type: 'agent'; threadId: string; event: AgentEvent }
  | { type: 'prompt'; threadId: string; text: string }
  | { type: 'log'; level: 'info' | 'error'; message: string }

/** A subset of the SDK PrintModeEvent we render. Text/reasoning/tool events may
 *  carry an `agentId` attributing them to a spawned subagent (see core/parts). */
export type AgentEvent =
  | { type: 'text'; text: string; agentId?: string }
  | { type: 'reasoning_delta'; text: string; agentId?: string }
  | { type: 'tool_call'; toolName: string; input: unknown; toolCallId?: string; agentId?: string }
  | { type: 'tool_result'; toolName?: string; toolCallId?: string }
  | {
      type: 'subagent_start'
      agentId: string
      agentType: string
      displayName: string
      parentAgentId?: string
      prompt?: string
    }
  | { type: 'subagent_finish'; agentId: string }
  | { type: 'finish' }
  | { type: string; [k: string]: unknown }
