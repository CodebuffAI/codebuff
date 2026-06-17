import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { env } from '@codebuff/common/env'
import { isLogBodyTooLarge, logIngestSchema } from '@codebuff/common/schemas/logs'
import { buildLogRows } from '@codebuff/common/util/log-ingest'
import {
  createFixedWindowRateLimiter,
  extractClientIp,
} from '@codebuff/common/util/rate-limit'
import { enqueueLogRow } from '@codebuff/logging'
import { NextResponse } from 'next/server'

import { parseJsonBody, requireUserFromApiKey } from '../v1/_helpers'

import { extractApiKeyFromHeader } from '@/util/auth'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

/**
 * Per-IP limiter for the UNAUTHENTICATED (pre-login) CLI ingest path, mirroring
 * the freebuff browser /api/logs endpoint. Authenticated requests skip it (the
 * API key already gates them). Per-instance + best-effort.
 */
const anonRateLimiter = createFixedWindowRateLimiter({
  windowMs: 60_000,
  max: 120,
})

/**
 * POST /api/logs — batch ingest of client logs/events into the unified Axiom
 * logs dataset (clients keep sending to PostHog too). Writes are buffered by
 * the Axiom batching client, so this returns as soon as rows are accepted.
 *
 * Two auth modes:
 *  - **Authenticated** (API key present): the server stamps the user_id.
 *  - **Anonymous** (no API key): accepts the batch with user_id=null, so the
 *    CLI can ship pre-login events (e.g. app_launched) needed for install→login
 *    funnels. Rate-limited per IP + body-capped, same posture as the browser
 *    endpoint. Correlation uses the record's client_session_id/fingerprint_id.
 */
export async function postLogs(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  loggerWithContext: LoggerWithContextFn
  trackEvent: TrackEventFn
}) {
  const {
    req,
    getUserInfoFromApiKey,
    logger: baseLogger,
    loggerWithContext,
    trackEvent,
  } = params

  try {
    if (isLogBodyTooLarge(req.headers.get('content-length'))) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    // Authenticated when an API key is present (server stamps user_id);
    // otherwise anonymous pre-login ingest (rate-limited, user_id=null).
    let userId: string | null = null
    let logger = baseLogger
    if (extractApiKeyFromHeader(req)) {
      const userResult = await requireUserFromApiKey({
        req,
        getUserInfoFromApiKey,
        logger: baseLogger,
        loggerWithContext,
        trackEvent,
        authErrorEvent: AnalyticsEvent.LOGS_INGEST_AUTH_ERROR,
      })
      if (!userResult.ok) {
        return userResult.response
      }
      userId = userResult.data.userId
      logger = userResult.data.logger
    } else if (anonRateLimiter.limited(extractClientIp(req.headers), Date.now())) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
    }

    const bodyResult = await parseJsonBody({
      req,
      schema: logIngestSchema,
      logger,
      trackEvent,
      validationErrorEvent: AnalyticsEvent.LOGS_INGEST_VALIDATION_ERROR,
      userId: userId ?? undefined,
    })
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    const rows = buildLogRows({
      records: bodyResult.data.records,
      source: 'cli',
      service: 'cli',
      env: env.NEXT_PUBLIC_CB_ENVIRONMENT,
      userId,
      now: new Date(),
    })

    for (const row of rows) {
      enqueueLogRow(row)
    }

    return NextResponse.json({ accepted: rows.length })
  } catch (error) {
    baseLogger.error({ error }, 'Error handling /api/logs request')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
