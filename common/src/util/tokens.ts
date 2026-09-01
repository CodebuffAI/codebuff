/**
 * Token totals and their rendering — the single definition for every surface
 * that reports how many tokens we moved.
 *
 * Shared because this figure is reported on more than one surface and once had
 * two variants that disagreed.
 */

const NUMBER_FORMATTER = new Intl.NumberFormat('en-US')

/**
 * Prompt tokens plus completions.
 *
 * `inputTokens` is the provider's `prompt_tokens`, which ALREADY INCLUDES the
 * cached prefix (`input_tokens >= cache_read_input_tokens` holds on every
 * `message` row). Adding cache reads again double-counts the cached prefix —
 * the bug this replaced on the account usage page. On a cache-heavy workload
 * that roughly doubles the reported total.
 */
export function totalTokens(row: {
  inputTokens: number
  outputTokens: number
}): number {
  return row.inputTokens + row.outputTokens
}

/**
 * Prompt tokens the provider actually had to prefill.
 *
 * The honest companion to {@link totalTokens}: on a cache-heavy workload the
 * gross figure is many times the compute actually bought, so show this beside
 * it. Clamped at zero for providers that over-report cache reads.
 */
export function freshInputTokens(row: {
  inputTokens: number
  cacheReadTokens: number
}): number {
  return Math.max(0, row.inputTokens - row.cacheReadTokens)
}

/**
 * Abbreviated token counts.
 *
 * Exact below 10,000, where a reader can act on the digits; two decimals from
 * B up, which is where aggregate figures live. The T tier is required, not
 * decorative: a busy window otherwise renders as "5949.52B".
 */
export function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value < 10_000) return NUMBER_FORMATTER.format(Math.round(value))
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}K`
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value < 1_000_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
  return `${(value / 1_000_000_000_000).toFixed(2)}T`
}
