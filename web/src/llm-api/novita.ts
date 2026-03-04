import { env } from '@codebuff/internal/env'

import {
  consumeCreditsForMessage,
  extractRequestMetadata,
  insertMessageToBigQuery,
} from './helpers'

import type { UsageData } from './helpers'
import type { InsertMessageBigqueryFn } from '@codebuff/common/types/contracts/bigquery'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ChatCompletionRequestBody } from './types'

// Novita pricing ($/M tokens, based on Novita pricing page)
const INPUT_TOKEN_COSTS: Record<string, number> = {
  'deepseek/deepseek-r1': 0.6,
  'deepseek/deepseek-v3.2': 0.269,
  'deepseek/deepseek-v3': 0.269, // alias
  'zai-org/glm-5': 1.0,
  'minimax/minimax-m2.5': 0.3,
  'meta-llama/llama-3.3-70b-instruct': 0.6,
  'default': 0.6,
} as const

const OUTPUT_TOKEN_COSTS: Record<string, number> = {
  'deepseek/deepseek-r1': 2.4,
  'deepseek/deepseek-v3.2': 0.4,
  'deepseek/deepseek-v3': 0.4, // alias
  'zai-org/glm-5': 3.2,
  'minimax/minimax-m2.5': 1.2,
  'meta-llama/llama-3.3-70b-instruct': 2.4,
  'default': 2.4,
} as const

function extractUsageAndCost(
  usage: any,
  model: string,
): UsageData {
  const inputTokenCost = INPUT_TOKEN_COSTS[model] ?? INPUT_TOKEN_COSTS['default']
  const outputTokenCost = OUTPUT_TOKEN_COSTS[model] ?? OUTPUT_TOKEN_COSTS['default']

  const inTokens = usage.prompt_tokens ?? 0
  const outTokens = usage.completion_tokens ?? 0
  const cost =
    (inTokens / 1_000_000) * inputTokenCost +
    (outTokens / 1_000_000) * outputTokenCost

  return {
    inputTokens: inTokens,
    outputTokens: outTokens,
    cacheReadInputTokens: 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    cost,
  }
}

export async function handleNovitaNonStream({
  body,
  userId,
  stripeCustomerId,
  agentId,
  fetch,
  logger,
  insertMessageBigquery,
}: {
  body: ChatCompletionRequestBody
  userId: string
  stripeCustomerId?: string | null
  agentId: string
  fetch: typeof globalThis.fetch
  logger: Logger
  insertMessageBigquery: InsertMessageBigqueryFn
}) {
  const startTime = new Date()
  const { clientId, clientRequestId, costMode } = extractRequestMetadata({
    body,
    logger,
  })

  const { model } = body
  // model is something like "novita/deepseek/deepseek-r1"
  const novitaModel = model.startsWith('novita/') ? model.slice(7) : model

  // Build Novita-compatible body
  const novitaBody: Record<string, unknown> = {
    ...body,
    model: novitaModel,
    stream: false,
  }

  // Remove fields that Novita/OpenAI doesn't support
  delete novitaBody.usage
  delete novitaBody.provider
  delete novitaBody.transforms
  delete novitaBody.codebuff_metadata

  const response = await fetch('https://api.novita.ai/openai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.NOVITA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(novitaBody),
  })

  if (!response.ok) {
    throw new Error(
      `Novita API error: ${response.status} ${response.statusText} ${await response.text()}`,
    )
  }

  const data = await response.json()

  const usage = data.usage ?? {}
  const usageData = extractUsageAndCost(usage, novitaModel)

  data.usage.cost = usageData.cost
  data.usage.cost_details = { upstream_inference_cost: null }

  const responseContents: string[] = []
  if (data.choices && Array.isArray(data.choices)) {
    for (const choice of data.choices) {
      responseContents.push(choice.message?.content ?? '')
    }
  }
  const responseText = JSON.stringify(responseContents)
  const reasoningText = data.choices?.[0]?.message?.reasoning_content ?? ''

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
    logger.error({ error }, 'Failed to insert message into BigQuery (Novita)')
  })

  await consumeCreditsForMessage({
    messageId: data.id,
    userId,
    stripeCustomerId,
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
    costMode,
  })

  return {
    ...data,
    choices: [
      {
        index: 0,
        message: { content: responseContents[0] ?? '', role: 'assistant' },
        finish_reason: 'stop',
      },
    ],
  }
}
