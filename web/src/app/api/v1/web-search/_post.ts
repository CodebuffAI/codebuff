import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { PROFIT_MARGIN } from '@codebuff/common/old-constants'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  checkCreditsAndCharge,
  parseJsonBody,
  requireUserFromApiKey,
} from '../_helpers'
import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type {
  GetUserUsageDataFn,
  ConsumeCreditsWithFallbackFn,
} from '@codebuff/common/types/contracts/billing'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

import { searchWeb } from '@codebuff/agent-runtime/llm-api/linkup-api'

import type { LinkupEnv } from '@codebuff/agent-runtime/llm-api/linkup-api'

const bodySchema = z.object({
  query: z.string().min(1, 'query is required'),
  depth: z.enum(['standard', 'deep']).optional().default('standard'),
  repoUrl: z.string().url().optional(),
})

export async function postWebSearch(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  loggerWithContext: LoggerWithContextFn
  trackEvent: TrackEventFn
  getUserUsageData: GetUserUsageDataFn
  consumeCreditsWithFallback: ConsumeCreditsWithFallbackFn
  fetch: typeof globalThis.fetch
  serverEnv: LinkupEnv
}) {
  const {
    req,
    getUserInfoFromApiKey,
    loggerWithContext,
    trackEvent,
    getUserUsageData,
    consumeCreditsWithFallback,
    fetch,
    serverEnv,
  } = params
  const baseLogger = params.logger

  const parsedBody = await parseJsonBody({
    req,
    schema: bodySchema,
    logger: baseLogger,
    trackEvent,
    validationErrorEvent: AnalyticsEvent.WEB_SEARCH_VALIDATION_ERROR,
  })
  if (!parsedBody.ok) return parsedBody.response

  const { query, depth, repoUrl } = parsedBody.data

  const authed = await requireUserFromApiKey({
    req,
    getUserInfoFromApiKey,
    logger: baseLogger,
    loggerWithContext,
    trackEvent,
    authErrorEvent: AnalyticsEvent.WEB_SEARCH_AUTH_ERROR,
  })
  if (!authed.ok) return authed.response

  const { userId, logger } = authed.data

  // Track request
  trackEvent({
    event: AnalyticsEvent.WEB_SEARCH_REQUEST,
    userId,
    properties: { depth, hasRepoUrl: !!repoUrl },
    logger,
  })

  const baseCost = depth === 'deep' ? 5 : 1
  const creditsToCharge = Math.round(baseCost * (1 + PROFIT_MARGIN))

  const credits = await checkCreditsAndCharge({
    userId,
    creditsToCharge,
    repoUrl,
    context: 'web search',
    logger,
    trackEvent,
    insufficientCreditsEvent: AnalyticsEvent.WEB_SEARCH_INSUFFICIENT_CREDITS,
    getUserUsageData,
    consumeCreditsWithFallback,
  })
  if (!credits.ok) return credits.response

  // Perform search
  try {
    const result = await searchWeb({ query, depth, logger, fetch, serverEnv })

    if (!result) {
      trackEvent({
        event: AnalyticsEvent.WEB_SEARCH_ERROR,
        userId,
        properties: { reason: 'No results' },
        logger,
      })
      return NextResponse.json(
        { error: `No search results found for "${query}"` },
        { status: 200 },
      )
    }

    return NextResponse.json({
      result,
      creditsUsed: credits.data.creditsUsed,
    })
  } catch (error) {
    logger.error(
      {
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
      },
      'Web search failed',
    )
    trackEvent({
      event: AnalyticsEvent.WEB_SEARCH_ERROR,
      userId,
      properties: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      logger,
    })
    return NextResponse.json(
      { error: 'Error performing web search' },
      { status: 500 },
    )
  }
}
