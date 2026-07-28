export const publisher = 'codebuff'

/**
 * The Opus-tier model shared by DEFAULT and MAX mode and every subagent they
 * spawn. Agent ids like `code-reviewer-opus` name the tier, not the generation,
 * so the generation lives here: bumping it is one edit instead of a dozen.
 *
 * Keeping these in sync by hand did not work — the 4.7 bump left stragglers
 * behind and the docs drifted two generations out of date.
 */
export const OPUS_MODEL = 'anthropic/claude-opus-5'

/**
 * The model behind Codebuff's paid LITE mode, shared by the orchestrator and
 * the reviewer it spawns. Lite trades some capability for speed and a far lower
 * per-token cost, so it runs a cheap frontier model instead of the Opus tier.
 *
 * This is not a Freebuff free-tier model: it costs real money, so it must stay
 * out of FREE_MODE_AGENT_MODELS.
 */
export const LITE_MODEL = 'openai/gpt-5.6-luna'
