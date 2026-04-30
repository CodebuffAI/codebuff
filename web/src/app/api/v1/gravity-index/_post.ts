import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import {
  gravityIndexActionRequiresApiKey,
  gravityIndexInputSchema,
} from '@codebuff/common/types/gravity-index'
import { NextResponse } from 'next/server'

import { parseJsonBody, requireUserFromApiKey } from '../_helpers'

import type { GravityIndexInput } from '@codebuff/common/types/gravity-index'
import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

const GRAVITY_INDEX_BASE_URL = 'https://index.trygravity.ai'
const FETCH_TIMEOUT_MS = 30_000

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

const redactGravityApiKey = (
  text: string,
  gravityApiKey: string | undefined,
) => (gravityApiKey ? text.split(gravityApiKey).join('[redacted]') : text)

const withQuery = (
  path: string,
  params: Record<string, string | undefined>,
) => {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value)
  }
  const query = qs.toString()
  return query ? `${path}?${query}` : path
}

const requireGravityApiKey = (gravityApiKey: string | undefined) => {
  if (!gravityApiKey) {
    throw new Error('GRAVITY_API_KEY is not configured')
  }
  return gravityApiKey
}

const buildGravityIndexRequest = (
  input: GravityIndexInput,
  gravityApiKey: string | undefined,
  signal: AbortSignal,
): Parameters<typeof fetch> => {
  switch (input.action) {
    case 'search': {
      const apiKey = requireGravityApiKey(gravityApiKey)
      return [
        `${GRAVITY_INDEX_BASE_URL}/search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: input.query,
            ...(input.search_id ? { search_id: input.search_id } : {}),
            ...(input.context ? { context: input.context } : {}),
            platform_api_key: apiKey,
          }),
          signal,
        },
      ]
    }
    case 'browse':
      return [
        `${GRAVITY_INDEX_BASE_URL}${withQuery('/services', {
          category: input.category,
          q: input.q,
        })}`,
        { signal },
      ]
    case 'list_categories':
      return [`${GRAVITY_INDEX_BASE_URL}/categories`, { signal }]
    case 'get_service':
      return [
        `${GRAVITY_INDEX_BASE_URL}/services/${encodeURIComponent(input.slug)}`,
        { signal },
      ]
    case 'report_integration': {
      const apiKey = requireGravityApiKey(gravityApiKey)
      return [
        `${GRAVITY_INDEX_BASE_URL}/integrations/report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            search_id: input.search_id,
            integrated_slug: input.integrated_slug,
            platform_api_key: apiKey,
          }),
          signal,
        },
      ]
    }
  }
}

export async function postGravityIndex(params: {
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
    schema: gravityIndexInputSchema,
    logger: baseLogger,
    trackEvent,
    validationErrorEvent: AnalyticsEvent.GRAVITY_INDEX_VALIDATION_ERROR,
  })
  if (!parsedBody.ok) return parsedBody.response

  const authed = await requireUserFromApiKey({
    req,
    getUserInfoFromApiKey,
    logger: baseLogger,
    loggerWithContext,
    trackEvent,
    authErrorEvent: AnalyticsEvent.GRAVITY_INDEX_AUTH_ERROR,
  })
  if (!authed.ok) return authed.response

  const { userId, logger } = authed.data
  const input = parsedBody.data
  const gravityApiKey = serverEnv.GRAVITY_API_KEY

  trackEvent({
    event: AnalyticsEvent.GRAVITY_INDEX_REQUEST,
    userId,
    properties: { action: input.action },
    logger,
  })

  if (gravityIndexActionRequiresApiKey(input.action) && !gravityApiKey) {
    logger.error('GRAVITY_API_KEY is not configured')
    trackEvent({
      event: AnalyticsEvent.GRAVITY_INDEX_ERROR,
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
    const response = await fetch(
      ...buildGravityIndexRequest(input, gravityApiKey, controller.signal),
    )
    const text = await response.text()
    const redactedText = redactGravityApiKey(text, gravityApiKey)
    const json = tryParseJson(text)

    if (!response.ok) {
      const upstreamError = getErrorMessage(json)
      const error =
        (upstreamError
          ? redactGravityApiKey(upstreamError, gravityApiKey)
          : redactedText) || 'Gravity Index failed'
      logger.warn(
        {
          status: response.status,
          statusText: response.statusText,
          body: redactedText.slice(0, 500),
        },
        'Gravity Index upstream request failed',
      )
      trackEvent({
        event: AnalyticsEvent.GRAVITY_INDEX_ERROR,
        userId,
        properties: { action: input.action, status: response.status, error },
        logger,
      })
      return NextResponse.json({ error }, { status: 502 })
    }

    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      logger.warn(
        { body: redactedText.slice(0, 500) },
        'Invalid Gravity Index JSON',
      )
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
        : 'Error calling Gravity Index'
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
      event: AnalyticsEvent.GRAVITY_INDEX_ERROR,
      userId,
      properties: {
        action: input.action,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      logger,
    })
    return NextResponse.json({ error: message }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
