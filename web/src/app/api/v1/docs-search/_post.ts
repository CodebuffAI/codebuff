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

import { fetchContext7LibraryDocumentation } from '@codebuff/agent-runtime/llm-api/context7-api'
import { extractApiKeyFromHeader } from '@/util/auth'

const bodySchema = z.object({
  libraryTitle: z.string().min(1, 'libraryTitle is required'),
  topic: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  repoUrl: z.string().url().optional(),
})

export async function postDocsSearch(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  loggerWithContext: LoggerWithContextFn
  trackEvent: TrackEventFn
  getUserUsageData: GetUserUsageDataFn
  consumeCreditsWithFallback: ConsumeCreditsWithFallbackFn
  fetch: typeof globalThis.fetch
}) {
  const {
    req,
    getUserInfoFromApiKey,
    loggerWithContext,
    trackEvent,
    getUserUsageData,
    consumeCreditsWithFallback,
    fetch,
  } = params
  let { logger } = params

  // Parse JSON body
  let json: unknown
  try {
    json = await req.json()
  } catch (e) {
    trackEvent({
      event: AnalyticsEvent.DOCS_SEARCH_VALIDATION_ERROR,
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
      event: AnalyticsEvent.DOCS_SEARCH_VALIDATION_ERROR,
      userId: 'unknown',
      properties: { issues: parsed.error.format() },
      logger,
    })
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.format() },
      { status: 400 },
    )
  }
  const { libraryTitle, topic, maxTokens, repoUrl } = parsed.data

  // Auth
  const apiKey = extractApiKeyFromHeader(req)
  if (!apiKey) {
    trackEvent({
      event: AnalyticsEvent.DOCS_SEARCH_AUTH_ERROR,
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
      event: AnalyticsEvent.DOCS_SEARCH_AUTH_ERROR,
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
    event: AnalyticsEvent.DOCS_SEARCH_REQUEST,
    userId,
    properties: { libraryTitle, hasTopic: !!topic, hasRepoUrl: !!repoUrl },
    logger,
  })

  // Credit cost: flat 1 credit (+profit margin)
  const baseCost = 1
  const creditsToCharge = Math.round(baseCost * (1 + PROFIT_MARGIN))

  // Check credits
  const {
    balance: { totalRemaining },
    nextQuotaReset,
  } = await getUserUsageData({ userId, logger })
  if (totalRemaining <= 0 || totalRemaining < creditsToCharge) {
    trackEvent({
      event: AnalyticsEvent.DOCS_SEARCH_INSUFFICIENT_CREDITS,
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

  // Charge upfront with delegation fallback
  const chargeResult = await consumeCreditsWithFallback({
    userId,
    creditsToCharge,
    repoUrl,
    context: 'documentation lookup',
    logger,
  })
  if (!chargeResult.success) {
    logger.error(
      { userId, creditsToCharge, error: chargeResult.error },
      'Failed to charge credits for docs search',
    )
    return NextResponse.json(
      { error: 'Failed to charge credits' },
      { status: 500 },
    )
  }

  // Perform docs fetch
  try {
    const documentation = await fetchContext7LibraryDocumentation({
      query: libraryTitle,
      topic,
      tokens: maxTokens,
      logger,
      fetch,
    })

    if (!documentation) {
      trackEvent({
        event: AnalyticsEvent.DOCS_SEARCH_ERROR,
        userId,
        properties: { reason: 'No documentation' },
        logger,
      })
      return NextResponse.json(
        {
          error: `No documentation found for "${libraryTitle}"${topic ? ` with topic "${topic}"` : ''}`,
        },
        { status: 200 },
      )
    }

    return NextResponse.json({ documentation, creditsUsed: creditsToCharge })
  } catch (error) {
    logger.error(
      {
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
      },
      'Docs search failed',
    )
    trackEvent({
      event: AnalyticsEvent.DOCS_SEARCH_ERROR,
      userId,
      properties: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      logger,
    })
    return NextResponse.json(
      { error: 'Error fetching documentation' },
      { status: 500 },
    )
  }
}
