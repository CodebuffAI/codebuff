import { consumeCredits, consumeOrganizationCredits } from '@codebuff/billing'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import db from '@codebuff/common/db/index'
import * as schema from '@codebuff/common/db/schema'
import {
  models,
  PROFIT_MARGIN,
  TEST_USER_ID,
} from '@codebuff/common/old-constants'
import { withRetry } from '@codebuff/common/util/promise'
import { stripeServer } from '@codebuff/common/util/stripe'
import { logSyncFailure } from '@codebuff/common/util/sync-failure'
import { eq } from 'drizzle-orm'
import Stripe from 'stripe'
import { WebSocket } from 'ws'

import { getRequestContext } from '../context/app-context'
import { withLoggerContext } from '../util/logger'
import { stripNullCharsFromObject } from '../util/object'
import { SWITCHBOARD } from '../websockets/server'

import type { ClientState } from '../websockets/switchboard'
import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { SendActionFn } from '@codebuff/common/types/contracts/client'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  ParamsExcluding,
  ParamsOf,
} from '@codebuff/common/types/function-params'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'

// Pricing details:
// - https://www.anthropic.com/pricing#anthropic-api
// - https://openai.com/pricing
// - https://ai.google.dev/pricing
type CostModelKey = keyof (typeof TOKENS_COST_PER_M)['input']
const TOKENS_COST_PER_M = {
  input: {
    // [models.opus4]: 15,
    // [models.sonnet]: 3,
    // [models.sonnet3_7]: 3,
    // [models.haiku]: 0.8,
    [models.gpt4o]: 2.5,
    [models.gpt4_1]: 2,
    [models.gpt4omini]: 0.15,
    [models.o3pro]: 20.0,
    [models.o3]: 2.0,
    [models.o3mini]: 1.1,
    [models.o4mini]: 1.1,
    [models.deepseekChat]: 0.14,
    [models.deepseekReasoner]: 0.55,
    [models.ft_filepicker_003]: 0.1,
    [models.ft_filepicker_005]: 0.1,
    [models.openrouter_claude_sonnet_4]: 3,
    [models.openrouter_claude_opus_4]: 15,
    [models.openrouter_claude_3_5_haiku]: 0.8,
    [models.openrouter_claude_3_5_sonnet]: 3,
    [models.openrouter_gpt4o]: 2.5,
    [models.openrouter_gpt4o_mini]: 0.15,
    [models.openrouter_gpt4_1_nano]: 0.1,
    [models.openrouter_o3_mini]: 1.1,
    [models.openrouter_gemini2_5_pro_preview]: 1.25,
    [models.openrouter_grok_4]: 3.0,
  },
  output: {
    // [models.opus4]: 75,
    // [models.sonnet]: 15,
    // [models.sonnet3_7]: 15,
    // [models.haiku]: 4,
    [models.gpt4o]: 10.0,
    [models.gpt4_1]: 8,
    [models.gpt4omini]: 0.6,
    [models.o3pro]: 80.0,
    [models.o3]: 8.0,
    [models.o3mini]: 4.4,
    [models.o4mini]: 1.1,
    [models.deepseekChat]: 0.28,
    [models.deepseekReasoner]: 2.19,
    [models.ft_filepicker_003]: 0.4,
    [models.ft_filepicker_005]: 0.4,
    [models.openrouter_claude_sonnet_4]: 15,
    [models.openrouter_claude_opus_4]: 75,
    [models.openrouter_claude_3_5_haiku]: 4,
    [models.openrouter_claude_3_5_sonnet]: 15,
    [models.openrouter_gpt4o]: 10,
    [models.openrouter_gpt4o_mini]: 0.6,
    [models.openrouter_gpt4_1_nano]: 0.4,
    [models.openrouter_o3_mini]: 4.4,
    [models.openrouter_gemini2_5_pro_preview]: 10,
    [models.openrouter_grok_4]: 15.0,
  },
  cache_creation: {
    // [models.opus4]: 18.75,
    // [models.sonnet]: 3.75,
    // [models.sonnet3_7]: 3.75,
    // [models.haiku]: 1,
  },
  cache_read: {
    // [models.opus4]: 1.5,
    // [models.sonnet]: 0.3,
    // [models.sonnet3_7]: 0.3,
    // [models.haiku]: 0.08,
    [models.deepseekChat]: 0.014,
    [models.deepseekReasoner]: 0.14,
    [models.gpt4o]: 1.25,
    [models.gpt4_1]: 0.5,
    [models.gpt4omini]: 0.075,
    [models.o3]: 0.5,
    [models.o3mini]: 0.55,
    [models.o4mini]: 0.275,
    [models.ft_filepicker_003]: 0.025,
    [models.ft_filepicker_005]: 0.025,
  },
}

