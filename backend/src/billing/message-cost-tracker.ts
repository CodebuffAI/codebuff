import { models } from 'common/constants'
import { OpenAIMessage } from '@/openai-api'
import { Message } from 'common/actions'
import db from 'common/db'
import { stripeServer } from 'common/util/stripe'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'
import { logger, withLoggerContext } from '@/util/logger'
import { pluralize } from 'common/util/string'

const PROFIT_MARGIN = 0.2

// Pricing details:
// - https://www.anthropic.com/pricing#anthropic-api
// - https://openai.com/pricing
const TOKENS_COST_PER_M = {
  input: {
    [models.sonnet]: 3,
    [models.haiku]: 1,
    [models.gpt4o]: 2.5,
    [models.gpt4omini]: 0.15,
  },
  output: {
    [models.sonnet]: 15,
    [models.haiku]: 5,
    [models.gpt4o]: 10.0,
    [models.gpt4omini]: 0.6,
  },
  cache_creation: {
    [models.sonnet]: 3.75,
    [models.haiku]: 1.25,
  },
  cache_read: {
    [models.sonnet]: 0.3,
    [models.haiku]: 0.1,
  },
}

const getPerTokenCost = (
  model: string,
  type: keyof typeof TOKENS_COST_PER_M
): number => {
  // @ts-ignore
  return (TOKENS_COST_PER_M[type][model] ?? 0) / 1_000_000
}

const calcCost = (
  model: string,
  input_tokens: number,
  output_tokens: number,
  cache_creation_input_tokens: number,
  cache_read_input_tokens: number
) => {
  return (
    input_tokens * getPerTokenCost(model, 'input') +
    output_tokens * getPerTokenCost(model, 'output') +
    cache_creation_input_tokens * getPerTokenCost(model, 'cache_creation') +
    cache_read_input_tokens * getPerTokenCost(model, 'cache_read')
  )
}

export const saveMessage = async (value: {
  messageId: string
  userId?: string
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
}) => {
  const cost = calcCost(
    value.model,
    value.inputTokens,
    value.outputTokens,
    value.cacheCreationInputTokens ?? 0,
    value.cacheReadInputTokens ?? 0
  )

  const creditsUsed = Math.round(cost * 100 * (1 + PROFIT_MARGIN))

  const savedMessage = await db.insert(schema.message).values({
    id: value.messageId,
    user_id: value.userId,
    fingerprint_id: value.fingerprintId,
    client_id: value.clientSessionId,
    client_request_id: value.userInputId,
    model: value.model,
    request: value.request,
    response: value.response,
    input_tokens: value.inputTokens,
    output_tokens: value.outputTokens,
    cache_creation_input_tokens: value.cacheCreationInputTokens,
    cache_read_input_tokens: value.cacheReadInputTokens,
    cost: cost.toString(),
    credits: creditsUsed,
    finished_at: value.finishedAt,
  })

  // Report usage to Stripe asynchronously after saving to db
  withLoggerContext(
    { userId: value.userId, messageId: value.messageId },
    async () => {
      if (!value.userId) {
        // logger.debug('No userId provided, skipping usage reporting')
        return
      }

      try {
        const user = await db.query.user.findFirst({
          where: eq(schema.user.id, value.userId),
          columns: {
            stripe_customer_id: true,
            subscription_active: true,
          },
        })
        if (
          !user ||
          !user.stripe_customer_id ||
          !user.subscription_active ||
          !creditsUsed
        ) {
          // logger.debug('No user found or no stripe_customer_id or no active subscription, skipping usage reporting')
          return
        }

        await stripeServer.billing.meterEvents.create({
          event_name: 'credits',
          timestamp: Math.floor(value.finishedAt.getTime() / 1000),
          payload: {
            stripe_customer_id: user.stripe_customer_id,
            value: creditsUsed.toString(),
          },
        })
        // logger.debug(
        //   {
        //     credits: creditsUsed,
        //     // request: value.request,
        //     client_request_id: value.userInputId,
        //     response: value.response,
        //     userId: value.userId,
        //   },
        //   `${pluralize(creditsUsed, 'credit')} reported to Stripe`
        // )
      } catch (error) {
        logger.error({ error, creditsUsed }, 'Failed to report usage to Stripe')
      }
    }
  )

  return savedMessage
}
