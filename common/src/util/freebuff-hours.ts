/**
 * Hours: the unit users see for Freebucks (2026-10-14, product).
 *
 * One hour is 5 Freebucks, the price of an hour of MiMo Slow, the
 * cheapest metered row. Everything underneath stays in Freebucks: the ledger,
 * the prices, admission and refunds. Only display converts,
 * which is why a client released before this keeps showing Freebucks against
 * the same server: the wire still carries Freebucks.
 *
 * A model's price reads as a multiplier of that hour ("2x" is a 10 Freebuck
 * row: an hour on it uses two hours of balance). A free row and a 1x row carry
 * no label.
 */
export const FREEBUCKS_PER_HOUR = 5

/** The label every balance and allowance uses in place of "Freebucks". */
export const HOURS_LABEL = 'Hours'

/** Freebucks as hours, unrounded. */
export function freebucksToHours(freebucks: number): number {
  return freebucks / FREEBUCKS_PER_HOUR
}

/**
 * Freebucks as an hour count for display: WHOLE hours, rounded down, so a
 * balance never reads as more than it buys and never shows a fraction of an
 * hour (product, 2026-10-15: "7.4 hours" confused people). Never negative.
 * `1,234` style grouping for large counts.
 */
export function formatHours(freebucks: number): string {
  return Math.floor(
    Math.max(0, freebucks) / FREEBUCKS_PER_HOUR + 1e-9,
  ).toLocaleString('en-US')
}

/** `formatHours` with its unit: "1 hour", "50 hours". */
export function formatHoursWithUnit(freebucks: number): string {
  const text = formatHours(freebucks)
  return `${text} ${text === '1' ? 'hour' : 'hours'}`
}

/** The short form for tight rows: "50 hrs", "1 hr". */
export function formatHoursShort(freebucks: number): string {
  const text = formatHours(freebucks)
  return `${text} ${text === '1' ? 'hr' : 'hrs'}`
}

/**
 * A model's usage multiplier label from its hourly price in Freebucks: "2x"
 * for 10, "3x" for 15, "0.4x" for 2. Null for a free row (the Unlimited
 * section) and for a 1x row (MiMo Slow), which carry no label, and for an
 * unpriced one.
 */
export function freebuffModelMultiplierLabel(
  priceFreebucks: number | null | undefined,
): string | null {
  if (
    priceFreebucks === null ||
    priceFreebucks === undefined ||
    !Number.isFinite(priceFreebucks) ||
    priceFreebucks <= 0 ||
    priceFreebucks === FREEBUCKS_PER_HOUR
  )
    return null
  const multiplier = Math.round((priceFreebucks / FREEBUCKS_PER_HOUR) * 10) / 10
  return `${multiplier.toLocaleString('en-US', { maximumFractionDigits: 1 })}x`
}

/**
 * A price as multiplier text for sentences, where an empty label would leave
 * a hole: `freebuffModelMultiplierLabel`, else "1x" for a 1x row and "free"
 * for a free one.
 */
export function freebuffMultiplierText(priceFreebucks: number): string {
  return (
    freebuffModelMultiplierLabel(priceFreebucks) ??
    (priceFreebucks > 0 ? '1x' : 'free')
  )
}
