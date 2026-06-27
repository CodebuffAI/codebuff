/**
 * Models per agent harness.
 *
 *  - Codebuff harness: MiniMax M3 — cheap, fast, and multimodal, so the free agent
 *    can actually SEE attached images (the desktop sends them as message content;
 *    see agents/codebuff-harness.ts + app/attachments.ts).
 *  - Claude Code harness: Opus 4.8 — runs through the user's locally-authenticated
 *    Claude Code (their Anthropic subscription), so it's premium-quality and not
 *    metered by us. See `agents/claude-code-harness.ts`.
 */
export const FREEBUFF_MODEL = 'minimax/minimax-m3'
export const CLAUDE_CODE_MODEL = 'claude-opus-4-8'
