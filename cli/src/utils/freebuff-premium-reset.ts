import { FREEBUFF_PREMIUM_SESSION_RESET_TIMEZONE } from '@codebuff/common/constants/freebuff-models'
import { getZonedDayBounds } from '@codebuff/common/util/zoned-time'

import type { FreebuffSessionRateLimitByModel } from '@codebuff/common/types/freebuff-session'

export function getFreebuffPremiumResetAt(params: {
  rateLimitsByModel?: FreebuffSessionRateLimitByModel
  nowMs: number
}): Date {
  const { rateLimitsByModel, nowMs } = params
  const serverResetAt = rateLimitsByModel
    ? Object.values(rateLimitsByModel)[0]?.resetAt
    : undefined
  const parsedServerResetAt = serverResetAt ? new Date(serverResetAt) : null

  if (
    parsedServerResetAt &&
    Number.isFinite(parsedServerResetAt.getTime())
  ) {
    return parsedServerResetAt
  }

  return getZonedDayBounds(
    new Date(nowMs),
    FREEBUFF_PREMIUM_SESSION_RESET_TIMEZONE,
  ).resetsAt
}

/**
 * Human "resets in …" countdown. Daily pools stop at hours (`withDays` off);
 * the weekly GLM pool sets `withDays` so a multi-day window reads as "2d 5h"
 * instead of a 100-hour figure.
 */
export function formatFreebuffPremiumResetCountdown(
  resetAt: Date,
  nowMs: number,
  { withDays = false }: { withDays?: boolean } = {},
): string {
  const diffMs = resetAt.getTime() - nowMs
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 'now'

  const totalMinutes = Math.max(1, Math.floor(diffMs / 60_000))
  if (withDays) {
    const days = Math.floor(totalMinutes / (60 * 24))
    if (days > 0) {
      const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
      return hours === 0 ? `${days}d` : `${days}d ${hours}h`
    }
  }
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) return `${minutes}m`
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}
