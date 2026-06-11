import { query } from './_generated/server'
import {
  getLimitedSessionStatus,
  getWebAccessTier,
} from './coding_agent/shared/geoAccess'
import { getAuthUser } from './users'

import type { FreebuffWebAccessTier } from '@codebuff/common/constants/freebuff-models'

export type WebAccessStatus = {
  accessTier: FreebuffWebAccessTier
  /** Limited tier only; null means no session quota applies. */
  sessionsRemaining: number | null
  activeSessionExpiresAt: number | null
  /** Ms until the limited-tier quota resets (midnight Pacific). */
  resetsInMs: number | null
}

/**
 * Geo-derived access status for the current user, for UI display (model
 * selector restrictions, region banner, sessions-left counter). Mirrors the
 * enforcement in runTriggerGates: god-role users always report full access.
 */
export const getWebAccessStatus = query({
  args: {},
  handler: async (ctx): Promise<WebAccessStatus | null> => {
    const user = await getAuthUser(ctx)
    if (!user) return null

    const accessTier: FreebuffWebAccessTier =
      user.role === 'god' ? 'full' : await getWebAccessTier(ctx)

    if (accessTier !== 'limited') {
      return {
        accessTier,
        sessionsRemaining: null,
        activeSessionExpiresAt: null,
        resetsInMs: null,
      }
    }

    const status = await getLimitedSessionStatus(ctx, user._id)
    return {
      accessTier,
      sessionsRemaining: status.sessionsRemaining,
      activeSessionExpiresAt: status.activeSessionExpiresAt,
      resetsInMs: status.resetsInMs,
    }
  },
})
