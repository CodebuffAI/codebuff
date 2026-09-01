/**
 * ONE reading of "how close is this account to a wall", shared by the Web and
 * Desktop nudges (2026-09-01).
 *
 * The nudge is a product decision — which pool warns, at what fraction, with
 * what words — and two clients each deciding it is how the same account gets
 * warned on one surface and walled without warning on the other. Each surface
 * owns its own LAYOUT (a fixed card on Web, a store-driven card on Desktop);
 * this owns the verdict.
 *
 * Subscribers nudge on the PLAN's binding window — `blockedBy` is the
 * server's own verdict on which one binds. Free accounts nudge on the
 * per-model pool rows, any of which crossing the threshold is worth a word.
 */
import type {
  FreebuffSessionRateLimit,
  FreebuffSubscriptionInfo,
} from '../types/freebuff-session'

export const FREEBUFF_NEAR_LIMIT_FRACTION = 0.8

export type FreebuffLimitNudgeState =
  | { kind: 'near'; label: string; used: number; limit: number }
  | { kind: 'wall'; label: string }

export function resolveFreebuffLimitNudge(params: {
  subscription?: Pick<FreebuffSubscriptionInfo, 'tierId' | 'usage' | 'blockedBy'> | null
  rateLimits?: Record<string, Pick<FreebuffSessionRateLimit, 'recentCount' | 'limit' | 'poolLabel'> | undefined> | null
}): FreebuffLimitNudgeState | null {
  const subscription = params.subscription
  if (subscription?.tierId && subscription.usage) {
    if (subscription.blockedBy) {
      return { kind: 'wall', label: 'your plan sessions' }
    }
    const u = subscription.usage
    const windows: Array<[string, number, number]> = [
      ['daily plan sessions', u.dayUsed, u.dayLimit],
      ['weekly plan sessions', u.fiveDayUsed, u.fiveDayLimit],
      ['monthly plan sessions', u.monthUsed, u.monthLimit],
    ]
    for (const [label, used, limit] of windows) {
      if (
        limit > 0 &&
        used / limit >= FREEBUFF_NEAR_LIMIT_FRACTION &&
        used < limit
      ) {
        return { kind: 'near', label, used, limit }
      }
    }
    return null
  }
  const rateLimits = params.rateLimits
  if (!rateLimits) return null
  let best: FreebuffLimitNudgeState | null = null
  for (const row of Object.values(rateLimits)) {
    if (!row || !(row.limit > 0)) continue
    if (row.recentCount >= row.limit) {
      return { kind: 'wall', label: 'your free sessions' }
    }
    if (row.recentCount / row.limit >= FREEBUFF_NEAR_LIMIT_FRACTION && !best) {
      best = {
        kind: 'near',
        label: row.poolLabel
          ? `${row.poolLabel.toLowerCase()} sessions`
          : 'your free sessions',
        used: row.recentCount,
        limit: row.limit,
      }
    }
  }
  return best
}
