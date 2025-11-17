import { env } from '@codebuff/internal/env'

import {
  consumeCreditsForMessage,
  extractRequestMetadata,
  insertMessageToBigQuery,
} from './helpers'

import type { UsageData } from './helpers'
import type { InsertMessageBigqueryFn } from '@codebuff/common/types/contracts/bigquery'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export const OPENAI_SUPPORTED_MODELS = ['gpt-5'] as const
export type OpenAIModel = (typeof OPENAI_SUPPORTED_MODELS)[number]

const INPUT_TOKEN_COSTS: Record<OpenAIModel, number> = {
  'gpt-5': 1.25,
} as const
const CACHED_INPUT_TOKEN_COSTS: Record<OpenAIModel, number> = {
  'gpt-5': 0.125,
} as const
const OUTPUT_TOKEN_COSTS: Record<OpenAIModel, number> = {
  'gpt-5': 10,
} as const

type OpenAIUsage = {
  prompt_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number } | null
  completion_tokens?: number
  completion_tokens_details?: { reasoning_tokens?: number } | null
  total_tokens?: number
  // We will inject cost fields below
  cost?: number
  cost_details?: { upstream_inference_cost?: number | null } | null
}

function extractUsageAndCost(
  usage: OpenAIUsage,
  model: OpenAIModel,
): UsageData {
  const inputTokenCost = INPUT_TOKEN_COSTS[model]
  const cachedInputTokenCost = CACHED_INPUT_TOKEN_COSTS[model]
  const outputTokenCost = OUTPUT_TOKEN_COSTS[model]

  const inTokens = usage.prompt_tokens ?? 0
  const cachedInTokens = usage.prompt_tokens_details?.cached_tokens ?? 0
  const outTokens = usage.completion_tokens ?? 0
  const cost =
    (inTokens / 1_000_000) * inputTokenCost +
    (cachedInTokens / 1_000_000) * cachedInputTokenCost +
    (outTokens / 1_000_000) * outputTokenCost

  return {
    inputTokens: inTokens,
    outputTokens: outTokens,
    cacheReadInputTokens: cachedInTokens,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    cost,
  }
}

export async function handleOpenAINonStream({
  body,
  userId,
  agentId,
  fetch,
  logger,
  insertMessageBigquery,
}: {
  body: any
  userId: string
  agentId: string
  fetch: typeof globalThis.fetch
  logger: Logger
  insertMessageBigquery: InsertMessageBigqueryFn
}) {
  const startTime = new Date()
  const { clientId, clientRequestId } = extractRequestMetadata({ body, logger })

  const { model } = body
  const modelShortName =
    typeof model === 'string' ? model.split('/')[1] : undefined
  if (
    !modelShortName ||
    !OPENAI_SUPPORTED_MODELS.includes(modelShortName as OpenAIModel)
  ) {
    throw new Error(
      `Unsupported OpenAI model: ${model} (supported models include only: ${OPENAI_SUPPORTED_MODELS.map((m) => `'${m}'`).join(', ')})`,
    )
  }

  // Build OpenAI-compatible body
  const openaiBody: Record<string, unknown> = {
    ...body,
    model: modelShortName,
    stream: false,
  }

  // Transform max_tokens to max_completion_tokens
  openaiBody.max_completion_tokens =
    openaiBody.max_completion_tokens ?? openaiBody.max_tokens
  delete (openaiBody as any).max_tokens

  // Transform reasoning to reasoning_effort
  if (openaiBody.reasoning && typeof openaiBody.reasoning === 'object') {
    const reasoning = openaiBody.reasoning as {
      enabled?: boolean
      effort?: 'high' | 'medium' | 'low'
    }
    const enabled = reasoning.enabled ?? true

    if (enabled) {
      openaiBody.reasoning_effort = reasoning.effort ?? 'medium'
    }
  }
  delete (openaiBody as any).reasoning

  // Remove fields that OpenAI doesn't support
  delete (openaiBody as any).stop
  delete (openaiBody as any).usage
  delete (openaiBody as any).provider
  delete (openaiBody as any).transforms
  delete (openaiBody as any).codebuff_metadata

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(openaiBody),
  })

  if (!response.ok) {
    throw new Error(
      `OpenAI API error: ${response.status} ${response.statusText} ${await response.text()}`,
    )
  }

  const data = await response.json()

  // Extract usage and content from all choices
  const usage: OpenAIUsage = data.usage ?? {}
  const usageData = extractUsageAndCost(usage, modelShortName as OpenAIModel)

  // Inject cost into response
  data.usage.cost = usageData.cost
  data.usage.cost_details = { upstream_inference_cost: null }

  // Collect all response content from all choices into an array
  const responseContents: string[] = []
  if (data.choices && Array.isArray(data.choices)) {
    for (const choice of data.choices) {
      responseContents.push(choice.message?.content ?? '')
    }
  }
  const responseText = JSON.stringify(responseContents)
  const reasoningText = ''

  // BigQuery insert (do not await)
  insertMessageToBigQuery({
    messageId: data.id,
    userId,
    startTime,
    request: body,
    reasoningText,
    responseText,
    usageData,
    logger,
    insertMessageBigquery,
  }).catch((error) => {
    logger.error({ error }, 'Failed to insert message into BigQuery (OpenAI)')
  })

  await consumeCreditsForMessage({
    messageId: data.id,
    userId,
    agentId,
    clientId,
    clientRequestId,
    startTime,
    model: data.model,
    reasoningText,
    responseText,
    usageData,
    byok: false,
    logger,
  })

  return data
}

