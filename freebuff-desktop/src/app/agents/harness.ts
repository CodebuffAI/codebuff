/**
 * Agent harness abstraction.
 *
 * A thread turn is "run a full coding agent once in this worktree, streaming its
 * reasoning/text/tool-calls back". WHICH agent runs is pluggable:
 *
 *  - `codebuff`    — the hosted Codebuff agent framework (DeepSeek v4 Flash),
 *                    metered through the Codebuff web backend. The free default.
 *  - `claude-code` — the user's locally-authenticated Claude Code (Opus 4.8),
 *                    driven through the Claude Agent SDK. Uses their Anthropic
 *                    subscription/login — no key plumbing, premium quality.
 *
 * Both implement {@link AgentHarness}: given a prompt + cwd + the per-thread custom
 * tool deps, they run one turn and drive a small set of normalized callbacks. The
 * ThreadEngine owns turning those callbacks into ordered `parts` (see core/parts.ts)
 * and spend, so it doesn't care which harness produced them. Each harness also
 * returns an opaque `state` (Codebuff `previousRun` / Claude session id) that the
 * engine threads back in on the next turn to carry context/caching.
 */

import {
  getFreebuffModelsForAccessTier,
} from '@codebuff/common/constants/freebuff-models'

import type { AttachmentImage } from '../../core/attachments'
import type { AgentEventLike } from '../../core/parts'
import { CLAUDE_CODE_MODEL, DEFAULT_FREEBUFF_MODEL } from '../models'
import type { ThreadToolDeps } from './thread-agent'
import type {
  FreebuffAccessTier,
  FreebuffModelOption,
} from '@codebuff/common/constants/freebuff-models'

export type HarnessId = 'codebuff' | 'claude-code'

/** Display metadata for the agent picker (surfaced in /api/state). */
export interface AgentOption {
  id: HarnessId
  /** Harness name, e.g. "Freebuff" / "Claude Code". */
  label: string
  /** Model id the harness runs. For `codebuff` this is just the default; the
   *  actual per-thread model comes from the Freebuff model picker. */
  model: string
  /** Human label for the model, e.g. "MiniMax M3" / "Opus 4.8". */
  modelLabel: string
  /** One-line description shown in the picker. */
  description: string
}

export const AGENT_OPTIONS: readonly AgentOption[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    model: CLAUDE_CODE_MODEL,
    modelLabel: 'Opus 4.8',
    description: 'Your local, authenticated Claude Code (Anthropic subscription)',
  },
  {
    id: 'codebuff',
    label: 'Freebuff',
    model: DEFAULT_FREEBUFF_MODEL,
    // Empty: the per-thread model is shown by the adjacent ModelPicker, so the
    // harness pill stays just "Freebuff" rather than a stale model name.
    modelLabel: '',
    description: 'Free hosted agent — pick any Freebuff model (sees images)',
  },
]

export const DEFAULT_HARNESS: HarnessId = 'codebuff'

export function isHarnessId(v: unknown): v is HarnessId {
  return v === 'codebuff' || v === 'claude-code'
}

/** The Freebuff models a given access tier may pick from, for the model picker.
 *  Full tier → the full grid; limited tier → DeepSeek V4 Flash + MiMo 2.5. */
export function freebuffModelOptions(
  accessTier: FreebuffAccessTier | null | undefined,
): readonly FreebuffModelOption[] {
  return getFreebuffModelsForAccessTier(accessTier)
}

/**
 * Normalized turn callbacks. A harness streams through these; the engine folds
 * them into ordered parts (see ThreadEngine.runTurn).
 *  - onText      — a prose text delta (accumulated into the assistant message).
 *  - onReasoning — a thinking/reasoning delta (its own ordered part).
 *  - onEvent     — a non-text agent event: `tool_call` (toolName/input/toolCallId)
 *                  and a terminal `finish` (closes any open reasoning).
 *  - drainSteering — pull any main-chat messages typed mid-turn so the harness can
 *                  append them as user prompts at a step boundary (Codebuff only;
 *                  Claude Code leaves them for the next turn).
 */
export interface HarnessCallbacks {
  onText: (chunk: string) => void
  onReasoning: (chunk: string) => void
  onEvent: (ev: AgentEventLike) => void
  drainSteering: () => string[]
}

export interface HarnessTurn {
  prompt: string
  cwd: string
  /** The Freebuff model this turn runs on (codebuff harness). Claude Code
   *  ignores it (it always runs Opus 4.8 via the local SDK). */
  model?: string
  /** Free-mode session binding for this turn (codebuff harness only). Present
   *  once the engine has admitted a session for this thread+model: the
   *  instance id is forwarded as `codebuff_metadata.freebuff_instance_id` and
   *  the request runs with `cost_mode: 'free'`. Absent → billed run. */
  freeMode?: { instanceId: string }
  /** Per-thread custom-tool deps (suggest_prompts / write_doc / browser_check). */
  toolDeps: ThreadToolDeps
  /** Opaque state this harness returned last turn (carries context/caching). */
  previousState?: unknown
  /** Aborts the in-flight turn when the user hits Stop. */
  abort: AbortController
  /** Base64 images attached to this turn's message. Vision harnesses (Codebuff on
   *  MiniMax M3) send them as message content; Claude Code ignores them and views
   *  images via the `Read` tool on the path referenced in the prompt text. */
  images?: AttachmentImage[]
}

export interface HarnessResult {
  /** Opaque state to thread back into the next turn (or undefined to reset). */
  state: unknown
}

export interface AgentHarness {
  readonly id: HarnessId
  runTurn(turn: HarnessTurn, cb: HarnessCallbacks): Promise<HarnessResult>
}
