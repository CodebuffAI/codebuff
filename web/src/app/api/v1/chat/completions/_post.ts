import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { BYOK_OPENROUTER_HEADER } from '@codebuff/common/constants/byok'
import { getErrorObject } from '@codebuff/common/util/error'
import { pluralize } from '@codebuff/common/util/string'
import { env } from '@codebuff/internal/env'
import { NextResponse } from 'next/server'

import {
  handleOpenAINonStream,
  OPENAI_SUPPORTED_MODELS,
} from '@/llm-api/openai'
import {
  handleOpenRouterNonStream,
  handleOpenRouterStream,
  OpenRouterError,
} from '@/llm-api/openrouter'
import { extractApiKeyFromHeader } from '@/util/auth'

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

export const formatQuotaResetCountdown = (
  nextQuotaReset: string | null | undefined,
): string => {
  if (!nextQuotaReset) {
    return 'soon'
  }

  const resetDate = new Date(nextQuotaReset)
  if (Number.isNaN(resetDate.getTime())) {
    return 'soon'
  }

  const now = Date.now()
  const diffMs = resetDate.getTime() - now
  if (diffMs <= 0) {
    return 'soon'
  }

  const minuteMs = 60 * 1000
  const hourMs = 60 * minuteMs
  const dayMs = 24 * hourMs

  const days = Math.floor(diffMs / dayMs)
  if (days > 0) {
    return `in ${pluralize(days, 'day')}`
  }

  const hours = Math.floor(diffMs / hourMs)
  if (hours > 0) {
    return `in ${pluralize(hours, 'hour')}`
  }

  const minutes = Math.max(1, Math.floor(diffMs / minuteMs))
  return `in ${pluralize(minutes, 'minute')}`
}

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
    let body: Record<string, unknown>
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
      fields: ['id', 'email', 'discord_id', 'stripe_customer_id', 'banned'],
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
    const stripeCustomerId = userInfo.stripe_customer_id ?? null

    // Check if user is banned.
    // We use a clear, helpful message rather than a cryptic error because:
    // 1. Legitimate users banned by mistake deserve to know what's happening
    // 2. Bad actors will figure out they're banned regardless of the message
    // 3. Clear messaging encourages resolution (matches our dispute notification email)
    // 4. 403 Forbidden is the correct HTTP status for "you're not allowed"
    if (userInfo.banned) {
      return NextResponse.json(
        {
          error: 'account_suspended',
          message: `Your account has been suspended due to billing issues. Please contact ${env.NEXT_PUBLIC_SUPPORT_EMAIL} to resolve this.`,
        },
        { status: 403 },
      )
    }

    logger.info({ userInfo, runId }, 'chat completions request received')
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
      const resetCountdown = formatQuotaResetCountdown(nextQuotaReset)
      return NextResponse.json(
        {
          message: `Out of credits. Please add credits at ${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/usage. Your free credits reset ${resetCountdown}.`,
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
          stripeCustomerId,
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
        const model = (body as any)?.model
        const shortModelName =
          typeof model === 'string' ? model.split('/')[1] : undefined
        const isOpenAIDirectModel =
          typeof model === 'string' &&
          model.startsWith('openai/') &&
          OPENAI_SUPPORTED_MODELS.includes(shortModelName as any)
        // Only use OpenAI endpoint for OpenAI models with n parameter
        // All other models (including non-OpenAI with n parameter) should use OpenRouter
        const shouldUseOpenAIEndpoint =
          isOpenAIDirectModel && (body as any)?.codebuff_metadata?.n

        const nonStreamRequest = shouldUseOpenAIEndpoint
          ? handleOpenAINonStream({
              body,
              userId,
              stripeCustomerId,
              agentId,
              fetch,
              logger,
              insertMessageBigquery,
            })
          : handleOpenRouterNonStream({
              body,
              userId,
              stripeCustomerId,
              agentId,
              openrouterApiKey,
              fetch,
              logger,
              insertMessageBigquery,
            })
        const result = await nonStreamRequest

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
      let openrouterError: OpenRouterError | undefined
      if (error instanceof OpenRouterError) {
        openrouterError = error
      }

      // Log detailed error information for debugging
      const errorDetails = openrouterError?.toJSON()
      logger.error(
        {
          error: getErrorObject(error),
          userId,
          agentId,
          runId: runIdFromBody,
          model: (body as any)?.model,
          streaming: !!bodyStream,
          hasByokKey: !!openrouterApiKey,
          messageCount: Array.isArray((body as any)?.messages)
            ? (body as any).messages.length
            : 0,
          messages: (body as any)?.messages,
          openrouterStatusCode: openrouterError?.statusCode,
          openrouterStatusText: openrouterError?.statusText,
          openrouterErrorCode: errorDetails?.error?.code,
          openrouterErrorType: errorDetails?.error?.type,
          openrouterErrorMessage: errorDetails?.error?.message,
          openrouterProviderName: errorDetails?.error?.metadata?.provider_name,
          openrouterProviderRaw: errorDetails?.error?.metadata?.raw,
        },
        'OpenRouter request failed',
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

      // Pass through OpenRouter provider-specific errors
      if (error instanceof OpenRouterError) {
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      }

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
