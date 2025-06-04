import { consumeCredits, getUserCostPerCredit } from '@codebuff/billing'
import { consumeOrganizationCredits } from '@codebuff/billing/src/org-billing'
import { CoreMessage } from 'ai'
import { trackEvent } from 'common/analytics'
import { models, TEST_USER_ID } from 'common/constants'
import { AnalyticsEvent } from 'common/constants/analytics-events'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { withRetry } from 'common/src/util/promise'
import { stripeServer } from 'common/src/util/stripe'
import { Message } from 'common/types/message'
import { eq, sql } from 'drizzle-orm'
import Stripe from 'stripe'
import { WebSocket } from 'ws'

import { stripNullCharsFromObject } from '../util/object'
import { getRequestContext } from '../websockets/request-context'

import { OpenAIMessage } from '@/llm-apis/openai-api'
import { logger, withLoggerContext } from '@/util/logger'
import { SWITCHBOARD } from '@/websockets/server'
import { ClientState } from '@/websockets/switchboard'
import { sendAction } from '@/websockets/websocket-action'

const PROFIT_MARGIN = 0.3

// Pricing details:
// - https://www.anthropic.com/pricing#anthropic-api
// - https://openai.com/pricing
// - https://ai.google.dev/pricing
type CostModelKey = keyof (typeof TOKENS_COST_PER_M)['input']
const TOKENS_COST_PER_M = {
  input: {
    [models.sonnet]: 3,
    [models.sonnet3_7]: 3,
    [models.haiku]: 0.8,
    [models.gpt4o]: 2.5,
    [models.gpt4_1]: 2,
    [models.gpt4omini]: 0.15,
    [models.o3]: 10.0,
    [models.o3mini]: 1.1,
    [models.o4mini]: 1.1,
    [models.deepseekChat]: 0.14,
    [models.deepseekReasoner]: 0.55,
    [models.gemini2flash]: 0.1,
    [models.gemini2_5_flash]: 0.15,
    [models.gemini2_5_flash_thinking]: 0.15,
    [models.ft_filepicker_003]: 0.1,
    [models.ft_filepicker_005]: 0.1,
    [models.openrouter_gemini2_5_pro_preview]: 1.25,
  },
  output: {
    [models.sonnet]: 15,
    [models.sonnet3_7]: 15,
    [models.haiku]: 4,
    [models.gpt4o]: 10.0,
    [models.gpt4_1]: 8,
    [models.gpt4omini]: 0.6,
    [models.o3]: 40.0,
    [models.o3mini]: 4.4,
    [models.o4mini]: 1.1,
    [models.deepseekChat]: 0.28,
    [models.deepseekReasoner]: 2.19,
    [models.gemini2flash]: 0.4,
    [models.gemini2_5_flash]: 0.6,
    [models.gemini2_5_flash_thinking]: 3.5,
    [models.ft_filepicker_003]: 0.4,
    [models.ft_filepicker_005]: 0.4,
    [models.openrouter_gemini2_5_pro_preview]: 10,
  },
  cache_creation: {
    [models.sonnet]: 3.75,
    [models.sonnet3_7]: 3.75,
    [models.haiku]: 1,
  },
  cache_read: {
    [models.sonnet]: 0.3,
    [models.sonnet3_7]: 0.3,
    [models.haiku]: 0.08,
    [models.deepseekChat]: 0.014,
    [models.deepseekReasoner]: 0.14,
    [models.gpt4o]: 1.25,
    [models.gpt4_1]: 0.5,
    [models.gpt4omini]: 0.075,
    [models.o3]: 2.5,
    [models.o3mini]: 0.55,
    [models.o4mini]: 0.275,
    [models.gemini2flash]: 0.025,
    [models.gemini2_5_flash]: 0.0375,
    [models.gemini2_5_flash_thinking]: 0.2625,
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
  output_tokens: number
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

const getPerTokenCost = (
  model: string,
  type: keyof typeof TOKENS_COST_PER_M
): number => {
  const costMap = TOKENS_COST_PER_M[type] as Record<CostModelKey, number>
  return (costMap[model as CostModelKey] ?? 0) / 1_000_000
}

const calcCost = (
  model: string,
  input_tokens: number,
  output_tokens: number,
  cache_creation_input_tokens: number,
  cache_read_input_tokens: number
) => {
  if (model === 'relace-fast-apply') {
    return RELACE_FAST_APPLY_COST
  }
  if (model === models.gemini2_5_pro_preview) {
    return (
      getGemini25ProPreviewCost(input_tokens, output_tokens) +
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

async function syncMessageToStripe(messageData: {
  messageId: string
  userId: string
  costInCents: number
  finishedAt: Date
}) {
  const { messageId, userId, costInCents, finishedAt } = messageData

  if (!userId || userId === TEST_USER_ID) {
    if (VERBOSE) {
      logger.debug(
        { messageId, userId },
        'Skipping Stripe sync (no user or test user).'
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
        'Cannot sync usage to Stripe: User has no stripe_customer_id.'
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
        .where(eq(schema.syncFailure.message_id, messageId))
        .catch((err) =>
          logger.error(
            { ...logContext, error: err },
            'Error deleting sync failure record after successful sync.'
          )
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
            'Retrying Stripe sync due to error.'
          )
          return true
        }
        logger.error(
          { ...logContext, error: error.message, type: error.type },
          'Non-retriable error during Stripe sync.'
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
      'Failed to sync usage to Stripe after retries.'
    )
    await logSyncFailure(messageId, errorMessage)
  }
}

async function logSyncFailure(messageId: string, errorMessage: string) {
  try {
    await db
      .insert(schema.syncFailure)
      .values({
        message_id: messageId,
        last_error: errorMessage,
        last_attempt_at: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.syncFailure.message_id,
        set: {
          last_error: errorMessage,
          last_attempt_at: new Date(),
          retry_count: sql`${schema.syncFailure.retry_count} + 1`,
        },
      })
    logger.info({ messageId }, 'Logged sync failure to database.')
  } catch (dbError) {
    logger.error(
      { messageId, error: dbError },
      'Failed to log sync failure to database.'
    )
  }
}

type InsertMessageParams = {
  messageId: string
  userId: string | undefined
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  model: string
  request: Message[] | OpenAIMessage[] | CoreMessage[]
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

async function insertMessageRecord(
  params: InsertMessageParams
): Promise<typeof schema.message.$inferSelect | null> {
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

  try {
    const insertResult = await db
      .insert(schema.message)
      .values({
        ...stripNullCharsFromObject({
          id: messageId,
          user_id: userId,
          fingerprint_id: fingerprintId,
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

    if (insertResult.length > 0) {
      return insertResult[0]
    } else {
      logger.error(
        { messageId: messageId },
        'Failed to insert message into DB (no rows returned).'
      )
      return null
    }
  } catch (dbError) {
    logger.error(
      { messageId: messageId, error: dbError },
      'Error saving message to DB.'
    )
    return null
  }
}

async function sendCostResponseToClient(
  clientSessionId: string,
  userInputId: string,
  creditsUsed: number
): Promise<void> {
  try {
    const clientEntry = Array.from(SWITCHBOARD.clients.entries()).find(
      ([_, state]: [WebSocket, ClientState]) =>
        state.sessionId === clientSessionId
    )

    if (clientEntry) {
      const [ws] = clientEntry
      if (ws.readyState === WebSocket.OPEN) {
        sendAction(ws, {
          type: 'message-cost-response',
          promptId: userInputId,
          credits: creditsUsed,
        })
      } else {
        logger.warn(
          { clientSessionId: clientSessionId },
          'WebSocket connection not in OPEN state when trying to send cost response.'
        )
      }
    } else {
      logger.warn(
        { clientSessionId: clientSessionId },
        'No WebSocket connection found for cost response.'
      )
    }
  } catch (wsError) {
    logger.error(
      { clientSessionId: clientSessionId, error: wsError },
      'Error sending message cost response via WebSocket.'
    )
  }
}

type CreditConsumptionResult = {
  consumed: number
  fromPurchased: number
}

async function updateUserCycleUsage(
  userId: string,
  creditsUsed: number
): Promise<CreditConsumptionResult> {
  if (creditsUsed <= 0) {
    if (VERBOSE) {
      logger.debug(
        { userId, creditsUsed },
        'Skipping user usage update (zero credits).'
      )
    }
    return { consumed: 0, fromPurchased: 0 }
  }

  // Check if this should be billed to an organization
  const requestContext = getRequestContext()
  const orgId = requestContext?.approvedOrgIdForRepo

  try {
    if (orgId) {
      // Consume from organization credits
      const result = await consumeOrganizationCredits(orgId, creditsUsed)

      if (VERBOSE) {
        logger.debug(
          { userId, orgId, creditsUsed, ...result },
          `Consumed organization credits (${creditsUsed})`
        )
      }

      trackEvent(AnalyticsEvent.CREDIT_CONSUMED, userId, {
        creditsUsed,
        fromPurchased: result.fromPurchased,
        organizationId: orgId,
      })

      return result
    } else {
      // Consume from personal credits
      const result = await consumeCredits(userId, creditsUsed)

      if (VERBOSE) {
        logger.debug(
          { userId, creditsUsed, ...result },
          `Consumed personal credits (${creditsUsed})`
        )
      }

      trackEvent(AnalyticsEvent.CREDIT_CONSUMED, userId, {
        creditsUsed,
        fromPurchased: result.fromPurchased,
      })

      return result
    }
  } catch (error) {
    logger.error(
      { userId, orgId, creditsUsed, error },
      'Error consuming credits.'
    )
    throw error
  }
}

export const saveMessage = async (value: {
  messageId: string
  userId: string | undefined
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  model: string
  request: Message[] | OpenAIMessage[] | CoreMessage[]
  response: string
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  finishedAt: Date
  latencyMs: number
  usesUserApiKey?: boolean
  chargeUser?: boolean
}) =>
  withLoggerContext(
    {
      messageId: value.messageId,
      userId: value.userId,
      fingerprintId: value.fingerprintId,
    },
    async () => {
      const cost = calcCost(
        value.model,
        value.inputTokens,
        value.outputTokens,
        value.cacheCreationInputTokens ?? 0,
        value.cacheReadInputTokens ?? 0
      )

      // Default to 1 cent per credit
      let centsPerCredit = 1
      if (value.userId) {
        centsPerCredit = await getUserCostPerCredit(value.userId)
      }

      const costInCents =
        value.chargeUser ?? true // default to true
          ? Math.max(
              0,
              Math.round(
                cost *
                  100 *
                  (value.usesUserApiKey ? PROFIT_MARGIN : 1 + PROFIT_MARGIN)
              )
            )
          : 0

      const creditsUsed = Math.max(0, costInCents)

      if (value.userId === TEST_USER_ID) {
        logger.info(
          {
            costUSD: cost,
            costInCents,
            creditsUsed,
            centsPerCredit,
            value: { ...value, request: 'Omitted', response: 'Omitted' },
          },
          `Credits used by test user (${creditsUsed})`
        )
        return
      }

      if (VERBOSE) {
        logger.debug(
          {
            messageId: value.messageId,
            costUSD: cost,
            costInCents,
            creditsUsed,
            centsPerCredit,
          },
          `Calculated credits (${creditsUsed})`
        )
      }

      sendCostResponseToClient(
        value.clientSessionId,
        value.userInputId,
        creditsUsed
      )

      const savedMessageResult = await insertMessageRecord({
        ...value,
        cost,
        creditsUsed,
      })

      if (!savedMessageResult || !value.userId) {
        logger.debug(
          { messageId: value.messageId, userId: value.userId },
          'Skipping further processing (no user ID or failed to save message).'
        )
        return null
      }

      const consumptionResult = await updateUserCycleUsage(
        value.userId,
        creditsUsed
      )

      // Only sync the portion from purchased credits to Stripe
      if (consumptionResult.fromPurchased > 0) {
        const purchasedCostInCents = Math.round(
          (costInCents * consumptionResult.fromPurchased) / creditsUsed
        )
        syncMessageToStripe({
          messageId: value.messageId,
          userId: value.userId,
          costInCents: purchasedCostInCents,
          finishedAt: value.finishedAt,
        }).catch((syncError) => {
          logger.error(
            { messageId: value.messageId, error: syncError },
            'Background Stripe sync failed.'
          )
        })
      } else if (VERBOSE) {
        logger.debug(
          { messageId: value.messageId },
          'Skipping Stripe sync (no purchased credits used)'
        )
      }

      return savedMessageResult
    }
  )
