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

import { fetchContext7LibraryDocumentation } from '@codebuff/agent-runtime/llm-api/context7-api'

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
  const baseLogger = params.logger

  const parsedBody = await parseJsonBody({
    req,
    schema: bodySchema,
    logger: baseLogger,
    trackEvent,
    validationErrorEvent: AnalyticsEvent.DOCS_SEARCH_VALIDATION_ERROR,
  })
  if (!parsedBody.ok) return parsedBody.response

  const { libraryTitle, topic, maxTokens, repoUrl } = parsedBody.data

  const authed = await requireUserFromApiKey({
    req,
    getUserInfoFromApiKey,
    logger: baseLogger,
    loggerWithContext,
    trackEvent,
    authErrorEvent: AnalyticsEvent.DOCS_SEARCH_AUTH_ERROR,
  })
  if (!authed.ok) return authed.response

  const { userId, logger } = authed.data

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

  const credits = await checkCreditsAndCharge({
    userId,
    creditsToCharge,
    repoUrl,
    context: 'documentation lookup',
    operationName: 'docs search',
    logger,
    trackEvent,
    insufficientCreditsEvent: AnalyticsEvent.DOCS_SEARCH_INSUFFICIENT_CREDITS,
    getUserUsageData,
    consumeCreditsWithFallback,
  })
  if (!credits.ok) return credits.response

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
      const topicSuffix = topic ? ` with topic "${topic}"` : ''
      return NextResponse.json(
        {
          error: `No documentation found for "${libraryTitle}"${topicSuffix}`,
        },
        { status: 200 },
      )
    }

    return NextResponse.json({
      documentation,
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
