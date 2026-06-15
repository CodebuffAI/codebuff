import { env } from '@codebuff/internal/env'
import { getCachedFreebuffWebServiceAccountApiKey } from '@codebuff/internal/freebuff/web-service-account'
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

const UPSTREAM_TIMEOUT_MS = 30_000

/**
 * Read-only actions the integration catalog UI may perform. Deliberately
 * excludes `report_integration`, which is reserved for the agent path (it
 * affects conversion accounting and needs a real search_id).
 */
const catalogRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('search'),
    query: z.string().min(1).max(1000),
  }),
  z.object({
    action: z.literal('browse'),
    category: z.string().min(1).max(200).optional(),
    q: z.string().min(1).max(200).optional(),
  }),
  z.object({ action: z.literal('list_categories') }),
  z.object({
    action: z.literal('get_service'),
    slug: z.string().min(1).max(200),
  }),
])

/** Same credential resolution as the chat agent: explicit CODEBUFF_API_KEY
 *  (local dev) overrides the shared service-account PAT from the DB. */
async function getGravityProxyApiKey(): Promise<string | null> {
  return (
    process.env.CODEBUFF_API_KEY ??
    (await getCachedFreebuffWebServiceAccountApiKey()) ??
    null
  )
}

// Light per-user rate limit. Per-instance only (resets on redeploy/scale),
// which is fine: the upstream proxy is the real guard, this just stops a
// single user hammering browse/search from the catalog UI.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 30
const requestCounts = new Map<string, { count: number; windowStart: number }>()

function isRateLimited(userId: string): boolean {
  const now = Date.now()
  const entry = requestCounts.get(userId)
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    requestCounts.set(userId, { count: 1, windowStart: now })
    return false
  }
  entry.count += 1
  return entry.count > RATE_LIMIT_MAX_REQUESTS
}

/**
 * Session-authed proxy for the Freebuff Web integration catalog. Forwards
 * read-only Gravity Index actions to the main app's /api/v1/gravity-index
 * (which holds the Gravity API key and injects user attribution) under the
 * Freebuff Web service account.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = catalogRequestSchema.safeParse(
    await req.json().catch(() => null),
  )
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid Gravity Index request' },
      { status: 400 },
    )
  }

  if (isRateLimited(userId)) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429 },
    )
  }

  const apiKey = await getGravityProxyApiKey()
  if (!apiKey) {
    logger.error('Gravity catalog proxy: no service-account API key available')
    return NextResponse.json(
      { error: 'Integration catalog is not configured' },
      { status: 503 },
    )
  }

  const input = parsed.data
  const body: Record<string, unknown> = { ...input }
  if (input.action === 'search') {
    // The upstream schema only accepts attribution fields on search.
    body.metadata = { surface: 'freebuff_web_library' }
    body.external_session_id = userId
  }

  const url = new URL('/api/v1/gravity-index', env.NEXT_PUBLIC_CODEBUFF_APP_URL)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const json = await response.json().catch(() => null)
    if (!response.ok || !json || typeof json !== 'object') {
      logger.warn(
        { status: response.status, action: input.action },
        'Gravity catalog proxy upstream request failed',
      )
      return NextResponse.json(
        { error: 'Failed to load the integration catalog' },
        { status: 502 },
      )
    }

    return NextResponse.json(json)
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    logger.error(
      { error, action: input.action, timedOut },
      'Gravity catalog proxy request failed',
    )
    return NextResponse.json(
      {
        error: timedOut
          ? 'Integration catalog request timed out'
          : 'Failed to load the integration catalog',
      },
      { status: 502 },
    )
  } finally {
    clearTimeout(timeout)
  }
}
