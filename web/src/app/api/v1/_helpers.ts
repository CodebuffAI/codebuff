
import { NextResponse } from 'next/server'

import type { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type {
  ConsumeCreditsWithFallbackFn,
  GetUserUsageDataFn,
} from '@codebuff/common/types/contracts/billing'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'
import type { ZodType } from 'zod'

import { extractApiKeyFromHeader } from '@/util/auth'

/**
 * User information returned from API key validation
 */
export interface UserInfo {
  id: string
  email: string
  discord_id: string | null
  referral_code?: string | null
  stripe_customer_id?: string | null
  banned?: boolean
}

export type HandlerResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse }

export const parseJsonBody = async <T>(params: {
  req: NextRequest
  schema: ZodType<T>
  logger: Logger
  trackEvent: TrackEventFn
  validationErrorEvent: AnalyticsEvent
  userId?: string
}): Promise<HandlerResult<T>> => {
  const { req, schema, logger, trackEvent, validationErrorEvent, userId } = params
  const trackingUserId = userId ?? 'unknown'

  let json: unknown
  try {
    json = await req.json()
  } catch {
    trackEvent({
      event: validationErrorEvent,
      userId: trackingUserId,
      properties: { error: 'Invalid JSON' },
      logger,
    })
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 },
      ),
    }
  }

  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    trackEvent({
      event: validationErrorEvent,
      userId: trackingUserId,
      properties: { issues: parsed.error.format() },
      logger,
    })
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.format() },
        { status: 400 },
      ),
    }
  }

  return { ok: true, data: parsed.data }
}

export const requireUserFromApiKey = async (params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  loggerWithContext: LoggerWithContextFn
  trackEvent: TrackEventFn
  authErrorEvent: AnalyticsEvent
}): Promise<
  HandlerResult<{ userId: string; userInfo: UserInfo; logger: Logger }>
> => {
  const {
    req,
    getUserInfoFromApiKey,
    logger: baseLogger,
    loggerWithContext,
    trackEvent,
    authErrorEvent,
  } = params

  const apiKey = extractApiKeyFromHeader(req)
  if (!apiKey) {
    trackEvent({
      event: authErrorEvent,
      userId: 'unknown',
      properties: { reason: 'Missing API key' },
      logger: baseLogger,
    })
    return {
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    }
  }

  const userInfo = await getUserInfoFromApiKey({
    apiKey,
    fields: ['id', 'email', 'discord_id'],
    logger: baseLogger,
  })
  if (!userInfo) {
    trackEvent({
      event: authErrorEvent,
      userId: 'unknown',
      properties: { reason: 'Invalid API key' },
      logger: baseLogger,
    })
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Invalid Codebuff API key' },
        { status: 401 },
      ),
    }
  }

  const logger = loggerWithContext({ userInfo })
  return { ok: true, data: { userId: userInfo.id, userInfo, logger } }
}

export const checkCreditsAndCharge = async (params: {
  userId: string
  creditsToCharge: number
  repoUrl?: string
  context: string
  operationName?: string
  logger: Logger
  trackEvent: TrackEventFn
  insufficientCreditsEvent: AnalyticsEvent
  getUserUsageData: GetUserUsageDataFn
  consumeCreditsWithFallback: ConsumeCreditsWithFallbackFn
}): Promise<HandlerResult<{ creditsUsed: number }>> => {
  const {
    userId,
    creditsToCharge,
    repoUrl,
    context,
    operationName,
    logger,
    trackEvent,
    insufficientCreditsEvent,
    getUserUsageData,
    consumeCreditsWithFallback,
  } = params

  const {
    balance: { totalRemaining },
    nextQuotaReset,
  } = await getUserUsageData({ userId, logger })

  if (totalRemaining <= 0 || totalRemaining < creditsToCharge) {
    trackEvent({
      event: insufficientCreditsEvent,
      userId,
      properties: { totalRemaining, required: creditsToCharge, nextQuotaReset },
      logger,
    })
    return {
      ok: false,
      response: NextResponse.json(
        {
          message: 'Insufficient credits',
          totalRemaining,
          required: creditsToCharge,
          nextQuotaReset,
        },
        { status: 402 },
      ),
    }
  }

  const chargeResult = await consumeCreditsWithFallback({
    userId,
    creditsToCharge,
    repoUrl,
    context,
    logger,
  })

  if (!chargeResult.success) {
    const name = operationName ?? context
    logger.error(
      { userId, creditsToCharge, error: chargeResult.error },
      `Failed to charge credits for ${name}`,
    )
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Failed to charge credits' },
        { status: 500 },
      ),
    }
  }

  return { ok: true, data: { creditsUsed: creditsToCharge } }
}
