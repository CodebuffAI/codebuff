import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUserFromApiKey } from '../../_helpers'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

// Rate limiting: max impressions per user per hour
const MAX_IMPRESSIONS_PER_HOUR = 60

// In-memory rate limiter (resets on server restart, which is acceptable for this use case)
const impressionRateLimiter = new Map<
  string,
  { count: number; resetAt: number }
>()

/**
 * Clean up expired entries from the rate limiter to prevent memory leaks.
 * Called periodically during rate limit checks.
 */
function cleanupExpiredEntries(): void {
  const now = Date.now()
  for (const [userId, limit] of impressionRateLimiter) {
    if (now >= limit.resetAt) {
      impressionRateLimiter.delete(userId)
    }
  }
}

// Track last cleanup time to avoid cleaning up on every request
let lastCleanupTime = 0
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // Clean up every 5 minutes

/**
 * Check and update rate limit for a user.
 * Returns true if the request is allowed, false if rate limited.
 */
function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const hourMs = 60 * 60 * 1000

  // Periodically clean up expired entries to prevent memory leak
  if (now - lastCleanupTime > CLEANUP_INTERVAL_MS) {
    cleanupExpiredEntries()
    lastCleanupTime = now
  }

  const userLimit = impressionRateLimiter.get(userId)

  if (!userLimit || now >= userLimit.resetAt) {
    // Reset or initialize the counter
    impressionRateLimiter.set(userId, { count: 1, resetAt: now + hourMs })
    return true
  }

  if (userLimit.count >= MAX_IMPRESSIONS_PER_HOUR) {
    return false
  }

  userLimit.count++
  return true
}

const bodySchema = z.object({
  impUrl: z.url(),
  mode: z.string().optional(),
})

export async function postAdImpression(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  loggerWithContext: LoggerWithContextFn
  trackEvent: TrackEventFn
  fetch: typeof globalThis.fetch
}) {
  const {
    req,
    getUserInfoFromApiKey,
    loggerWithContext,
    trackEvent,
    fetch,
  } = params
  const baseLogger = params.logger

  // Parse and validate request body
  let impUrl: string
  try {
    const json = await req.json()
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.format() },
        { status: 400 },
      )
    }
    impUrl = parsed.data.impUrl
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 },
    )
  }

  const authed = await requireUserFromApiKey({
    req,
    getUserInfoFromApiKey,
    logger: baseLogger,
    loggerWithContext,
    trackEvent,
    authErrorEvent: AnalyticsEvent.USAGE_API_AUTH_ERROR,
  })
  if (!authed.ok) return authed.response

  const { userId, logger } = authed.data

  // Look up the ad from our database using the impUrl
  // This ensures we use server-side trusted data, not client-provided data
  const adRecord = await db.query.adImpression.findFirst({
    where: eq(schema.adImpression.imp_url, impUrl),
  })

  if (!adRecord) {
    logger.warn(
      { userId, impUrl },
      '[ads] Ad impression not found in database - was it served through our API?',
    )
    return NextResponse.json(
      { success: false, error: 'Ad not found', creditsGranted: 0 },
      { status: 404 },
    )
  }

  // Verify the ad belongs to this user
  if (adRecord.user_id !== userId) {
    logger.warn(
      { userId, adUserId: adRecord.user_id, impUrl },
      '[ads] User attempting to claim impression for ad served to different user',
    )
    return NextResponse.json(
      { success: false, error: 'Ad not found', creditsGranted: 0 },
      { status: 404 },
    )
  }

  // Check if impression was already fired (before rate limiting to not penalize duplicates)
  if (adRecord.impression_fired_at) {
    logger.debug(
      { userId, impUrl },
      '[ads] Impression already recorded for this ad',
    )
    return NextResponse.json({
      success: true,
      creditsGranted: adRecord.credits_granted,
      alreadyRecorded: true,
    })
  }

  // Check rate limit (after duplicate check so duplicates don't consume quota)
  if (!checkRateLimit(userId)) {
    logger.warn(
      { userId, maxPerHour: MAX_IMPRESSIONS_PER_HOUR },
      '[ads] Rate limited ad impression request',
    )
    return NextResponse.json(
      { success: false, error: 'Rate limited', creditsGranted: 0 },
      { status: 429 },
    )
  }

  // Fire the impression pixel to Gravity
  try {
    await fetch(impUrl)
    logger.info({ userId, impUrl }, '[ads] Fired impression pixel')
  } catch (error) {
    logger.warn(
      {
        impUrl,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : error,
      },
      '[ads] Failed to fire impression pixel',
    )
    // Continue anyway - we still want to record the impression
  }

  // No credits granted for ad impressions
  const creditsGranted = 0

  // Update the ad_impression record with impression details (for ALL modes)
  try {
    await db
      .update(schema.adImpression)
      .set({
        impression_fired_at: new Date(),
        credits_granted: 0,
        grant_operation_id: null,
      })
      .where(eq(schema.adImpression.id, adRecord.id))

    logger.info(
      { userId, impUrl },
      '[ads] Updated ad impression record',
    )
  } catch (error) {
    logger.error(
      {
        userId,
        impUrl,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : error,
      },
      '[ads] Failed to update ad impression record',
    )
  }

  return NextResponse.json({
    success: true,
    creditsGranted,
  })
}
