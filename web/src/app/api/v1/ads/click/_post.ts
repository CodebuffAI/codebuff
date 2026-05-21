import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
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

const bodySchema = z.object({
  impUrl: z.url(),
  surface: z.enum(['chat', 'waiting_room']).optional(),
})

export async function postAdClick(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  loggerWithContext: LoggerWithContextFn
  trackEvent: TrackEventFn
}) {
  const { req, getUserInfoFromApiKey, loggerWithContext, trackEvent } = params
  const baseLogger = params.logger

  let impUrl: string
  let surface: z.infer<typeof bodySchema>['surface']
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
    surface = parsed.data.surface
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
    authErrorEvent: AnalyticsEvent.ADS_API_AUTH_ERROR,
  })
  if (!authed.ok) return authed.response

  const { userId, logger } = authed.data

  const adRecord = await db.query.adImpression.findFirst({
    where: eq(schema.adImpression.imp_url, impUrl),
  })

  if (!adRecord || adRecord.user_id !== userId) {
    logger.warn(
      {
        userId,
        adUserId: adRecord?.user_id,
        impUrl,
      },
      '[ads] Ad click not found for user',
    )
    return NextResponse.json(
      { success: false, error: 'Ad not found' },
      { status: 404 },
    )
  }

  trackEvent({
    event: AnalyticsEvent.ADS_CLICKED,
    userId,
    properties: {
      ad_impression_id: adRecord.id,
      provider: adRecord.provider,
      title: adRecord.title,
      cta: adRecord.cta,
      ad_url: adRecord.url,
      already_clicked: Boolean(adRecord.clicked_at),
      impression_recorded: Boolean(adRecord.impression_fired_at),
      surface,
    },
    logger,
  })

  try {
    await db
      .update(schema.adImpression)
      .set({ clicked_at: new Date() })
      .where(
        and(
          eq(schema.adImpression.id, adRecord.id),
          isNull(schema.adImpression.clicked_at),
        ),
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
      '[ads] Failed to update ad click record',
    )
  }

  return NextResponse.json({ success: true })
}
