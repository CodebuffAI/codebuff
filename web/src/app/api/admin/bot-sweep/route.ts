import { timingSafeEqual } from 'crypto'

import { env } from '@codebuff/internal/env'
import { sendBasicEmail } from '@codebuff/internal/loops/client'
import { NextResponse } from 'next/server'

import {
  formatSweepReport,
  identifyBotSuspects,
} from '@/server/free-session/abuse-detection'
import { logger } from '@/util/logger'

import type { NextRequest } from 'next/server'

const REPORT_RECIPIENT = 'james@codebuff.com'

/**
 * Hourly bot-sweep endpoint called by the GitHub Actions workflow.
 *
 * Auth: static bearer token from BOT_SWEEP_SECRET. This lets CI call the
 * endpoint without a NextAuth session, and keeps prod DATABASE_URL out of
 * GitHub secrets.
 *
 * This is a DRY RUN — it reports suspects via email and never bans anyone.
 */
export async function POST(req: NextRequest) {
  const secret = env.BOT_SWEEP_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'bot-sweep not configured (BOT_SWEEP_SECRET missing)' },
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
    const report = await identifyBotSuspects({ logger })
    const { subject, message } = formatSweepReport(report)

    const emailResult = await sendBasicEmail({
      email: REPORT_RECIPIENT,
      data: { subject, message },
      logger,
    })

    if (!emailResult.success) {
      logger.error(
        { error: emailResult.error },
        'Failed to email bot-sweep report',
      )
    }

    return NextResponse.json({
      ok: true,
      totalSessions: report.totalSessions,
      suspectCount: report.suspects.length,
      highTierCount: report.suspects.filter((s) => s.tier === 'high').length,
      emailSent: emailResult.success,
    })
  } catch (error) {
    logger.error({ error }, 'bot-sweep failed')
    return NextResponse.json({ error: 'sweep failed' }, { status: 500 })
  }
}
