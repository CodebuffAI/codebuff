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
