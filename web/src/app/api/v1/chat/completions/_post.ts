import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { BYOK_OPENROUTER_HEADER } from '@codebuff/common/constants/byok'
import { getErrorObject } from '@codebuff/common/util/error'
import { env } from '@codebuff/internal/env'
import { NextResponse } from 'next/server'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { InsertMessageBigqueryFn } from '@codebuff/common/types/contracts/bigquery'
import type { GetUserUsageDataFn } from '@codebuff/common/types/contracts/billing'
import type {
  GetAgentRunFromIdFn,
  GetUserInfoFromApiKeyFn,
} from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

import {
  handleOpenRouterNonStream,
  handleOpenRouterStream,
} from '@/llm-api/openrouter'
import { extractApiKeyFromHeader } from '@/util/auth'

export async function postChatCompletions(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  loggerWithContext: LoggerWithContextFn
  trackEvent: TrackEventFn
  getUserUsageData: GetUserUsageDataFn
  getAgentRunFromId: GetAgentRunFromIdFn
  fetch: typeof globalThis.fetch
  insertMessageBigquery: InsertMessageBigqueryFn
}) {
  const {
    req,
    getUserInfoFromApiKey,
    loggerWithContext,
    trackEvent,
    getUserUsageData,
    getAgentRunFromId,
    fetch,
    insertMessageBigquery,
  } = params
  let { logger } = params

  try {
    // Parse request body
    let body: {}
    try {
      body = await req.json()
    } catch (error) {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_VALIDATION_ERROR,
        userId: 'unknown',
        properties: {
          error: 'Invalid JSON in request body',
        },
        logger,
      })
      return NextResponse.json(
        { message: 'Invalid JSON in request body' },
        { status: 400 },
      )
    }

    const bodyStream = 'stream' in body && body.stream
    const runId = (body as any)?.codebuff_metadata?.run_id

    // Extract and validate API key
    const apiKey = extractApiKeyFromHeader(req)
    if (!apiKey) {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_AUTH_ERROR,
        userId: 'unknown',
        properties: {
          reason: 'Missing API key',
        },
        logger,
      })
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    // Get user info
    const userInfo = await getUserInfoFromApiKey({
      apiKey,
      fields: ['id', 'email', 'discord_id'],
      logger,
    })
    if (!userInfo) {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_AUTH_ERROR,
        userId: 'unknown',
        properties: {
          reason: 'Invalid API key',
        },
        logger,
      })
      return NextResponse.json(
        { message: 'Invalid Codebuff API key' },
        { status: 401 },
      )
    }
    logger = loggerWithContext({ userInfo })

    const userId = userInfo.id

    // Track API request
    trackEvent({
      event: AnalyticsEvent.CHAT_COMPLETIONS_REQUEST,
      userId,
      properties: {
        hasStream: !!bodyStream,
        hasRunId: !!runId,
        userInfo,
      },
      logger,
    })

    // Check user credits
    const {
      balance: { totalRemaining },
      nextQuotaReset,
    } = await getUserUsageData({ userId, logger })
    if (totalRemaining <= 0) {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_INSUFFICIENT_CREDITS,
        userId,
        properties: {
          totalRemaining,
          nextQuotaReset,
        },
        logger,
      })
      return NextResponse.json(
        {
          message: `Insufficient credits. Please add credits at ${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/usage or wait for your next cycle to begin (${nextQuotaReset}).`,
        },
        { status: 402 },
      )
    }

    // Extract and validate agent run ID
    const runIdFromBody: string | undefined = (body as any).codebuff_metadata
      ?.run_id
    if (!runIdFromBody || typeof runIdFromBody !== 'string') {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_VALIDATION_ERROR,
        userId,
        properties: {
          error: 'Missing or invalid run_id',
        },
        logger,
      })
      return NextResponse.json(
        { message: 'No runId found in request body' },
        { status: 400 },
      )
    }

    // Get and validate agent run
    const agentRun = await getAgentRunFromId({
      runId: runIdFromBody,
      userId,
      fields: ['agent_id', 'status'],
    })
    if (!agentRun) {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_VALIDATION_ERROR,
        userId,
        properties: {
          error: 'Agent run not found',
          runId: runIdFromBody,
        },
        logger,
      })
      return NextResponse.json(
        { message: `runId Not Found: ${runIdFromBody}` },
        { status: 400 },
      )
    }

    const { agent_id: agentId, status: agentRunStatus } = agentRun

    if (agentRunStatus !== 'running') {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_VALIDATION_ERROR,
        userId,
        properties: {
          error: 'Agent run not running',
          runId: runIdFromBody,
          status: agentRunStatus,
        },
        logger,
      })
      return NextResponse.json(
        { message: `runId Not Running: ${runIdFromBody}` },
        { status: 400 },
      )
    }

    const openrouterApiKey = req.headers.get(BYOK_OPENROUTER_HEADER)

    // Handle streaming vs non-streaming
    try {
      if (bodyStream) {
        // Streaming request
        const stream = await handleOpenRouterStream({
          body,
          userId,
          agentId,
          openrouterApiKey,
          fetch,
          logger,
          insertMessageBigquery,
        })

        trackEvent({
          event: AnalyticsEvent.CHAT_COMPLETIONS_STREAM_STARTED,
          userId,
          properties: {
            agentId,
            runId: runIdFromBody,
          },
          logger,
        })

        return new NextResponse(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          },
        })
      } else {
        // Non-streaming request
        const result = await handleOpenRouterNonStream({
          body,
          userId,
          agentId,
          openrouterApiKey,
          fetch,
          logger,
          insertMessageBigquery,
        })

        trackEvent({
          event: AnalyticsEvent.CHAT_COMPLETIONS_GENERATION_STARTED,
          userId,
          properties: {
            agentId,
            runId: runIdFromBody,
            streaming: false,
          },
          logger,
        })

        return NextResponse.json(result)
      }
    } catch (error) {
      logger.error(
        { error: getErrorObject(error), body },
        'Error with OpenRouter request',
      )
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_ERROR,
        userId,
        properties: {
          error: error instanceof Error ? error.message : 'Unknown error',
          body,
          agentId,
          streaming: bodyStream,
        },
        logger,
      })
      return NextResponse.json(
        { error: 'Failed to process request' },
        { status: 500 },
      )
    }
  } catch (error) {
    logger.error(
      getErrorObject(error),
      'Error processing chat completions request',
    )
    trackEvent({
      event: AnalyticsEvent.CHAT_COMPLETIONS_ERROR,
      userId: 'unknown',
      properties: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      logger,
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
