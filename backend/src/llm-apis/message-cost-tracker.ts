import { models, TEST_USER_ID } from 'common/constants'
import { OpenAIMessage } from '@/llm-apis/openai-api'
import { Message } from 'common/types/message'
import db from 'common/db'
import { stripeServer } from 'common/util/stripe'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'
import { logger, withLoggerContext } from '@/util/logger'
import { SWITCHBOARD } from '@/websockets/server'
import { sendAction } from '@/websockets/websocket-action'
import { ClientState } from '@/websockets/switchboard'
import { WebSocket } from 'ws'
import { stripNullChars } from 'common/util/string'

const PROFIT_MARGIN = 0.2

// Pricing details:
// - https://www.anthropic.com/pricing#anthropic-api
// - https://openai.com/pricing
// - https://ai.google.dev/pricing
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
  // @ts-ignore
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

      const creditsUsed = Math.round(cost * 100 * (1 + PROFIT_MARGIN))

      if (!value.userId || value.userId === TEST_USER_ID) {
        return null
      }

      // Clean request messages by converting to JSON and back to remove null chars
      const cleanRequest = JSON.parse(
        stripNullChars(JSON.stringify(value.request))
      )

      const savedMessage = await db.insert(schema.message).values({
        id: value.messageId,
        user_id: value.userId,
        fingerprint_id: value.fingerprintId,
        client_id: value.clientSessionId,
        client_request_id: value.userInputId,
        model: value.model,
        request: cleanRequest,
        response: stripNullChars(value.response),
        input_tokens: value.inputTokens,
        output_tokens: value.outputTokens,
        cache_creation_input_tokens: value.cacheCreationInputTokens,
        cache_read_input_tokens: value.cacheReadInputTokens,
        cost: cost.toString(),
        credits: creditsUsed,
        finished_at: value.finishedAt,
        latency_ms: value.latencyMs,
      })

      try {
        const user = await db.query.user.findFirst({
          where: eq(schema.user.id, value.userId),
          columns: {
            stripe_customer_id: true,
            subscription_active: true,
          },
        })

        // Find WebSocket connection using existing clientSessionId
        const clientEntry = Array.from(SWITCHBOARD.clients.entries()).find(
          ([_, state]: [WebSocket, ClientState]) =>
            state.sessionId === value.clientSessionId
        )

        if (!clientEntry) {
          logger.warn(
            { clientSessionId: value.clientSessionId },
            'No WebSocket connection found'
          )
          return savedMessage
        }

        const [ws] = clientEntry
        
        // Check if the WebSocket is still open before sending
        if (ws.readyState === WebSocket.OPEN) {
          // Send immediate message cost response
          sendAction(ws, {
            type: 'message-cost-response',
            promptId: value.userInputId,
            credits: creditsUsed,
          })
        } else {
          logger.warn(
            { clientSessionId: value.clientSessionId },
            'WebSocket connection not in OPEN state'
          )
        }

        if (
          !user ||
          !user.stripe_customer_id ||
          !user.subscription_active ||
          !creditsUsed
        ) {
          return savedMessage
        }

        await stripeServer.billing.meterEvents.create({
          event_name: 'credits',
          timestamp: Math.floor(value.finishedAt.getTime() / 1000),
          payload: {
            stripe_customer_id: user.stripe_customer_id,
            value: creditsUsed.toString(),
          },
        })
      } catch (error) {
        logger.error({ error, creditsUsed }, 'Failed to report usage to Stripe')
      }

      return savedMessage
    }
  )
