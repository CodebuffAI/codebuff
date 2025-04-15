import { models, TEST_USER_ID } from 'common/constants'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { Message } from 'common/types/message'
import { stripeServer } from 'common/src/util/stripe'
import { eq, sql } from 'drizzle-orm'
import { WebSocket } from 'ws'
import Stripe from 'stripe'
import { consumeCredits } from 'common/src/billing/balance-calculator'

import { stripNullCharsFromObject } from '../util/object'
import { INITIAL_RETRY_DELAY, withRetry } from 'common/src/util/promise'
import { getUserCostPerCredit } from 'common/src/billing/conversion'

import { OpenAIMessage } from '@/llm-apis/openai-api'
import { logger, withLoggerContext } from '@/util/logger'
import { SWITCHBOARD } from '@/websockets/server'
import { ClientState } from '@/websockets/switchboard'
import { sendAction } from '@/websockets/websocket-action'

const PROFIT_MARGIN = 0.3

type CostModelKey = keyof (typeof TOKENS_COST_PER_M)['input']

const TOKENS_COST_PER_M = {
  input: {
    [models.sonnet]: 3,
    [models.haiku]: 0.8,
    [models.gpt4o]: 2.5,
    [models.gpt4omini]: 0.15,
    [models.o3mini]: 1.1,
    [models.deepseekChat]: 0.14,
    [models.deepseekReasoner]: 0.55,
    [models.gemini2flash]: 0.1,
  },
  output: {
    [models.sonnet]: 15,
    [models.haiku]: 4,
    [models.gpt4o]: 10.0,
    [models.gpt4omini]: 0.6,
    [models.o3mini]: 4.4,
    [models.deepseekChat]: 0.28,
    [models.deepseekReasoner]: 2.19,
    [models.gemini2flash]: 0.4,
  },
  cache_creation: {
    [models.sonnet]: 3.75,
    [models.haiku]: 1,
  },
  cache_read: {
    [models.sonnet]: 0.3,
    [models.haiku]: 0.08,
    [models.deepseekChat]: 0.014,
    [models.deepseekReasoner]: 0.14,
    [models.gpt4o]: 1.25,
    [models.gpt4omini]: 0.075,
    [models.o3mini]: 0.55,
    [models.gemini2flash]: 0.025,
  },
}

const RELACE_FAST_APPLY_COST = 0.01

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
  return (
    input_tokens * getPerTokenCost(model, 'input') +
    output_tokens * getPerTokenCost(model, 'output') +
    cache_creation_input_tokens * getPerTokenCost(model, 'cache_creation') +
    cache_read_input_tokens * getPerTokenCost(model, 'cache_read')
  )
}

async function syncMessageToStripe(messageData: {
  messageId: string
  userId: string
  monetaryCostInCents: number
  finishedAt: Date
}) {
  const { messageId, userId, monetaryCostInCents, finishedAt } = messageData

  if (!userId || userId === TEST_USER_ID) {
    logger.debug(
      { messageId, userId },
      'Skipping Stripe sync (no user or test user).'
    )
    return
  }

  const logContext = { messageId, userId, monetaryCostInCents }

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
      logger.info(
        logContext,
        `Attempting to sync monetary usage (${monetaryCostInCents} cents) to Stripe Meter Events for customer ${stripeCustomerId}`
      )
      await stripeServer.billing.meterEvents.create({
        event_name: 'credits',
        timestamp: timestamp,
        payload: {
          stripe_customer_id: stripeCustomerId,
          value: monetaryCostInCents.toString(),
          message_id: messageId,
        },
      })
      logger.info(logContext, 'Successfully synced monetary usage to Stripe.')

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
      shouldRetry: (error) => {
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
  request: Message[] | OpenAIMessage[]
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
      })
      .returning()

    if (insertResult.length > 0) {
      logger.debug(
        { messageId: messageId, creditsUsed },
        'Message saved to DB.'
      )
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
        logger.trace(
          {
            clientSessionId: clientSessionId,
            promptId: userInputId,
            credits: creditsUsed,
          },
          'Sent message cost response via WebSocket.'
        )
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

async function updateUserCycleUsage(
  userId: string,
  creditsUsed: number
): Promise<void> {
  if (creditsUsed <= 0) {
    logger.trace(
      { userId, creditsUsed },
      'Skipping user usage update (zero credits).'
    )
    return
  }
  try {
    // Consume from grants in priority order
    const consumed = await consumeCredits(userId, creditsUsed)
    
    if (consumed < creditsUsed) {
      throw new Error(
        `Could only consume ${consumed} of ${creditsUsed} credits due to debt limit. Please add more credits to continue.`
      )
    }

    logger.debug(
      { userId, creditsUsed },
      'Credits consumed from grants.'
    )
  } catch (error) {
    logger.error(
      { userId, creditsUsed, error },
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
  request: Message[] | OpenAIMessage[]
  response: string
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  finishedAt: Date
  latencyMs: number
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

      const monetaryCostInCents = Math.max(
        1,
        Math.round(cost * 100 * (1 + PROFIT_MARGIN))
      )

      const centsPerCredit = await getUserCostPerCredit(value.userId)
      if (centsPerCredit <= 0) {
        logger.error(
          { userId: value.userId, centsPerCredit },
          'Invalid centsPerCredit, cannot calculate internal credits used.'
        )
        return null
      }

      const internalCreditsUsed = Math.max(
        1,
        Math.ceil(monetaryCostInCents / centsPerCredit)
      )

      logger.debug(
        {
          messageId: value.messageId,
          costUSD: cost,
          monetaryCostInCents,
          centsPerCredit,
          internalCreditsUsed,
        },
        'Calculated message cost and credits'
      )

      const savedMessageResult = await insertMessageRecord({
        ...value,
        cost,
        creditsUsed: internalCreditsUsed,
      })

      if (!savedMessageResult || !value.userId) {
        logger.debug(
          { messageId: value.messageId, userId: value.userId },
          'Skipping further processing (no user ID or failed to save message).'
        )
        return null
      }

      updateUserCycleUsage(value.userId, internalCreditsUsed)

      sendCostResponseToClient(
        value.clientSessionId,
        value.userInputId,
        internalCreditsUsed
      )

      syncMessageToStripe({
        messageId: value.messageId,
        userId: value.userId,
        monetaryCostInCents: monetaryCostInCents,
        finishedAt: value.finishedAt,
      }).catch((syncError) => {
        logger.error(
          { messageId: value.messageId, error: syncError },
          'Background Stripe sync failed.'
        )
      })

      return savedMessageResult
    }
  )
