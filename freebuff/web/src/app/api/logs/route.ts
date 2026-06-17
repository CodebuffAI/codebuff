import { env } from '@codebuff/common/env'
import { isLogBodyTooLarge, logIngestSchema } from '@codebuff/common/schemas/logs'
import { buildLogRows } from '@codebuff/common/util/log-ingest'
import {
  createFixedWindowRateLimiter,
  extractClientIp,
} from '@codebuff/common/util/rate-limit'
import { enqueueLogRow } from '@codebuff/logging'
import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

/**
 * POST /api/logs (freebuff-web) — same-origin, unauthenticated browser
 * ingest. Mirrors PostHog browser events into the Axiom logs dataset.
 *
 * Browser events are anonymous (no API key), so this endpoint applies a
 * lightweight per-IP rate limit to bound abuse/cost. Rows land with
 * source='browser', user_id=null (identity lives in the payload's PostHog
 * distinct id / $session_id). Requires AXIOM_API_TOKEN on this service; when
 * absent the sink disables gracefully. See docs/logging.md.
 */

// Per-instance fixed-window limiter (best-effort; not a distributed guarantee).
const rateLimiter = createFixedWindowRateLimiter({
  windowMs: 60_000,
  max: 60,
})

export async function POST(req: NextRequest) {
  const now = Date.now()

  // Reject oversized bodies before reading/parsing them (primary DoS guard for
  // this unauthenticated endpoint; the rate limiter below is best-effort).
  if (isLogBodyTooLarge(req.headers.get('content-length'))) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  if (rateLimiter.limited(extractClientIp(req.headers), now)) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
  }

  const parsed = logIngestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.format() },
      { status: 400 },
    )
  }

  const rows = buildLogRows({
    records: parsed.data.records,
    source: 'browser',
    service: 'freebuff-web',
    env: env.NEXT_PUBLIC_CB_ENVIRONMENT,
    userId: null,
    now: new Date(now),
  })
  for (const row of rows) {
    enqueueLogRow(row)
  }

  return NextResponse.json({ accepted: rows.length })
}
