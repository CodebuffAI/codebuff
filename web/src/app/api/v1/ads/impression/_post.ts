import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { createHash } from 'crypto'
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
import type { processAndGrantCredit as ProcessAndGrantCreditFn } from '@codebuff/billing/grant-credits'
import type { NextRequest } from 'next/server'

// Revenue share: users get 75% of payout as credits
const AD_REVENUE_SHARE = 0.75
const MINIMUM_CREDITS_GRANTED = 2

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

/**
 * Generate a deterministic operation ID for deduplication.
 * Same user + same impUrl = same operationId, preventing duplicate credits.
 */
function generateImpressionOperationId(userId: string, impUrl: string): string {
  const hash = createHash('sha256')
    .update(`${userId}:${impUrl}`)
    .digest('hex')
    .slice(0, 16)
  return `ad-imp-${hash}`
}

const bodySchema = z.object({
  // Only impUrl needed - we look up the ad data from our database
  impUrl: z.url(),
  // Mode to determine if credits should be granted (FREE mode gets no credits)
  mode: z.string().optional(),
})

export async function postAdImpression(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  loggerWithContext: LoggerWithContextFn
  trackEvent: TrackEventFn
  processAndGrantCredit: typeof ProcessAndGrantCreditFn
  fetch: typeof globalThis.fetch
}) {
  const {
    req,
    getUserInfoFromApiKey,
    loggerWithContext,
    trackEvent,
    processAndGrantCredit,
    fetch,
  } = params
  const baseLogger = params.logger

  // Parse and validate request body
  let impUrl: string
  let mode: string | undefined
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
    mode = parsed.data.mode
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

  // Get payout from the trusted database record
  const payout = parseFloat(adRecord.payout)

  // Generate deterministic operation ID for deduplication
  const operationId = generateImpressionOperationId(userId, impUrl)

  // Fire the impression pixel to Gravity
  try {
    await fetch(impUrl)
    logger.info({ userId, operationId, impUrl }, '[ads] Fired impression pixel')
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
    // Continue anyway - we still want to grant credits
  }

  // Calculate credits to grant (75% of payout, converted to credits)
  // Payout is in dollars, credits are 1:1 with cents, so multiply by 100
  const userShareDollars = payout * AD_REVENUE_SHARE
  const creditsToGrant = Math.max(
    MINIMUM_CREDITS_GRANTED + Math.floor(3 * Math.random()),
    Math.floor(userShareDollars * 100),
  )

  let creditsGranted = 0
  // FREE mode should not grant any credits
  if (mode !== 'FREE' && creditsToGrant > 0) {
    try {
      await processAndGrantCredit({
        userId,
        amount: creditsToGrant,
        type: 'ad',
        description: `Ad impression credit (${(userShareDollars * 100).toFixed(1)}¢ from $${payout.toFixed(4)} payout)`,
        expiresAt: null, // Ad credits don't expire
        operationId,
        logger,
      })

      creditsGranted = creditsToGrant

      logger.info(
        {
          userId,
          payout,
          creditsGranted,
          operationId,
        },
        '[ads] Granted ad impression credits',
      )

      trackEvent({
        event: AnalyticsEvent.CREDIT_GRANT,
        userId,
        properties: {
          type: 'ad',
          amount: creditsGranted,
          payout,
        },
        logger,
      })
    } catch (error) {
      logger.error(
        {
          userId,
          payout,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : error,
        },
        '[ads] Failed to grant ad impression credits',
      )
      // Don't fail the request - we still want to update the impression record
    }
  }

  // Update the ad_impression record with impression details (for ALL modes)
  try {
    await db
      .update(schema.adImpression)
      .set({
        impression_fired_at: new Date(),
        credits_granted: creditsGranted,
        grant_operation_id: creditsGranted > 0 ? operationId : null,
      })
      .where(eq(schema.adImpression.id, adRecord.id))

    logger.info(
      { userId, impUrl, creditsGranted, creditsToGrant },
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
