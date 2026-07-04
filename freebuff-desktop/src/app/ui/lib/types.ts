/**
 * Renderer-side types. The domain model (Thread, QueueItem, Skill, the lane/state
 * enums, HarnessId) is RE-EXPORTED from src/core/types so the wire contract has a
 * single source of truth — a backend field change is a compile error here rather
 * than a silent runtime mismatch. Only renderer-specific shapes (the client
 * `Message`, SSE/agent event unions, picker view-models, server-result mirrors)
 * are defined locally.
 */

import type { AttachmentKind } from '../../../core/attachments'
import type { AdPayload, Part } from '../../../core/parts'
import type { HarnessId, QueueItem, Thread } from '../../../core/types'

export type {
  AdPart,
  AdPayload,
  AgentPart,
  AgentStatus,
  NoticePart,
  Part,
  ReasoningCollapse,
} from '../../../core/parts'
export { NOTICE_CLAUDE_CODE_AUTH, NOTICE_CODEX_AUTH, NOTICE_FREEBUFF_AUTH } from '../../../core/parts'
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
  /** When true, this agent can't run on this machine (e.g. Codex CLI missing) —
   *  the picker greys it out and blocks selection. */
  disabled?: boolean
  /** Tooltip explaining why it's disabled. */
  disabledReason?: string
}

export type FreebuffAccessTier = 'full' | 'limited'

/** Mirror of @codebuff/common FreebuffModelOption — the picker's per-model row.
 *  `premiumBucket` (model-intrinsic premium flag, drives the "Premium" badge)
 *  and `slotBound` (occupies the one-per-user concurrency slot under the
 *  CURRENT tier — true for every model on the limited tier; drives the picker
 *  lock) are added by the engine. */
export interface FreebuffModelOption {
  id: string
  displayName: string
  tagline: string
  availability: 'always' | 'deployment_hours'
  warning?: string
  premium: boolean
  multimodal: boolean
  premiumBucket: boolean
  slotBound: boolean
}

/** Mirror of the engine's ProjectSettings (see core/settings.ts). v1 is
 *  deliberately narrow — `preview.entry` is the only knob. */
export interface ProjectSettings {
  version: number
  preview: { entry?: string }
}

/** Mirror of @codebuff/common FreebuffSessionRateLimit — one model's session
 *  quota ("recentCount of limit used", resetting at resetAt). */
export interface FreebuffModelQuota {
  model: string
  limit: number
  period: 'pacific_day' | 'pacific_week'
  resetTimeZone: string
  resetAt: string
  recentCount: number
}

export interface FreebuffSnapshot {
  accessTier: FreebuffAccessTier
  models: FreebuffModelOption[]
  /** Thread id holding the single premium concurrency slot, or null. */
  premiumSlotHolder: string | null
  /** Per-model session-quota snapshot for the header badge. Only quota-metered
   *  models appear (premium pool on full tier; every model on limited tier);
   *  absent until the first session probe answers. */
  rateLimitsByModel?: Record<string, FreebuffModelQuota>
  authed: boolean
  user: { id?: string; name?: string; email?: string } | null
  /** Present only when the desktop targets a non-prod API host (a repo
   *  launch's dev stack) — surfaced so sign-in against localhost is visible. */
  apiHost?: string
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

/** SSE event shapes emitted by the server (see EngineEvent). The `auth` event
 *  is app-level, not engine-level: it carries sign-in state even when no
 *  project is open (fresh install), where no snapshot exists to carry it. */
export type ServerEvent =
  | { type: 'state'; snapshot: Snapshot }
  | { type: 'thread'; threadId: string; thread: Thread; items: QueueItem[] }
  | { type: 'agent'; threadId: string; event: AgentEvent }
  | { type: 'prompt'; threadId: string; text: string }
  | { type: 'log'; level: 'info' | 'error'; message: string }
  | { type: 'auth'; authed: boolean; user: { id?: string; name?: string; email?: string } | null }

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
  // A sponsored ad attached to the finished turn (arrives after `finish`).
  | { type: 'ad'; ad: AdPayload }
  | { type: string; [k: string]: unknown }