const RELACE_FAST_APPLY_COST = 0.01

/**
 * Calculates the cost for the gemini-2.5-pro-preview model based on its specific tiered pricing.
 *
 * Pricing rules:
 * - Input tokens:
 *   - $1.25 per 1 million tokens for the first 200,000 tokens.
 *   - $2.50 per 1 million tokens for tokens beyond 200,000.
 * - Output tokens:
 *   - $10.00 per 1 million tokens if input tokens <= 200,000.
 *   - $15.00 per 1 million tokens if input tokens > 200,000.
 *
 * @param input_tokens The number of input tokens used.
 * @param output_tokens The number of output tokens generated.
 * @returns The calculated cost for the API call.
 */
const getGemini25ProPreviewCost = (
  input_tokens: number,
  output_tokens: number,
): number => {
  let inputCost = 0
  const tier1Tokens = Math.min(input_tokens, 200_000)
  const tier2Tokens = Math.max(0, input_tokens - 200_000)

  inputCost += (tier1Tokens * 1.25) / 1_000_000
  inputCost += (tier2Tokens * 2.5) / 1_000_000

  let outputCost = 0
  if (input_tokens <= 200_000) {
    outputCost = (output_tokens * 10) / 1_000_000
  } else {
    outputCost = (output_tokens * 15) / 1_000_000
  }

  return inputCost + outputCost
}

/**
 * Calculates the cost for the Grok 4 model based on its tiered pricing.
 *
 * Pricing rules:
 * - Input tokens:
 *   - $3.0 per 1 million tokens for the first 128,000 tokens.
 *   - $6.0 per 1 million tokens for tokens beyond 128,000.
 * - Output tokens:
 *   - $15.0 per 1 million tokens if input tokens <= 128,000.
 *   - $30.0 per 1 million tokens if input tokens > 128,000.
 *
 * @param input_tokens The number of input tokens used.
 * @param output_tokens The number of output tokens generated.
 * @returns The calculated cost for the API call.
 */
const getGrok4Cost = (input_tokens: number, output_tokens: number): number => {
  let inputCost = 0
  const tier1Tokens = Math.min(input_tokens, 128_000)
  const tier2Tokens = Math.max(0, input_tokens - 128_000)

  inputCost += (tier1Tokens * 3.0) / 1_000_000
  inputCost += (tier2Tokens * 6.0) / 1_000_000

  let outputCost = 0
  if (input_tokens <= 128_000) {
    outputCost = (output_tokens * 15.0) / 1_000_000
  } else {
    outputCost = (output_tokens * 30.0) / 1_000_000
  }

  return inputCost + outputCost
}

const getPerTokenCost = (
  model: string,
  type: keyof typeof TOKENS_COST_PER_M,
): number => {
  const costMap = TOKENS_COST_PER_M[type] as Record<CostModelKey, number>
  return (costMap[model as CostModelKey] ?? 0) / 1_000_000
}

const calcCost = (
  model: string,
  input_tokens: number,
  output_tokens: number,
  cache_creation_input_tokens: number,
  cache_read_input_tokens: number,
) => {
  if (model === 'relace-fast-apply') {
    return RELACE_FAST_APPLY_COST
  }
  if (model === models.openrouter_grok_4) {
    return (
      getGrok4Cost(input_tokens, output_tokens) +
      cache_creation_input_tokens * getPerTokenCost(model, 'cache_creation') +
      cache_read_input_tokens * getPerTokenCost(model, 'cache_read')
    )
  }
  return (
    input_tokens * getPerTokenCost(model, 'input') +
    output_tokens * getPerTokenCost(model, 'output') +
    cache_creation_input_tokens * getPerTokenCost(model, 'cache_creation') +
    cache_read_input_tokens * getPerTokenCost(model, 'cache_read')
  )
}

