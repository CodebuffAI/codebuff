import { setupBigQuery } from '@codebuff/bigquery'
import { consumeCreditsAndAddAgentStep } from '@codebuff/billing'
import {
  isFreeAgent,
  isFreeMode,
  isFreeModeAllowedAgentModel,
} from '@codebuff/common/constants/free-agents'
import { PROFIT_MARGIN } from '@codebuff/common/old-constants'

import type { InsertMessageBigqueryFn } from '@codebuff/common/types/contracts/bigquery'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export type UsageData = {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  reasoningTokens: number
  cost: number
}

export function extractRequestMetadata(params: {
  body: unknown
  logger: Logger
}) {
  const { body, logger } = params

  const rawClientId = (body as any)?.codebuff_metadata?.client_id
  const clientId = typeof rawClientId === 'string' ? rawClientId : null
  if (!clientId) {
    logger.warn({ body }, 'Received request without client_id')
  }

  const rawRunId = (body as any)?.codebuff_metadata?.run_id
  const clientRequestId: string | null =
    typeof rawRunId === 'string' ? rawRunId : null
  if (!clientRequestId) {
    logger.warn({ body }, 'Received request without run_id')
  }

  const n = (body as any)?.codebuff_metadata?.n
  const rawCostMode = (body as any)?.codebuff_metadata?.cost_mode
  const costMode = typeof rawCostMode === 'string' ? rawCostMode : undefined
  return { clientId, clientRequestId, costMode, ...(n && { n }) }
}

export async function insertMessageToBigQuery(params: {
  messageId: string
  userId: string
  startTime: Date
  request: unknown
  reasoningText: string
  responseText: string
  usageData: UsageData
  logger: Logger
  insertMessageBigquery: InsertMessageBigqueryFn
}) {
  const {
    messageId,
    userId,
    startTime,
    request,
    reasoningText,
    responseText,
    usageData,
    logger,
    insertMessageBigquery,
  } = params

  await setupBigQuery({ logger })
  const success = await insertMessageBigquery({
    row: {
      id: messageId,
      user_id: userId,
      finished_at: new Date(),
      created_at: startTime,
      request,
      reasoning_text: reasoningText,
      response: responseText,
      output_tokens: usageData.outputTokens,
      reasoning_tokens:
        usageData.reasoningTokens > 0 ? usageData.reasoningTokens : undefined,
      cost: usageData.cost,
      upstream_inference_cost: undefined,
      input_tokens: usageData.inputTokens,
      cache_read_input_tokens:
        usageData.cacheReadInputTokens > 0
          ? usageData.cacheReadInputTokens
          : undefined,
    },
    logger,
  })
  if (!success) {
    logger.error({ request }, 'Failed to insert message into BigQuery')
  }
}

export async function consumeCreditsForMessage(params: {
  messageId: string
  userId: string
  stripeCustomerId?: string | null
  agentId: string
  clientId: string | null
  clientRequestId: string | null
  startTime: Date
  model: string
  reasoningText: string
  responseText: string
  usageData: UsageData
  byok: boolean
  logger: Logger
  costMode?: string
}): Promise<number> {
  const {
    messageId,
    userId,
    stripeCustomerId,
    agentId,
    clientId,
    clientRequestId,
    startTime,
    model,
    reasoningText,
    responseText,
    usageData,
    byok,
    logger,
    costMode,
  } = params

  // Calculate initial credits based on cost
  const initialCredits = Math.round(usageData.cost * 100 * (1 + PROFIT_MARGIN))

  // FREE mode: only specific agents using their expected models cost 0 credits
  // This is the strictest check - validates:
  // 1. The cost mode is 'free'
  // 2. The agent is in the allowed free-mode agents list
  // 3. The model matches what that specific agent is allowed to use
  // 4. The agent is either internal or published by 'codebuff' (prevents publisher spoofing)
  const isFreeModeAndAllowed =
    isFreeMode(costMode) && isFreeModeAllowedAgentModel(agentId, model)

  // Free tier agents (like file-picker) also don't charge credits for small requests
  // This is separate from FREE mode and helps with BYOK users
  // Also validates publisher to prevent spoofing attacks
  const isFreeAgentSmallRequest = isFreeAgent(agentId) && initialCredits < 5

  const credits = isFreeModeAndAllowed || isFreeAgentSmallRequest ? 0 : initialCredits

  await consumeCreditsAndAddAgentStep({
    messageId,
    userId,
    stripeCustomerId,
    agentId,
    clientId,
    clientRequestId,
    startTime,
    model,
    reasoningText,
    response: responseText,
    cost: usageData.cost,
    credits,
    inputTokens: usageData.inputTokens,
    cacheCreationInputTokens: null,
    cacheReadInputTokens: usageData.cacheReadInputTokens,
    reasoningTokens:
      usageData.reasoningTokens > 0 ? usageData.reasoningTokens : null,
    outputTokens: usageData.outputTokens,
    byok,
    logger,
  })

  return credits
}
