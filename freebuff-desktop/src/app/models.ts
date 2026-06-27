/**
 * Models per agent harness.
 *
 *  - Codebuff harness: DeepSeek v4 Flash — uniform and cheap, which is what makes
 *    the "machine that keeps going" viable in a free product.
 *  - Claude Code harness: Opus 4.8 — runs through the user's locally-authenticated
 *    Claude Code (their Anthropic subscription), so it's premium-quality and not
 *    metered by us. See `agents/claude-code-harness.ts`.
 */
export const FREEBUFF_MODEL = 'deepseek/deepseek-v4-flash'
export const CLAUDE_CODE_MODEL = 'claude-opus-4-8'
