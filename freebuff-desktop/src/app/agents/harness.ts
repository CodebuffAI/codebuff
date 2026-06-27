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

import type { AgentEventLike } from '../../core/parts'
import { CLAUDE_CODE_MODEL, FREEBUFF_MODEL } from '../models'
import type { ThreadToolDeps } from './thread-agent'

export type HarnessId = 'codebuff' | 'claude-code'

/** Display metadata for the agent picker (surfaced in /api/state). */
export interface AgentOption {
  id: HarnessId
  /** Harness name, e.g. "Codebuff" / "Claude Code". */
  label: string
  /** Model id the harness runs. */
  model: string
  /** Human label for the model, e.g. "DeepSeek v4 Flash" / "Opus 4.8". */
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
    label: 'Codebuff',
    model: FREEBUFF_MODEL,
    modelLabel: 'DeepSeek v4 Flash',
    description: 'Free hosted agent',
  },
]

export const DEFAULT_HARNESS: HarnessId = 'codebuff'

export function isHarnessId(v: unknown): v is HarnessId {
  return v === 'codebuff' || v === 'claude-code'
}

/**
 * Normalized turn callbacks. A harness streams through these; the engine folds
 * them into ordered parts and records spend (see ThreadEngine.runTurn).
 *  - onText      — a prose text delta (accumulated into the assistant message).
 *  - onReasoning — a thinking/reasoning delta (its own ordered part).
 *  - onEvent     — a non-text agent event: `tool_call` (toolName/input/toolCallId)
 *                  and a terminal `finish` (totalCost).
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
  /** Per-thread custom-tool deps (suggest_prompts / write_doc / browser_check). */
  toolDeps: ThreadToolDeps
  /** Opaque state this harness returned last turn (carries context/caching). */
  previousState?: unknown
  /** Aborts the in-flight turn when the user hits Stop. */
  abort: AbortController
}

export interface HarnessResult {
  /** Opaque state to thread back into the next turn (or undefined to reset). */
  state: unknown
}

export interface AgentHarness {
  readonly id: HarnessId
  runTurn(turn: HarnessTurn, cb: HarnessCallbacks): Promise<HarnessResult>
}
