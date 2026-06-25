import { getReferralInfo } from '@codebuff/common/types/freebuff-session'

import type { FreebuffSessionResponse } from '../types/freebuff-session'
import type { FreebuffReferralInfo } from '@codebuff/common/types/freebuff-session'

/**
 * Process-wide cache of the most recent referral block the server sent.
 *
 * The server only attaches `referral` to `none` (landing) responses — once the
 * user joins (queued/active) or ends a session (ended) it's dropped from the
 * payload. That breaks the return-to-landing flow: after a session ends the
 * slot DELETE leaves an `ended` row, so the landing GET sees `ended` (no
 * referral) until that row is swept, which would otherwise blank the GLM
 * referral banner for the whole visit. Caching the last-known block lets the
 * picker re-render it immediately; a later clean `none` GET refreshes it.
 */
let lastKnownReferral: FreebuffReferralInfo | undefined

/** Remember the referral block whenever a response includes one, so it can be
 *  carried across the join → end → return-to-landing round-trip. No-op for
 *  responses without a referral block (it keeps the prior value). */
export function rememberReferral(session: FreebuffSessionResponse | null): void {
  const referral = getReferralInfo(session)
  if (referral) lastKnownReferral = referral
}

/** The last referral block seen, or undefined if none has been seen yet. */
export function getCachedReferral(): FreebuffReferralInfo | undefined {
  return lastKnownReferral
}

/** Test-only: clear the cache so cases start from a known-empty state. */
export function __resetReferralCacheForTest(): void {
  lastKnownReferral = undefined
}