const VERBOSE = false

async function syncMessageToStripe(params: {
  messageId: string
  userId: string
  costInCents: number
  finishedAt: Date
  logger: Logger
}) {
  const { messageId, userId, costInCents, finishedAt, logger } = params

  if (!userId || userId === TEST_USER_ID) {
    if (VERBOSE) {
      logger.debug(
        { messageId, userId },
        'Skipping Stripe sync (no user or test user).',
      )
    }
    return
  }

  const logContext = { messageId, userId, costInCents }

  try {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: { stripe_customer_id: true },
    })

    if (!user?.stripe_customer_id) {
      logger.warn(
        logContext,
        'Cannot sync usage to Stripe: User has no stripe_customer_id.',
      )
      return
    }

    const stripeCustomerId = user.stripe_customer_id
    const timestamp = Math.floor(finishedAt.getTime() / 1000)

    const syncAction = async () => {
      await stripeServer.billing.meterEvents.create({
        event_name: 'credits',
        timestamp: timestamp,
        payload: {
          stripe_customer_id: stripeCustomerId,
          value: costInCents.toString(),
          message_id: messageId,
        },
      })

      await db
        .delete(schema.syncFailure)
        .where(eq(schema.syncFailure.id, messageId))
        .catch((err) =>
          logger.error(
            { ...logContext, error: err },
            'Error deleting sync failure record after successful sync.',
          ),
        )
    }

    await withRetry(syncAction, {
      maxRetries: 5,
      retryIf: (error: Stripe.errors.StripeError) => {
        if (
          error instanceof Stripe.errors.StripeConnectionError ||
          error instanceof Stripe.errors.StripeAPIError ||
          error instanceof Stripe.errors.StripeRateLimitError
        ) {
          logger.warn(
            { ...logContext, error: error.message, type: error.type },
            'Retrying Stripe sync due to error.',
          )
          return true
        }
        logger.error(
          { ...logContext, error: error.message, type: error.type },
          'Non-retriable error during Stripe sync.',
        )
        return false
      },
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error during Stripe sync'
    logger.error(
      { ...logContext, error: errorMessage },
      'Failed to sync usage to Stripe after retries.',
    )
    await logSyncFailure({
      id: messageId,
      errorMessage,
      provider: 'stripe',
      logger,
    })
  }
}

type InsertMessageParams = {
  messageId: string
  userId: string | undefined
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  model: string
  request: Message[]
  response: string
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  cost: number
  creditsUsed: number
  finishedAt: Date
  latencyMs: number
}

export async function insertMessageRecordWithRetries(params: {
  messageParams: InsertMessageParams
  logger: Logger
  maxRetries?: number
}): Promise<typeof schema.message.$inferSelect | null> {
  const { messageParams, logger, maxRetries = 3 } = params
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await insertMessageRecord(messageParams)
    } catch (error) {
      if (attempt === maxRetries) {
        logger.error(
          { messageId: messageParams.messageId, error, attempt },
          `Failed to save message after ${maxRetries} attempts`,
        )
        return null
        // TODO: Consider rethrowing the error, if we are losing too much money.
        // throw error
      } else {
        logger.warn(
          { messageId: messageParams.messageId, error: error },
          `Retrying save message to DB (attempt ${attempt}/${maxRetries})`,
        )
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
      }
    }
  }
  throw new Error('Failed to save message after all attempts.')
}

