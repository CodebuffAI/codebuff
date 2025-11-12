import { setupBigQuery } from '@codebuff/bigquery'
import { consumeCreditsAndAddAgentStep } from '@codebuff/billing'
import { PROFIT_MARGIN } from '@codebuff/common/old-constants'
import { getErrorObject } from '@codebuff/common/util/error'
import { env } from '@codebuff/internal/env'

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

type StreamState = { responseText: string; reasoningText: string }

function extractRequestMetadata(params: { body: unknown; logger: Logger }) {
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
  return { clientId, clientRequestId }
}

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

function computeCostDollars(usage: OpenAIUsage, model: OpenAIModel): number {
  const inputTokenCost = INPUT_TOKEN_COSTS[model]
  const cachedInputTokenCost = CACHED_INPUT_TOKEN_COSTS[model]
  const outputTokenCost = OUTPUT_TOKEN_COSTS[model]

  const inTokens = usage.prompt_tokens ?? 0
  const cachedInTokens = usage.prompt_tokens_details?.cached_tokens ?? 0
  const outTokens = usage.completion_tokens ?? 0
  return (
    (inTokens / 1_000_000) * inputTokenCost +
    (cachedInTokens / 1_000_000) * cachedInputTokenCost +
    (outTokens / 1_000_000) * outputTokenCost
  )
}

export async function handleOpenAIStream({
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
    stream: true,
  }
  // Ensure usage in final chunk
  const streamOptions = (openaiBody.stream_options as any) ?? {}
  streamOptions.include_usage = true
  openaiBody.stream_options = streamOptions

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

  const reader = response.body?.getReader?.()
  if (!reader) {
    throw new Error('Failed to get response reader')
  }

  let heartbeatInterval: NodeJS.Timeout
  let state: StreamState = { responseText: '', reasoningText: '' }
  let clientDisconnected = false

  const stream = new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder()
      let buffer = ''

      controller.enqueue(
        new TextEncoder().encode(`: connected ${new Date().toISOString()}\n`),
      )

      heartbeatInterval = setInterval(() => {
        if (!clientDisconnected) {
          try {
            controller.enqueue(
              new TextEncoder().encode(
                `: heartbeat ${new Date().toISOString()}\n\n`,
              ),
            )
          } catch {}
        }
      }, 30000)

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          let lineEnd = buffer.indexOf('\n')

          while (lineEnd !== -1) {
            let line = buffer.slice(0, lineEnd + 1)
            buffer = buffer.slice(lineEnd + 1)

            const handled = await handleOpenAILine({
              userId,
              agentId,
              clientId,
              clientRequestId,
              startTime,
              request: openaiBody,
              line,
              modelShortName: modelShortName as OpenAIModel,
              state,
              logger,
              insertMessage: insertMessageBigquery,
            })
            state = handled.state
            line = handled.outgoingLine

            if (!clientDisconnected) {
              try {
                controller.enqueue(new TextEncoder().encode(line))
              } catch (error) {
                logger.warn(
                  'Client disconnected during stream, continuing for billing',
                )
                clientDisconnected = true
              }
            }

            lineEnd = buffer.indexOf('\n')
          }
        }

        if (!clientDisconnected) {
          controller.close()
        }
      } catch (error) {
        if (!clientDisconnected) {
          controller.error(error)
        } else {
          logger.warn(
            getErrorObject(error),
            'Error after client disconnect in OpenAI stream',
          )
        }
      } finally {
        clearInterval(heartbeatInterval)
      }
    },
    cancel() {
      clearInterval(heartbeatInterval)
      clientDisconnected = true
      logger.warn(
        { clientDisconnected, state },
        'Client cancelled stream, continuing OpenAI consumption for billing',
      )
    },
  })

  return stream
}

async function handleOpenAILine({
  userId,
  agentId,
  clientId,
  clientRequestId,
  startTime,
  modelShortName,
  request,
  line,
  state,
  logger,
  insertMessage,
}: {
  userId: string
  agentId: string
  clientId: string | null
  clientRequestId: string | null
  startTime: Date
  modelShortName: OpenAIModel
  request: unknown
  line: string
  state: StreamState
  logger: Logger
  insertMessage: InsertMessageBigqueryFn
}): Promise<{ state: StreamState; outgoingLine: string }> {
  if (!line.startsWith('data: ')) {
    return { state, outgoingLine: line }
  }
  const raw = line.slice('data: '.length)
  if (raw === '[DONE]\n') {
    return { state, outgoingLine: line }
  }

  let obj: any
  try {
    obj = JSON.parse(raw)
  } catch (error) {
    logger.warn(
      `Received non-JSON OpenAI response: ${JSON.stringify(getErrorObject(error), null, 2)}`,
    )
    return { state, outgoingLine: line }
  }

  // Accumulate text
  try {
    const choice =
      Array.isArray(obj.choices) && obj.choices.length
        ? obj.choices[0]
        : undefined
    const delta = choice?.delta
    if (delta) {
      if (typeof delta.content === 'string') state.responseText += delta.content
      // OpenAI may not provide reasoning delta in standard chat completions; keep parity
      if (typeof delta.reasoning === 'string')
        state.reasoningText += delta.reasoning
    }
  } catch {}

  // If usage present, it's the final chunk. Compute cost, log, and consume credits.
  if (obj && obj.usage) {
    const usage: OpenAIUsage = obj.usage
    const cost = computeCostDollars(usage, modelShortName)
    obj.usage.cost = cost
    obj.usage.cost_details = { upstream_inference_cost: null }

    // BigQuery insert (do not await)
    setupBigQuery({ logger }).then(async () => {
      const success = await insertMessage({
        row: {
          id: obj.id,
          user_id: userId,
          finished_at: new Date(),
          created_at: startTime,
          request,
          reasoning_text: state.reasoningText,
          response: state.responseText,
          output_tokens: usage.completion_tokens ?? 0,
          reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens,
          cost: cost,
          upstream_inference_cost: null,
          input_tokens: usage.prompt_tokens ?? 0,
          cache_read_input_tokens: usage.prompt_tokens_details?.cached_tokens,
        },
        logger,
      })
      if (!success) {
        logger.error(
          { request },
          'Failed to insert message into BigQuery (OpenAI)',
        )
      }
    })

    await consumeCreditsAndAddAgentStep({
      messageId: obj.id,
      userId,
      agentId,
      clientId,
      clientRequestId,
      startTime,
      model: obj.model,
      reasoningText: state.reasoningText,
      response: state.responseText,
      cost,
      credits: Math.round(cost * 100 * (1 + PROFIT_MARGIN)),
      inputTokens: obj.usage.prompt_tokens ?? 0,
      cacheCreationInputTokens: null,
      cacheReadInputTokens: obj.usage.prompt_tokens_details?.cached_tokens ?? 0,
      reasoningTokens:
        obj.usage.completion_tokens_details?.reasoning_tokens ?? null,
      outputTokens: obj.usage.completion_tokens ?? 0,
      logger,
    })

    // Reconstruct outgoing line with injected cost
    const newLine = `data: ${JSON.stringify(obj)}\n`
    return { state, outgoingLine: newLine }
  }

  return { state, outgoingLine: line }
}
