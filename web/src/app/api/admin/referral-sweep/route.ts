import { timingSafeEqual } from 'crypto'

import { evaluatePendingReferrals } from '@codebuff/billing/referral-program'
import { env } from '@codebuff/internal/env'
import { NextResponse } from 'next/server'

import { logger } from '@/util/logger'

import type { NextRequest } from 'next/server'

/**
 * Referral-sweep endpoint, called on a schedule by the referral-sweep GitHub
 * Action. Re-evaluates pending referral rows across ALL programs (cli, web,
 * glm) and completes any that now pass their gate.
 *
 * This is the catch-up backstop for the live triggers (web token refresh /
 * first freebuff message of the day): without it, a pending 'glm' or 'web'
 * referral whose referred GitHub account only ages past the bar later — or
 * whose live evaluation was simply missed — would stay pending forever, so the
 * referrer never gets their reward. Idempotent: already-completed referrals are
 * skipped, and GitHub facts are cached, so re-running is cheap.
 *
 * Auth: static bearer token from REFERRAL_SWEEP_SECRET. This lets CI call the
 * endpoint without a NextAuth session, and keeps prod DATABASE_URL out of
 * GitHub secrets (mirrors /api/admin/bot-sweep).
 */
export async function POST(req: NextRequest) {
  const secret = env.REFERRAL_SWEEP_SECRET
  if (!secret) {
    // Warn (not silent): the cron is wired but the secret was never set, so the
    // referral backstop is effectively off and rewards can silently stick.
    logger.warn(
      {},
      'referral-sweep invoked but REFERRAL_SWEEP_SECRET is not configured; backstop is disabled',
    )
    return NextResponse.json(
      { error: 'referral-sweep not configured (REFERRAL_SWEEP_SECRET missing)' },
      { status: 503 },
    )
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const expected = `Bearer ${secret}`
  const a = Buffer.from(authHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    // cacheOnly: the sweep must never call GitHub. Aging-in (too_new →
    // qualified) is deterministic from the cached account_created_at, so the
    // whole pending population can be re-checked in one fast, network-free
    // pass. First-time/expired-token fetches are left to the user's own live
    // session. Without this the endpoint did hundreds of GitHub round-trips
    // (incl. slow 401s) and timed out past the cron's 120s budget.
    const result = await evaluatePendingReferrals({
      logger,
      limit: 500,
      cacheOnly: true,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    logger.error({ error }, 'referral-sweep failed')
    return NextResponse.json({ error: 'sweep failed' }, { status: 500 })
  }
}