async function insertMessageRecord(
  params: InsertMessageParams,
): Promise<typeof schema.message.$inferSelect> {
  const {
    messageId,
    userId,
    clientSessionId,
    fingerprintId,
    userInputId,
    model,
    request,
    response,
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    cost,
    creditsUsed,
    finishedAt,
    latencyMs,
  } = params

  // Get organization context from request
  const requestContext = getRequestContext()
  const orgId = requestContext?.approvedOrgIdForRepo
  const repoUrl = requestContext?.processedRepoUrl

  const insertResult = await db
    .insert(schema.message)
    .values({
      ...stripNullCharsFromObject({
        id: messageId,
        user_id: userId,
        client_id: clientSessionId,
        client_request_id: userInputId,
        model: model,
        request: request,
        response: response,
      }),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: cacheCreationInputTokens,
      cache_read_input_tokens: cacheReadInputTokens,
      cost: cost.toString(),
      credits: creditsUsed,
      finished_at: finishedAt,
      latency_ms: latencyMs,
      org_id: orgId || null,
      repo_url: repoUrl || null,
    })
    .returning()

  if (insertResult.length === 0) {
    throw new Error('Failed to insert message into DB (no rows returned).')
  }

  return insertResult[0]
}

async function sendCostResponseToClient(params: {
  clientSessionId: string
  userInputId: string
  creditsUsed: number
  agentId?: string
  sendAction: SendActionFn
  logger: Logger
}): Promise<void> {
  const {
    clientSessionId,
    userInputId,
    creditsUsed,
    agentId,
    sendAction,
    logger,
  } = params
  try {
    const clientEntry = Array.from(SWITCHBOARD.clients.entries()).find(
      ([_, state]: [WebSocket, ClientState]) =>
        state.sessionId === clientSessionId,
    )

    if (clientEntry) {
      const [ws] = clientEntry
      if (ws.readyState === WebSocket.OPEN) {
        sendAction({
          action: {
            type: 'message-cost-response',
            promptId: userInputId,
            credits: creditsUsed,
            agentId,
          },
        })
      } else {
        logger.warn(
          { clientSessionId: clientSessionId },
          'WebSocket connection not in OPEN state when trying to send cost response.',
        )
      }
    } else {
      logger.warn(
        { clientSessionId: clientSessionId },
        'No WebSocket connection found for cost response.',
      )
    }
  } catch (wsError) {
    logger.error(
      { clientSessionId: clientSessionId, error: wsError },
      'Error sending message cost response via WebSocket.',
    )
  }
}

type CreditConsumptionResult = {
  consumed: number
  fromPurchased: number
}

async function updateUserCycleUsageWithRetries(
  params: {
    userId: string
    creditsUsed: number
    logger: Logger
    maxRetries?: number
    trackEvent: TrackEventFn
  } & ParamsOf<typeof updateUserCycleUsage>,
): Promise<CreditConsumptionResult> {
  const { userId, creditsUsed, logger, maxRetries = 3, trackEvent } = params
  const requestContext = getRequestContext()
  const orgId = requestContext?.approvedOrgIdForRepo

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await updateUserCycleUsage(params)
    } catch (error) {
      if (attempt === maxRetries) {
        logger.error(
          { userId, orgId, creditsUsed, error, attempt },
          `Failed to update user cycle usage after ${maxRetries} attempts`,
        )

        return { consumed: 0, fromPurchased: 0 }

        // TODO: Consider rethrowing the error, if we are losing too much money.
        // throw error
      } else {
        logger.warn(
          { userId, orgId, creditsUsed, error: error },
          `Retrying update user cycle usage (attempt ${attempt}/${maxRetries})`,
        )
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
      }
    }
  }
  throw new Error('Failed to update user cycle usage after all attempts.')
}

async function updateUserCycleUsage(params: {
  userId: string
  creditsUsed: number
  logger: Logger
  trackEvent: TrackEventFn
}): Promise<CreditConsumptionResult> {
  const { userId, creditsUsed, logger, trackEvent } = params
  if (creditsUsed <= 0) {
    if (VERBOSE) {
      logger.debug(
        { userId, creditsUsed },
        'Skipping user usage update (zero credits).',
      )
    }
    return { consumed: 0, fromPurchased: 0 }
  }

  // Check if this should be billed to an organization
  const requestContext = getRequestContext()
  const orgId = requestContext?.approvedOrgIdForRepo

  if (orgId) {
    // TODO: use `consumeCreditsWithFallback` to handle organization delegation
    // Consume from organization credits
    const result = await consumeOrganizationCredits({
      organizationId: orgId,
      creditsToConsume: creditsUsed,
      logger,
    })

    if (VERBOSE) {
      logger.debug(
        { userId, orgId, creditsUsed, ...result },
        `Consumed organization credits (${creditsUsed})`,
      )
    }

    trackEvent({
      event: AnalyticsEvent.CREDIT_CONSUMED,
      userId,
      properties: {
        creditsUsed,
        fromPurchased: result.fromPurchased,
        organizationId: orgId,
      },
      logger,
    })

    return result
  } else {
    // Consume from personal credits
    const result = await consumeCredits({
      userId,
      creditsToConsume: creditsUsed,
      logger,
    })

    if (VERBOSE) {
      logger.debug(
        { userId, creditsUsed, ...result },
        `Consumed personal credits (${creditsUsed})`,
      )
    }

    trackEvent({
      event: AnalyticsEvent.CREDIT_CONSUMED,
      userId,
      properties: {
        creditsUsed,
        fromPurchased: result.fromPurchased,
      },
      logger,
    })

    return result
  }
}

