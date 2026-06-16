import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { env } from '@codebuff/common/env'
import { isLogBodyTooLarge, logIngestSchema } from '@codebuff/common/schemas/logs'
import { buildLogRows } from '@codebuff/common/util/log-ingest'
import { enqueueLogRow } from '@codebuff/logging'
import { NextResponse } from 'next/server'

import { parseJsonBody, requireUserFromApiKey } from '../v1/_helpers'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

/**
 * POST /api/logs — authenticated batch ingest of client logs/events.
 *
 * Used by the CLI to mirror its logs/analytics into the unified Axiom logs
 * dataset (it keeps sending to PostHog too). Writes are buffered by the Axiom
 * batching client, so this returns as soon as rows are accepted.
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
    const { userId, logger } = userResult.data

    const bodyResult = await parseJsonBody({
      req,
      schema: logIngestSchema,
      logger,
      trackEvent,
      validationErrorEvent: AnalyticsEvent.LOGS_INGEST_VALIDATION_ERROR,
      userId,
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
