import { env } from '@codebuff/common/env'
import { isLogBodyTooLarge, logIngestSchema } from '@codebuff/common/schemas/logs'
import { buildLogRows } from '@codebuff/common/util/log-ingest'
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

// Minimal in-memory fixed-window limiter (per instance). Good enough to blunt
// abuse on a single Render instance; not a distributed guarantee.
const WINDOW_MS = 60_000
const MAX_REQ_PER_WINDOW = 60
const hits = new Map<string, { count: number; resetAt: number }>()

function rateLimited(ip: string, now: number): boolean {
  const entry = hits.get(ip)
  if (!entry || now >= entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    // Opportunistically prune expired entries to bound map growth.
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k)
    }
    return false
  }
  entry.count++
  return entry.count > MAX_REQ_PER_WINDOW
}

export async function POST(req: NextRequest) {
  const now = Date.now()

  // Reject oversized bodies before reading/parsing them (primary DoS guard for
  // this unauthenticated endpoint; the rate limiter below is best-effort).
  if (isLogBodyTooLarge(req.headers.get('content-length'))) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  // Prefer the proxy-set x-real-ip (harder to spoof than the left-most
  // x-forwarded-for token). The limiter is per-instance and best-effort.
  const ip =
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  if (rateLimited(ip, now)) {
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
