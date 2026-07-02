/**
 * Renderer-side types. The domain model (Thread, QueueItem, Skill, the lane/state
 * enums, HarnessId) is RE-EXPORTED from src/core/types so the wire contract has a
 * single source of truth — a backend field change is a compile error here rather
 * than a silent runtime mismatch. Only renderer-specific shapes (the client
 * `Message`, SSE/agent event unions, picker view-models, server-result mirrors)
 * are defined locally.
 */

import type { AttachmentKind } from '../../../core/attachments'
import type { Part } from '../../../core/parts'
import type { HarnessId, QueueItem, Thread } from '../../../core/types'

export type { AgentPart, AgentStatus, NoticePart, Part, ReasoningCollapse } from '../../../core/parts'
export { NOTICE_CLAUDE_CODE_AUTH } from '../../../core/parts'
export type { AttachmentKind, AttachmentMeta } from '../../../core/attachments'
export type {
  HarnessId,
  Thread,
  ThreadStatus,
  TurnState,
  QueueItem,
  QueueItemState,
  QueueItemSource,
  Skill,
  SkillSearchResult,
} from '../../../core/types'

/** A file/photo/folder staged in the composer before send (absolute path + label). */
export interface PendingAttachment {
  path: string
  name: string
  kind: AttachmentKind
}

export interface ToolCall {
  id: string
  toolName: string
  input: unknown
}

/**
 * The renderer's message model: a client-assigned `id` plus a `done` streaming
 * flag, with the turn's reasoning/text/tool calls in stream order (see
 * core/parts.ts), rendered chronologically so tools interleave with prose. This
 * intentionally differs from the persisted core `Message` (role/text/acts/parts).
 */
export interface Message {
  id: string
  role: 'user' | 'assistant'
  parts: Part[]
  /** False while the assistant message is still streaming. */
  done: boolean
}

export interface AgentOption {
  id: HarnessId
  label: string
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