export async function saveMessage(
  params: {
    messageId: string
    userId: string | undefined
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: string
    request: Message[]
    response: string
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens?: number
    cacheReadInputTokens?: number
    finishedAt: Date
    latencyMs: number
    usesUserApiKey?: boolean
    chargeUser?: boolean
    costOverrideDollars?: number
    agentId?: string
    logger: Logger
    trackEvent: TrackEventFn
  } & ParamsExcluding<typeof sendCostResponseToClient, 'creditsUsed'>,
): Promise<number> {
  const {
    messageId,
    userId,
    fingerprintId,
    costOverrideDollars,
    model,
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    logger,
    trackEvent,
  } = params

  return withLoggerContext(
    {
      messageId,
      userId,
      fingerprintId,
    },
    async () => {
      const cost =
        costOverrideDollars ??
        calcCost(
          model,
          inputTokens,
          outputTokens,
          cacheCreationInputTokens ?? 0,
          cacheReadInputTokens ?? 0,
        )

      // Default to 1 cent per credit
      const centsPerCredit = 1

      const costInCents =
        params.chargeUser ?? true // default to true
          ? Math.max(
              0,
              Math.round(
                cost *
                  100 *
                  (params.usesUserApiKey ? PROFIT_MARGIN : 1 + PROFIT_MARGIN),
              ),
            )
          : 0

      const creditsUsed = Math.max(0, costInCents)

      if (userId === TEST_USER_ID) {
        logger.info(
          {
            costUSD: cost,
            costInCents,
            creditsUsed,
            centsPerCredit,
            value: { ...params, request: 'Omitted', response: 'Omitted' },
          },
          `Credits used by test user (${creditsUsed})`,
        )
        return creditsUsed
      }

      if (VERBOSE) {
        logger.debug(
          {
            messageId,
            costUSD: cost,
            costInCents,
            creditsUsed,
            centsPerCredit,
          },
          `Calculated credits (${creditsUsed})`,
        )
      }

      sendCostResponseToClient({
        ...params,
        creditsUsed,
      })

      await insertMessageRecordWithRetries({
        messageParams: {
          ...params,
          cost,
          creditsUsed,
        },
        logger,
      })

      if (!params.userId) {
        logger.debug(
          { messageId: params.messageId, userId: params.userId },
          'Skipping further processing (no user ID or failed to save message).',
        )
        return 0
      }

      const consumptionResult = await updateUserCycleUsageWithRetries({
        userId: params.userId,
        creditsUsed,
        logger,
        trackEvent,
      })

      // Only sync the portion from purchased credits to Stripe
      if (consumptionResult.fromPurchased > 0) {
        const purchasedCostInCents = Math.round(
          (costInCents * consumptionResult.fromPurchased) / creditsUsed,
        )
        syncMessageToStripe({
          messageId: params.messageId,
          userId: params.userId,
          costInCents: purchasedCostInCents,
          finishedAt: params.finishedAt,
          logger,
        }).catch((syncError) => {
          logger.error(
            { messageId: params.messageId, error: syncError },
            'Background Stripe sync failed.',
          )
        })
      } else if (VERBOSE) {
        logger.debug(
          { messageId: params.messageId },
          'Skipping Stripe sync (no purchased credits used)',
        )
      }

      return creditsUsed
    },
  )
}
