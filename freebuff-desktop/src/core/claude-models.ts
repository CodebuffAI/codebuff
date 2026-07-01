/**
 * Models the Claude Code harness can run. Lives in core/ (no external imports)
 * so both the server (thread-engine/server routes) and the renderer (the
 * combined agent+model picker) share one catalog — the Freebuff models come
 * from @codebuff/common, which the renderer deliberately doesn't import.
 *
 * All of these run through the user's locally-authenticated Claude Code
 * (their Anthropic subscription), so there's no tier gating on our side.
 */
export interface ClaudeModelOption {
  id: string
  /** Human label, e.g. "Opus 4.8". */
  label: string
  /** One-line description shown in the picker. */
  tagline: string
}

export const CLAUDE_MODEL_OPTIONS: readonly ClaudeModelOption[] = [
  {
    id: 'claude-fable-5',
    label: 'Fable 5',
    tagline: "Anthropic's most intelligent model",
  },
  {
    id: 'claude-opus-4-8',
    label: 'Opus 4.8',
    tagline: 'Powerful all-round coding model',
  },
  {
    id: 'claude-sonnet-5',
    label: 'Sonnet 5',
    tagline: 'Fast, capable everyday model',
  },
]

/** Default when a thread hasn't picked a Claude model. */
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-8'

export function isClaudeModelId(v: unknown): v is string {
  return typeof v === 'string' && CLAUDE_MODEL_OPTIONS.some((m) => m.id === v)
}
