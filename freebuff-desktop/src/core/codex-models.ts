/**
 * Models the Codex harness can run. Lives in core/ (no external imports) so both
 * the server (thread-engine/server routes) and the renderer (the combined
 * agent+model picker) share one catalog — mirroring core/claude-models.ts.
 *
 * All of these run through the user's locally-authenticated Codex CLI (their
 * ChatGPT/OpenAI subscription via `codex login`), so there's no tier gating on
 * our side. See agents/codex-harness.ts.
 */
export interface CodexModelOption {
  id: string
  /** Human label, e.g. "GPT-5.5". */
  label: string
  /** One-line description shown in the picker. */
  tagline: string
}

// Note: the `-codex` model variants (e.g. gpt-5.5-codex) are rejected by the
// backend when Codex runs on a ChatGPT-account login ("not supported when using
// Codex with a ChatGPT account"), which is exactly this harness's auth path — so
// the catalog lists the plain models a subscription login can actually run.
export const CODEX_MODEL_OPTIONS: readonly CodexModelOption[] = [
  {
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    tagline: "OpenAI's flagship coding model",
  },
]

/** Default when a thread hasn't picked a Codex model. */
export const DEFAULT_CODEX_MODEL = 'gpt-5.5'

export function isCodexModelId(v: unknown): v is string {
  return typeof v === 'string' && CODEX_MODEL_OPTIONS.some((m) => m.id === v)
}
