import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { PROFIT_MARGIN } from '@codebuff/common/old-constants'
import { NextResponse } from 'next/server'
import { z } from 'zod'

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
import { extractApiKeyFromHeader } from '@/util/auth'

interface WebSearchEnvDeps {
  LINKUP_API_KEY: string
}

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
  serverEnv: WebSearchEnvDeps
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
  let { logger } = params

  // Parse JSON body
  let json: unknown
  try {
    json = await req.json()
  } catch (e) {
    trackEvent({
      event: AnalyticsEvent.WEB_SEARCH_VALIDATION_ERROR,
      userId: 'unknown',
      properties: { error: 'Invalid JSON' },
      logger,
    })
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 },
    )
  }

  // Validate body
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    trackEvent({
      event: AnalyticsEvent.WEB_SEARCH_VALIDATION_ERROR,
      userId: 'unknown',
      properties: { issues: parsed.error.format() },
      logger,
    })
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.format() },
      { status: 400 },
    )
  }
  const { query, depth, repoUrl } = parsed.data

  // Auth
  const apiKey = extractApiKeyFromHeader(req)
  if (!apiKey) {
    trackEvent({
      event: AnalyticsEvent.WEB_SEARCH_AUTH_ERROR,
      userId: 'unknown',
      properties: { reason: 'Missing API key' },
      logger,
    })
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const userInfo = await getUserInfoFromApiKey({
    apiKey,
    fields: ['id', 'email', 'discord_id'],
    logger,
  })
  if (!userInfo) {
    trackEvent({
      event: AnalyticsEvent.WEB_SEARCH_AUTH_ERROR,
      userId: 'unknown',
      properties: { reason: 'Invalid API key' },
      logger,
    })
    return NextResponse.json(
      { message: 'Invalid Codebuff API key' },
      { status: 401 },
    )
  }
  logger = loggerWithContext({ userInfo })
  const userId = userInfo.id

  // Track request
  trackEvent({
    event: AnalyticsEvent.WEB_SEARCH_REQUEST,
    userId,
    properties: { depth, hasRepoUrl: !!repoUrl },
    logger,
  })

  // Check credits (pre-check)
  const {
    balance: { totalRemaining },
    nextQuotaReset,
  } = await getUserUsageData({ userId, logger })
  const baseCost = depth === 'deep' ? 5 : 1
  const creditsToCharge = Math.round(baseCost * (1 + PROFIT_MARGIN))

  if (totalRemaining <= 0 || totalRemaining < creditsToCharge) {
    trackEvent({
      event: AnalyticsEvent.WEB_SEARCH_INSUFFICIENT_CREDITS,
      userId,
      properties: { totalRemaining, required: creditsToCharge, nextQuotaReset },
      logger,
    })
    return NextResponse.json(
      {
        message: 'Insufficient credits',
        totalRemaining,
        required: creditsToCharge,
        nextQuotaReset,
      },
      { status: 402 },
    )
  }

  // Charge credits upfront with delegation fallback
  const chargeResult = await consumeCreditsWithFallback({
    userId,
    creditsToCharge,
    repoUrl,
    context: 'web search',
    logger,
  })
  if (!chargeResult.success) {
    logger.error(
      { userId, creditsToCharge, error: chargeResult.error },
      'Failed to charge credits for web search',
    )
    return NextResponse.json(
      { error: 'Failed to charge credits' },
      { status: 500 },
    )
  }

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

    return NextResponse.json({ result, creditsUsed: creditsToCharge })
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
