import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { BYOK_OPENROUTER_HEADER } from '@codebuff/common/constants/byok'
import { getErrorObject } from '@codebuff/common/util/error'
import { env } from '@codebuff/internal/env'
import { NextResponse } from 'next/server'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { InsertMessageBigqueryFn } from '@codebuff/common/types/contracts/bigquery'
import type { NextRequest } from 'next/server'

import type { ChatCompletionRequestBody } from '@/llm-api/types'

import {
  CanopyWaveError,
  handleCanopyWaveNonStream,
  handleCanopyWaveStream,
  isCanopyWaveModel,
} from '@/llm-api/canopywave'
import {
  FireworksError,
  handleFireworksNonStream,
  handleFireworksStream,
  isFireworksModel,
} from '@/llm-api/fireworks'
import {
  DeepSeekError,
  handleDeepSeekNonStream,
  handleDeepSeekStream,
  isDeepSeekModel,
} from '@/llm-api/deepseek'
import {
  handleMoonshotNonStream,
  handleMoonshotStream,
  isMoonshotModel,
  MoonshotError,
} from '@/llm-api/moonshot'
import {
  OpenCodeZenError,
  handleOpenCodeZenNonStream,
  handleOpenCodeZenStream,
  isOpenCodeZenModel,
} from '@/llm-api/opencode-zen'
import {
  SiliconFlowError,
  handleSiliconFlowNonStream,
  handleSiliconFlowStream,
  isSiliconFlowModel,
} from '@/llm-api/siliconflow'
import {
  handleOpenAINonStream,
  handleOpenAIStream,
  isOpenAIDirectModel,
  OpenAIError,
} from '@/llm-api/openai'
import {
  handleOpenRouterNonStream,
  handleOpenRouterStream,
  OpenRouterError,
} from '@/llm-api/openrouter'
import { extractApiKeyFromHeader } from '@/util/auth'

// No-op BigQuery insert for BYOK proxy — no usage telemetry
const noopInsertMessageBigquery: InsertMessageBigqueryFn = async () => true

