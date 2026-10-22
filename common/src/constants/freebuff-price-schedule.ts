/**
 * One dated repricing (product, 2026-10-22): from `FREEBUFF_REPRICE_AT`,
 * new sessions on these rows cost the prices below; sessions already admitted
 * keep the price they were admitted at.
 *
 *   Gemini 4 Argon             100 -> 250  (its promotional price ends)
 *   GPT-6.1 Sol                250 -> 200
 *   Claude Haiku 5.5 (full)     75 -> 100
 *
 * Until then the rows carry the pills that announce it (Argon's "Ending
 * soon", the full Haiku row's "Price change"), and they drop at the same
 * instant. Compiled rows read the price through `freebucksSessionPrice`; the
 * catalog-only Haiku row through its catalog entry, rebuilt with the time on
 * every catalog refresh. A leaf module: the price map and the catalog both
 * read it.
 */
export const FREEBUFF_REPRICE_AT = Date.parse('2026-10-23T00:00:00Z')

export const FREEBUFF_SCHEDULED_PRICES: Readonly<Record<string, number>> =
  Object.freeze({
    'google/gemini-4-argon': 250,
    'openai/gpt-6.1-sol': 200,
    'fbc/claude-haiku-5.5': 100,
  })

/** The scheduled price of a row at `now`, once the repricing has happened. */
export function scheduledFreebucksPrice(
  modelId: string,
  now: number = Date.now(),
): number | undefined {
  return now >= FREEBUFF_REPRICE_AT
    ? FREEBUFF_SCHEDULED_PRICES[modelId]
    : undefined
}

/** Whether the pills announcing the repricing still show at `now`. */
export function freebuffRepriceAnnounced(now: number = Date.now()): boolean {
  return now < FREEBUFF_REPRICE_AT
}
