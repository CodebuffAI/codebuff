/**
 * Models per agent harness.
 *
 *  - Freebuff (hosted) harness: any Freebuff model the user's access tier allows,
 *    picked per-thread (see agents/harness.ts + freebuff-session-manager.ts). The
 *    default is MiniMax M3 — smart, fast, multimodal, and unlimited — so a new tab
 *    can SEE attached images without burning the premium slot.
 *  - Claude Code harness: Opus 4.8 — runs through the user's locally-authenticated
 *    Claude Code (their Anthropic subscription), so it's premium-quality and not
 *    metered by us. See `agents/claude-code-harness.ts`.
 */
import { FREEBUFF_MINIMAX_M3_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

/** Default Freebuff model for the hosted agent when a thread hasn't picked one
 *  and the access tier is unknown. Equals MiniMax M3. */
export const DEFAULT_FREEBUFF_MODEL = FREEBUFF_MINIMAX_M3_MODEL_ID
/** Back-compat alias used as the default param in thread-agent/harness. */
export const FREEBUFF_MODEL = DEFAULT_FREEBUFF_MODEL
export const CLAUDE_CODE_MODEL = 'claude-opus-4-8'
