import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import { parseJsonBody, requireUserFromApiKey } from '../../_helpers'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

const GRAVITY_INDEX_BASE_URL = 'https://index.trygravity.ai'
const FETCH_TIMEOUT_MS = 30_000

const bodySchema = z.object({
  query: z.string().min(1, 'query is required'),
})

const tryParseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const getErrorMessage = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const message = record.error ?? record.message
  return typeof message === 'string' ? message : undefined
}

export async function postGravityIndexSearch(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  loggerWithContext: LoggerWithContextFn
  trackEvent: TrackEventFn
  fetch: typeof globalThis.fetch
  serverEnv: {
    GRAVITY_API_KEY?: string
  }
}) {
  const {
    req,
    getUserInfoFromApiKey,
    loggerWithContext,
    trackEvent,
    fetch,
    serverEnv,
  } = params
  const baseLogger = params.logger

  const parsedBody = await parseJsonBody({
    req,
    schema: bodySchema,
    logger: baseLogger,
    trackEvent,
    validationErrorEvent: AnalyticsEvent.GRAVITY_INDEX_SEARCH_VALIDATION_ERROR,
  })
  if (!parsedBody.ok) return parsedBody.response

  const authed = await requireUserFromApiKey({
    req,
    getUserInfoFromApiKey,
    logger: baseLogger,
    loggerWithContext,
    trackEvent,
    authErrorEvent: AnalyticsEvent.GRAVITY_INDEX_SEARCH_AUTH_ERROR,
  })
  if (!authed.ok) return authed.response

  const { userId, logger } = authed.data
  const { query } = parsedBody.data
  const publisherKey = serverEnv.GRAVITY_API_KEY

  trackEvent({
    event: AnalyticsEvent.GRAVITY_INDEX_SEARCH_REQUEST,
    userId,
    properties: { queryLength: query.length },
    logger,
  })

  if (!publisherKey) {
    logger.error('GRAVITY_API_KEY is not configured')
    trackEvent({
      event: AnalyticsEvent.GRAVITY_INDEX_SEARCH_ERROR,
      userId,
      properties: { reason: 'missing_gravity_api_key' },
      logger,
    })
    return NextResponse.json(
      { error: 'Gravity Index is not configured' },
      { status: 503 },
    )
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(`${GRAVITY_INDEX_BASE_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        platform_api_key: publisherKey,
      }),
      signal: controller.signal,
    })

    const text = await response.text()
    const json = tryParseJson(text)

    if (!response.ok) {
      const error = (getErrorMessage(json) ?? text) || 'Gravity Index failed'
      logger.warn(
        {
          status: response.status,
          statusText: response.statusText,
          body: text.slice(0, 500),
        },
        'Gravity Index upstream request failed',
      )
      trackEvent({
        event: AnalyticsEvent.GRAVITY_INDEX_SEARCH_ERROR,
        userId,
        properties: { status: response.status, error },
        logger,
      })
      return NextResponse.json({ error }, { status: 502 })
    }

    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      logger.warn({ body: text.slice(0, 500) }, 'Invalid Gravity Index JSON')
      return NextResponse.json(
        { error: 'Invalid Gravity Index response' },
        { status: 502 },
      )
    }

    return NextResponse.json({
      ...(json as Record<string, unknown>),
      creditsUsed: 0,
    })
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'Gravity Index request timed out'
        : 'Error searching Gravity Index'
    logger.error(
      {
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
      },
      message,
    )
    trackEvent({
      event: AnalyticsEvent.GRAVITY_INDEX_SEARCH_ERROR,
      userId,
      properties: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      logger,
    })
    return NextResponse.json({ error: message }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
