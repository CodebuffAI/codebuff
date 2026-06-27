/** Client-side mirror of the backend thread-model types (see src/core/types.ts). */

import type { AttachmentKind } from '../../../core/attachments'
import type { Part } from '../../../core/parts'

export type { Part, ReasoningCollapse } from '../../../core/parts'
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
  autoQueueSuggestions: boolean
  branch: string | null
  worktreePath: string | null
  baseRef: string | null
  prUrl: string | null
  turnState: TurnState
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

export interface Snapshot {
  project: { id: string; defaultBranch: string; rootPath: string }
  threads: Thread[]
  usage: { costSpent: number; running: number }
  agent?: { harnessId: HarnessId; options: AgentOption[] }
}

/** SSE event shapes emitted by the server (see EngineEvent). */
export type ServerEvent =
  | { type: 'state'; snapshot: Snapshot }
  | { type: 'thread'; threadId: string; thread: Thread; items: QueueItem[] }
  | { type: 'agent'; threadId: string; event: AgentEvent }
  | { type: 'prompt'; threadId: string; text: string }
  | { type: 'log'; level: 'info' | 'error'; message: string }

/** A subset of the SDK PrintModeEvent we render. */
export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'tool_call'; toolName: string; input: unknown; toolCallId?: string }
  | { type: 'tool_result'; toolName?: string; toolCallId?: string }
  | { type: 'finish'; totalCost?: number }
  | { type: string; [k: string]: unknown }
