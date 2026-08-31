import { clamp } from './math'

/**
 * Compact token count for the status bar: 982 → "982", 14_231 → "14.2K",
 * 1_250_000 → "1.3M". One decimal, trailing ".0" dropped, so the readout
 * stays narrow in an 80-column terminal.
 */
export function formatTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens < 0) {
    return '0'
  }
  if (tokens < 1000) {
    return String(Math.round(tokens))
  }
  const format = (value: number, suffix: string): string => {
    const rounded = Math.round(value * 10) / 10
    const text = Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(1)
    return `${text}${suffix}`
  }
  // Branch on the ROUNDED value: 999,960 rounds to 1000.0K and must render
  // as 1M, not "1000K".
  if (Math.round(tokens / 100) / 10 < 1000) {
    return format(tokens / 1000, 'K')
  }
  return format(tokens / 1_000_000, 'M')
}

/**
 * "14.2K (7%)" — context occupancy against the model's context window. The
 * percentage is rounded but never shown as 0% while tokens are non-zero, so a
 * fresh session reads "1%" rather than implying an empty context is tracked
 * at all. Returns null when there is nothing meaningful to show.
 */
export function formatContextUsage(
  tokens: number,
  contextWindow: number,
): string | null {
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return null
  }
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) {
    return formatTokenCount(tokens)
  }
  const percent = clamp(Math.round((tokens / contextWindow) * 100), 1, 100)
  return `${formatTokenCount(tokens)} (${percent}%)`
}
