import { setupBigQuery } from '@codebuff/bigquery'
import { consumeCreditsAndAddAgentStep } from '@codebuff/billing'
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
  return { clientId, clientRequestId, ...(n && { n }) }
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
}) {
  const {
    messageId,
    userId,
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
  } = params

  await consumeCreditsAndAddAgentStep({
    messageId,
    userId,
    agentId,
    clientId,
    clientRequestId,
    startTime,
    model,
    reasoningText,
    response: responseText,
    cost: usageData.cost,
    credits: Math.round(usageData.cost * 100 * (1 + PROFIT_MARGIN)),
    inputTokens: usageData.inputTokens,
    cacheCreationInputTokens: null,
    cacheReadInputTokens: usageData.cacheReadInputTokens,
    reasoningTokens:
      usageData.reasoningTokens > 0 ? usageData.reasoningTokens : null,
    outputTokens: usageData.outputTokens,
    byok,
    logger,
  })
}
