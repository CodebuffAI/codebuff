import { SOLAR_PRICE_CHANGES } from './freebuff-solar-promo'

/**
 * Spans in which a model is free to the user, and whose provider cost must
 * therefore not be charged against that user's daily dollar allowance.
 *
 * ## Why this exists
 *
 * A promotion that makes a row free, while its spend still consumes the one
 * budget deciding whether the account can start anything at all, is an offer
 * working against itself: the user is handed a model at no price and then
 * locked out of the rest of the catalog for the day by using it. Reported by
 * users on Solar Pro 4's 2026-09-05 weekend, which is what this was built for.
 *
 * ## Derived, not written down
 *
 * The windows come from the price schedule the offer is actually made from
 * (`SOLAR_PRICE_CHANGES`), so the span that is free to the user and the span
 * that is exempt from their allowance cannot drift apart. Hand-copying the
 * dates would put the two facts in two files and guarantee that a future
 * extension moves one and not the other.
 *
 * A window opens at every transition to price 0 and closes at the next
 * transition to any other price. An offer left open-ended closes at the end of
 * time, which is deliberate: while the price is zero the exemption holds.
 *
 * ## What it must not be used for
 *
 * ONLY the per-user allowance. `message.cost` is untouched, because we really
 * do pay for these tokens — the ledger, the dashboards and the provider
 * accounting all have to keep saying so. This decides whose budget it comes
 * out of, not whether it was spent.
 */
export interface FreePromotionSpendWindow {
  readonly modelId: string
  /** Inclusive ISO instant the model became free. */
  readonly from: string
  /** Exclusive ISO instant it stopped being free. */
  readonly to: string
}

/** Far enough out to mean "still running", and a real date so the SQL
 *  comparison stays a plain range check rather than a null branch. */
const OPEN_ENDED = '2099-01-01T00:00:00.000Z'

function windowsFromPriceSchedule(
  changes: ReadonlyArray<{
    readonly at: string
    readonly modelId: string
    readonly price: number
  }>,
): FreePromotionSpendWindow[] {
  const byModel = new Map<string, typeof changes>()
  for (const change of changes) {
    byModel.set(change.modelId, [
      ...(byModel.get(change.modelId) ?? []),
      change,
    ])
  }
  const windows: FreePromotionSpendWindow[] = []
  for (const [modelId, entries] of byModel) {
    const ordered = [...entries].sort(
      (a, b) => Date.parse(a.at) - Date.parse(b.at),
    )
    ordered.forEach((change, index) => {
      if (change.price !== 0) return
      // The next transition at a DIFFERENT price closes it. A second free
      // transition (a re-announcement, or an extension) extends rather than
      // splits, so a window is never cut short by a restatement of itself.
      const end = ordered
        .slice(index + 1)
        .find((later) => later.price !== 0)
      const from = new Date(Date.parse(change.at)).toISOString()
      const to = end ? new Date(Date.parse(end.at)).toISOString() : OPEN_ENDED
      // Merge into the previous window when this free transition sits inside
      // one already open, so the restatement case emits one span.
      const previous = windows[windows.length - 1]
      if (
        previous &&
        previous.modelId === modelId &&
        Date.parse(from) <= Date.parse(previous.to)
      ) {
        windows[windows.length - 1] = {
          modelId,
          from: previous.from,
          to: Date.parse(to) > Date.parse(previous.to) ? to : previous.to,
        }
        return
      }
      windows.push({ modelId, from, to })
    })
  }
  return windows
}

export const FREEBUFF_FREE_PROMOTION_SPEND_WINDOWS: readonly FreePromotionSpendWindow[] =
  Object.freeze(windowsFromPriceSchedule(SOLAR_PRICE_CHANGES))

/** Whether `modelId` was free to the user at `at` — the same question the SQL
 *  predicate asks, for callers that have a row rather than a query. */
export function isFreePromotionSpendAt(
  modelId: string,
  at: number | Date,
): boolean {
  const t = typeof at === 'number' ? at : at.getTime()
  return FREEBUFF_FREE_PROMOTION_SPEND_WINDOWS.some(
    (window) =>
      window.modelId === modelId &&
      t >= Date.parse(window.from) &&
      t < Date.parse(window.to),
  )
}