export async function postChatCompletions(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  loggerWithContext: LoggerWithContextFn
  trackEvent: TrackEventFn
  fetch: typeof globalThis.fetch
}) {
  const {
    req,
    getUserInfoFromApiKey,
    loggerWithContext,
    fetch,
  } = params
  let { logger, trackEvent } = params

  try {
    // Parse request body
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_VALIDATION_ERROR,
        userId: 'unknown',
        properties: { error: 'Invalid JSON in request body' },
        logger,
      })
      return NextResponse.json(
        { message: 'Invalid JSON in request body' },
        { status: 400 },
      )
    }

    const typedBody = body as unknown as ChatCompletionRequestBody
    const bodyStream = typedBody.stream ?? false

    // Extract and validate API key
    const apiKey = extractApiKeyFromHeader(req)
    if (!apiKey) {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_AUTH_ERROR,
        userId: 'unknown',
        properties: { reason: 'Missing API key' },
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

    if (userInfo.banned) {
      return NextResponse.json(
        {
          error: 'account_suspended',
          message: `Your account has been suspended. Please contact ${env.NEXT_PUBLIC_SUPPORT_EMAIL} if you did not expect this.`,
        },
        { status: 403 },
      )
    }

    trackEvent({
      event: AnalyticsEvent.CHAT_COMPLETIONS_REQUEST,
      userId,
      properties: {
        hasStream: !!bodyStream,
        model: typedBody.model,
      },
      logger,
    })

    const openrouterApiKey = req.headers.get(BYOK_OPENROUTER_HEADER)

    // Shared args for all provider handlers
    // stripeCustomerId and agentId are not relevant in BYOK mode but required
    // by provider handler signatures that also handle billing paths.
    const baseArgs = {
      body: typedBody,
      userId,
      stripeCustomerId: null,
      agentId: 'byok',
      fetch,
      logger,
      insertMessageBigquery: noopInsertMessageBigquery,
    }

    try {
      if (bodyStream) {
        const useSiliconFlow = false // isSiliconFlowModel(typedBody.model)
        const useOpenCodeZen = isOpenCodeZenModel(typedBody.model)
        const useMoonshot = !useOpenCodeZen && isMoonshotModel(typedBody.model)
        const useCanopyWave =
          !useMoonshot && !useOpenCodeZen && isCanopyWaveModel(typedBody.model)
        const useDeepSeek =
          !useMoonshot &&
          !useOpenCodeZen &&
          !useCanopyWave &&
          isDeepSeekModel(typedBody.model)
        const useFireworks =
          !useMoonshot &&
          !useOpenCodeZen &&
          !useCanopyWave &&
          !useDeepSeek &&
          isFireworksModel(typedBody.model)
        const useOpenAIDirect =
          !useMoonshot &&
          !useOpenCodeZen &&
          !useCanopyWave &&
          !useDeepSeek &&
          !useFireworks &&
          isOpenAIDirectModel(typedBody.model)

        const stream = useSiliconFlow
          ? await handleSiliconFlowStream(baseArgs)
          : useMoonshot
            ? await handleMoonshotStream(baseArgs)
            : useOpenCodeZen
              ? await handleOpenCodeZenStream(baseArgs)
              : useCanopyWave
                ? await handleCanopyWaveStream(baseArgs)
                : useDeepSeek
                  ? await handleDeepSeekStream(baseArgs)
                  : useFireworks
                    ? await handleFireworksStream(baseArgs)
                    : useOpenAIDirect
                      ? await handleOpenAIStream(baseArgs)
                      : await handleOpenRouterStream({
                          ...baseArgs,
                          openrouterApiKey,
                        })

        trackEvent({
          event: AnalyticsEvent.CHAT_COMPLETIONS_STREAM_STARTED,
          userId,
          properties: { model: typedBody.model },
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
        const model = typedBody.model
        const useSiliconFlow = false // isSiliconFlowModel(model)
        const useOpenCodeZen = isOpenCodeZenModel(model)
        const useMoonshot = !useOpenCodeZen && isMoonshotModel(model)
        const useCanopyWave =
          !useMoonshot && !useOpenCodeZen && isCanopyWaveModel(model)
        const useDeepSeek =
          !useMoonshot &&
          !useOpenCodeZen &&
          !useCanopyWave &&
          isDeepSeekModel(model)
        const useFireworks =
          !useMoonshot &&
          !useOpenCodeZen &&
          !useCanopyWave &&
          !useDeepSeek &&
          isFireworksModel(model)
        const shouldUseOpenAIEndpoint =
          !useMoonshot &&
          !useOpenCodeZen &&
          !useCanopyWave &&
          !useDeepSeek &&
          !useFireworks &&
          isOpenAIDirectModel(model)

        const nonStreamRequest = useSiliconFlow
          ? handleSiliconFlowNonStream(baseArgs)
          : useMoonshot
            ? handleMoonshotNonStream(baseArgs)
            : useOpenCodeZen
              ? handleOpenCodeZenNonStream(baseArgs)
              : useCanopyWave
                ? handleCanopyWaveNonStream(baseArgs)
                : useDeepSeek
                  ? handleDeepSeekNonStream(baseArgs)
                  : useFireworks
                    ? handleFireworksNonStream(baseArgs)
                    : shouldUseOpenAIEndpoint
                      ? handleOpenAINonStream(baseArgs)
                      : handleOpenRouterNonStream({
                          ...baseArgs,
                          openrouterApiKey,
                        })

        const result = await nonStreamRequest

        trackEvent({
          event: AnalyticsEvent.CHAT_COMPLETIONS_GENERATION_STARTED,
          userId,
          properties: { model, streaming: false },
          logger,
        })

        return NextResponse.json(result)
      }
    } catch (error) {
      let openrouterError: OpenRouterError | undefined
      if (error instanceof OpenRouterError) openrouterError = error
      let fireworksError: FireworksError | undefined
      if (error instanceof FireworksError) fireworksError = error
      let canopywaveError: CanopyWaveError | undefined
      if (error instanceof CanopyWaveError) canopywaveError = error
      let deepseekError: DeepSeekError | undefined
      if (error instanceof DeepSeekError) deepseekError = error
      let moonshotError: MoonshotError | undefined
      if (error instanceof MoonshotError) moonshotError = error
      let siliconflowError: SiliconFlowError | undefined
      if (error instanceof SiliconFlowError) siliconflowError = error
      let openaiError: OpenAIError | undefined
      if (error instanceof OpenAIError) openaiError = error
      let opencodeZenError: OpenCodeZenError | undefined
      if (error instanceof OpenCodeZenError) opencodeZenError = error

      const errorDetails = openrouterError?.toJSON()
      const providerLabel = siliconflowError
        ? 'SiliconFlow'
        : opencodeZenError
          ? 'OpenCode Zen'
          : moonshotError
            ? 'Moonshot'
            : canopywaveError
              ? 'CanopyWave'
              : deepseekError
                ? 'DeepSeek'
                : fireworksError
                  ? 'Fireworks'
                  : openaiError
                    ? 'OpenAI'
                    : 'OpenRouter'

      logger.error(
        {
          error: getErrorObject(error),
          userId,
          model: typedBody.model,
          streaming: !!bodyStream,
          hasByokKey: !!openrouterApiKey,
          providerStatusCode: (
            openrouterError ??
            fireworksError ??
            moonshotError ??
            canopywaveError ??
            deepseekError ??
            siliconflowError ??
            openaiError ??
            opencodeZenError
          )?.statusCode,
          openrouterErrorCode: errorDetails?.error?.code,
          openrouterErrorMessage: errorDetails?.error?.message,
        },
        `${providerLabel} request failed`,
      )

      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_ERROR,
        userId,
        properties: {
          error: error instanceof Error ? error.message : 'Unknown error',
          model: typedBody.model,
          streaming: bodyStream,
        },
        logger,
      })

      if (error instanceof OpenRouterError)
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      if (error instanceof FireworksError)
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      if (error instanceof MoonshotError)
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      if (error instanceof CanopyWaveError)
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      if (error instanceof DeepSeekError)
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      if (error instanceof SiliconFlowError)
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      if (error instanceof OpenAIError)
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      if (error instanceof OpenCodeZenError)
        return NextResponse.json(error.toJSON(), { status: error.statusCode })

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
