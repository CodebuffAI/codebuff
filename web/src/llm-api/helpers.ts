import { setupBigQuery } from '@codebuff/bigquery'
import {
  consumeCreditsAndAddAgentStep,
  recordMessageWithoutBilling,
} from '@codebuff/billing'
import {
  isFreeAgent,
  isFreeMode,
  isFreeModeAllowedAgentModel,
} from '@codebuff/common/constants/free-agents'
import { PROFIT_MARGIN } from '@codebuff/common/old-constants'

import type { InsertMessageBigqueryFn } from '@codebuff/common/types/contracts/bigquery'
import type { Logger } from '@codebuff/common/types/contracts/logger'

import type { ChatCompletionRequestBody } from './types'

export type UsageData = {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  reasoningTokens: number
  cost: number
}

export function createRequestAuditRecord(body: unknown) {
  // TODO: Add a separate append-only message_request BigQuery table for full
  // raw request bodies, inserted before streaming starts. Keeping only this
  // summary here avoids retaining huge chat requests until provider streams end.
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { invalid_request_shape: true }
  }

  const typedBody = body as Partial<ChatCompletionRequestBody>
  const messages = Array.isArray(typedBody.messages)
    ? typedBody.messages
    : undefined
  const tools = Array.isArray(typedBody.tools) ? typedBody.tools : undefined

  const messageRoleCounts = messages?.reduce<Record<string, number>>(
    (counts, message) => {
      const role =
        typeof message === 'object' && message !== null && 'role' in message
          ? String(message.role)
          : 'unknown'
      counts[role] = (counts[role] ?? 0) + 1
      return counts
    },
    {},
  )

  return {
    model: typeof typedBody.model === 'string' ? typedBody.model : undefined,
    stream:
      typeof typedBody.stream === 'boolean' ? typedBody.stream : undefined,
    temperature:
      typeof typedBody.temperature === 'number'
        ? typedBody.temperature
        : undefined,
    max_tokens:
      typeof typedBody.max_tokens === 'number'
        ? typedBody.max_tokens
        : undefined,
    max_completion_tokens:
      typeof typedBody.max_completion_tokens === 'number'
        ? typedBody.max_completion_tokens
        : undefined,
    top_p: typeof typedBody.top_p === 'number' ? typedBody.top_p : undefined,
    reasoning_effort:
      typeof typedBody.reasoning_effort === 'string'
        ? typedBody.reasoning_effort
        : undefined,
    reasoning_enabled:
      typeof typedBody.reasoning?.enabled === 'boolean'
        ? typedBody.reasoning.enabled
        : undefined,
    reasoning_effort_nested:
      typeof typedBody.reasoning?.effort === 'string'
        ? typedBody.reasoning.effort
        : undefined,
    usage_include:
      typeof typedBody.usage?.include === 'boolean'
        ? typedBody.usage.include
        : undefined,
    codebuff_metadata:
      typeof typedBody.codebuff_metadata === 'object' &&
      typedBody.codebuff_metadata !== null
        ? { ...typedBody.codebuff_metadata }
        : undefined,
    message_count: messages?.length ?? 0,
    message_role_counts: messageRoleCounts,
    messages_omitted: !!messages,
    tool_count: tools?.length ?? 0,
    tool_names: tools
      ?.map((tool) =>
        typeof tool === 'object' && tool !== null
          ? tool.function?.name
          : undefined,
      )
      .filter((name): name is string => typeof name === 'string'),
    tools_omitted: !!tools,
  }
}

export function extractRequestMetadata(params: {
  body: unknown
  logger: Logger
}) {
  const { body, logger } = params

  const typedBody = body as ChatCompletionRequestBody | undefined
  const metadata = typedBody?.codebuff_metadata

  const rawClientId = metadata?.client_id
  const clientId = typeof rawClientId === 'string' ? rawClientId : null
  if (!clientId) {
    logger.warn(
      { request: createRequestAuditRecord(body) },
      'Received request without client_id',
    )
  }

  const rawRunId = metadata?.run_id
  const clientRequestId: string | null =
    typeof rawRunId === 'string' ? rawRunId : null
  if (!clientRequestId) {
    logger.warn(
      { request: createRequestAuditRecord(body) },
      'Received request without run_id',
    )
  }

  const n = metadata?.n
  const rawCostMode = metadata?.cost_mode
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
  ttftMs?: number | null
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
    ttftMs,
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

  const credits =
    isFreeModeAndAllowed || isFreeAgentSmallRequest ? 0 : initialCredits

  if (isFreeModeAndAllowed) {
    await recordMessageWithoutBilling({
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
      credits: 0,
      inputTokens: usageData.inputTokens,
      cacheCreationInputTokens: null,
      cacheReadInputTokens: usageData.cacheReadInputTokens,
      reasoningTokens:
        usageData.reasoningTokens > 0 ? usageData.reasoningTokens : null,
      outputTokens: usageData.outputTokens,
      byok,
      logger,
      ttftMs: ttftMs ?? null,
    })
    return 0
  }

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
    ttftMs: ttftMs ?? null,
  })

  return credits
}
