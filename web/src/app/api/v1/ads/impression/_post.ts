import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { createHash } from 'crypto'
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

// Rate limiting: max impressions per user per hour
const MAX_IMPRESSIONS_PER_HOUR = 60

// In-memory rate limiter (resets on server restart, which is acceptable for this use case)
const impressionRateLimiter = new Map<string, { count: number; resetAt: number }>()

/**
 * Check and update rate limit for a user.
 * Returns true if the request is allowed, false if rate limited.
 */
function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const hourMs = 60 * 60 * 1000
  
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
  impUrl: z.string().url(),
  payout: z.number().optional(),
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
  let payout: number | undefined
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
    payout = parsed.data.payout
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
    authErrorEvent: AnalyticsEvent.USAGE_API_AUTH_ERROR, // Reuse existing event
  })
  if (!authed.ok) return authed.response

  const { userId, logger } = authed.data

  // Check rate limit before processing
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

  // Generate deterministic operation ID for deduplication
  // Same user + same impUrl = same operationId, preventing duplicate credits
  const operationId = generateImpressionOperationId(userId, impUrl)

  // Fire the impression pixel to Gravity
  try {
    await fetch(impUrl)
    logger.info({ impUrl }, '[ads] Fired impression pixel')
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

  // Grant credits if there's a payout
  let creditsGranted = 0
  if (payout && payout > 0) {
    // Calculate user's share (75%) and convert to credits (round down)
    // Payout is in dollars, credits are 1:1 with cents, so multiply by 100
    const userShareDollars = payout * AD_REVENUE_SHARE
    const creditsToGrant = Math.floor(userShareDollars * 100)

    if (creditsToGrant > 0) {
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
        // Don't fail the request - impression was still recorded
      }
    }
  }

  return NextResponse.json({
    success: true,
    creditsGranted,
  })
}
