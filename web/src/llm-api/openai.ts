import { Agent } from 'undici'

import { PROFIT_MARGIN } from '@codebuff/common/constants/limits'
import { getErrorObject } from '@codebuff/common/util/error'
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

// Per-million-token pricing for known models. Unknown openai/ models use defaults.
const DEFAULT_INPUT_COST = 1.25
const DEFAULT_CACHED_INPUT_COST = 0.125
const DEFAULT_OUTPUT_COST = 10

const INPUT_TOKEN_COSTS: Record<string, number> = {
  'gpt-5': 1.25,
  'gpt-5.1': 1.25,
  'gpt-5.1-chat': 1.25,
  'gpt-5.2': 1.25,
  'gpt-5.2-codex': 1.25,
  'gpt-5.3': 1.25,
  'gpt-5.3-codex': 1.25,
  'gpt-5.4': 1.25,
  'gpt-5.4-codex': 1.25,
  'gpt-4o-2024-11-20': 2.50,
  'gpt-4o-mini-2024-07-18': 0.15,
}
const CACHED_INPUT_TOKEN_COSTS: Record<string, number> = {
  'gpt-5': 0.125,
  'gpt-5.1': 0.125,
  'gpt-5.1-chat': 0.125,
  'gpt-5.2': 0.125,
  'gpt-5.2-codex': 0.125,
  'gpt-5.3': 0.125,
  'gpt-5.3-codex': 0.125,
  'gpt-5.4': 0.125,
  'gpt-5.4-codex': 0.125,
  'gpt-4o-2024-11-20': 1.25,
  'gpt-4o-mini-2024-07-18': 0.075,
}
const OUTPUT_TOKEN_COSTS: Record<string, number> = {
  'gpt-5': 10,
  'gpt-5.1': 10,
  'gpt-5.1-chat': 10,
  'gpt-5.2': 10,
  'gpt-5.2-codex': 10,
  'gpt-5.3': 10,
  'gpt-5.3-codex': 10,
  'gpt-5.4': 10,
  'gpt-5.4-codex': 10,
  'gpt-4o-2024-11-20': 10,
  'gpt-4o-mini-2024-07-18': 0.60,
}

// Extended timeout for deep-thinking models (e.g., gpt-5.x) that can take
// a long time to start streaming.
const OPENAI_HEADERS_TIMEOUT_MS = 10 * 60 * 1000

const openaiAgent = new Agent({
  headersTimeout: OPENAI_HEADERS_TIMEOUT_MS,
  bodyTimeout: 0,
})

const OPENAI_DIRECT_MODELS = new Set(Object.keys(INPUT_TOKEN_COSTS))

/**
 * Check if a model should be routed directly to the OpenAI API
 * instead of going through OpenRouter.
 */
export function isOpenAIDirectModel(model: string): boolean {
  if (typeof model !== 'string' || !model.startsWith('openai/')) return false
  const shortName = model.slice('openai/'.length)
  return OPENAI_DIRECT_MODELS.has(shortName)
}

type OpenAIUsage = {
  prompt_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number } | null
  completion_tokens?: number
  completion_tokens_details?: { reasoning_tokens?: number } | null
  total_tokens?: number
  cost?: number
  cost_details?: { upstream_inference_cost?: number | null } | null
}

function extractUsageAndCost(
  usage: OpenAIUsage,
  modelShortName: string,
): UsageData {
  const inputTokenCost =
    INPUT_TOKEN_COSTS[modelShortName] ?? DEFAULT_INPUT_COST
  const cachedInputTokenCost =
    CACHED_INPUT_TOKEN_COSTS[modelShortName] ?? DEFAULT_CACHED_INPUT_COST
  const outputTokenCost =
    OUTPUT_TOKEN_COSTS[modelShortName] ?? DEFAULT_OUTPUT_COST

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

function extractShortModelName(model: string): string {
  return model.startsWith('openai/') ? model.slice('openai/'.length) : model
}

function buildOpenAIBody(
  body: ChatCompletionRequestBody,
  modelShortName: string,
): Record<string, unknown> {
  const openaiBody: Record<string, unknown> = {
    ...body,
    model: modelShortName,
  }

  // Transform max_tokens to max_completion_tokens
  openaiBody.max_completion_tokens =
    openaiBody.max_completion_tokens ?? openaiBody.max_tokens
  delete openaiBody.max_tokens

  // Transform reasoning to reasoning_effort (not supported with function tools)
  const hasTools = Array.isArray(openaiBody.tools) && openaiBody.tools.length > 0
  if (openaiBody.reasoning && typeof openaiBody.reasoning === 'object') {
    const reasoning = openaiBody.reasoning as {
      enabled?: boolean
      effort?: 'high' | 'medium' | 'low'
    }
    if ((reasoning.enabled ?? true) && !hasTools) {
      openaiBody.reasoning_effort = reasoning.effort ?? 'medium'
    }
  }
  delete openaiBody.reasoning

  // OpenAI doesn't support reasoning_effort with function tools
  if (hasTools) {
    delete openaiBody.reasoning_effort
  }

  // Remove fields that OpenAI doesn't support
  delete openaiBody.stop
  delete openaiBody.usage
  delete openaiBody.provider
  delete openaiBody.transforms
  delete openaiBody.codebuff_metadata

  return openaiBody
}

/**
 * Convert credits (integer cents) back to a cost value that will result in the same
 * credits when the SDK applies its formula: credits = Math.round(cost * (1 + PROFIT_MARGIN) * 100)
 */
function creditsToFakeCost(credits: number): number {
  return credits / ((1 + PROFIT_MARGIN) * 100)
}

/**
 * Overwrite the cost field in an SSE line to reflect actual billed credits.
 */
function overwriteCostInLine(line: string, billedCredits: number): string {
  if (!line.startsWith('data: ')) return line
  const raw = line.slice('data: '.length).trim()
  if (raw === '[DONE]') return line
  try {
    const obj = JSON.parse(raw)
    if (obj.usage) {
      obj.usage.cost = creditsToFakeCost(billedCredits)
      obj.usage.cost_details = { upstream_inference_cost: 0 }
      return `data: ${JSON.stringify(obj)}\n`
    }
  } catch {
    // pass through
  }
  return line
}

export class OpenAIError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    super(`OpenAI API error: ${statusCode} ${statusText}`)
    this.name = 'OpenAIError'
  }

  toJSON() {
    try {
      return JSON.parse(this.body)
    } catch {
      return { error: { message: this.body, code: this.statusCode } }
    }
  }
}

export async function handleOpenAINonStream({
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
  const { clientId, clientRequestId, costMode, n } = extractRequestMetadata({
    body,
    logger,
  })

  const modelShortName = extractShortModelName(body.model)
  const openaiBody = buildOpenAIBody(body, modelShortName)
  openaiBody.stream = false
  if (n) openaiBody.n = n

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(openaiBody),
  })

  if (!response.ok) {
    throw new OpenAIError(
      response.status,
      response.statusText,
      await response.text(),
    )
  }

  const data = await response.json()
  const usage: OpenAIUsage = data.usage ?? {}
  const usageData = extractUsageAndCost(usage, modelShortName)

  if (n && n > 1) {
    // Multi-response: aggregate all choices into a JSON array
    const responseContents: string[] = []
    if (data.choices && Array.isArray(data.choices)) {
      for (const choice of data.choices) {
        responseContents.push(choice.message?.content ?? '')
      }
    }
    const responseText = JSON.stringify(responseContents)
    const reasoningText = ''

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
      logger.error(
        { error },
        'Failed to insert message into BigQuery (OpenAI)',
      )
    })

    const billedCredits = await consumeCreditsForMessage({
      messageId: data.id,
      userId,
      stripeCustomerId,
      agentId,
      clientId,
      clientRequestId,
      startTime,
      model: body.model,
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
          message: { content: responseText, role: 'assistant' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        ...data.usage,
        cost: creditsToFakeCost(billedCredits),
        cost_details: { upstream_inference_cost: 0 },
      },
    }
  }

  // Single response: return as-is with cost overwritten
  const content = data.choices?.[0]?.message?.content ?? ''
  const reasoningText = data.choices?.[0]?.message?.reasoning ?? ''

  insertMessageToBigQuery({
    messageId: data.id,
    userId,
    startTime,
    request: body,
    reasoningText,
    responseText: content,
    usageData,
    logger,
    insertMessageBigquery,
  }).catch((error) => {
    logger.error(
      { error },
      'Failed to insert message into BigQuery (OpenAI)',
    )
  })

  const billedCredits = await consumeCreditsForMessage({
    messageId: data.id,
    userId,
    stripeCustomerId,
    agentId,
    clientId,
    clientRequestId,
    startTime,
    model: body.model,
    reasoningText,
    responseText: content,
    usageData,
    byok: false,
    logger,
    costMode,
  })

  if (data.usage) {
    data.usage.cost = creditsToFakeCost(billedCredits)
    data.usage.cost_details = { upstream_inference_cost: 0 }
  }

  return data
}

export async function handleOpenAIStream({
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

  const modelShortName = extractShortModelName(body.model)
  const openaiBody = buildOpenAIBody(body, modelShortName)
  openaiBody.stream = true
  openaiBody.stream_options = { include_usage: true }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(openaiBody),
    // @ts-expect-error - dispatcher is a valid undici option not in fetch types
    dispatcher: openaiAgent,
  })

  if (!response.ok) {
    throw new OpenAIError(
      response.status,
      response.statusText,
      await response.text(),
    )
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Failed to get response reader')
  }

  let heartbeatInterval: NodeJS.Timeout
  let responseText = ''
  let reasoningText = ''
  let clientDisconnected = false
  const MAX_BUFFER_SIZE = 1 * 1024 * 1024 // 1MB

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
          } catch {
            // client disconnected
          }
        }
      }, 30000)

      try {
        let done = false
        while (!done) {
          const result = await reader.read()
          done = result.done
          const value = result.value

          if (done) {
            break
          }

          buffer += decoder.decode(value, { stream: true })
          let lineEnd = buffer.indexOf('\n')

          while (lineEnd !== -1) {
            const line = buffer.slice(0, lineEnd + 1)
            buffer = buffer.slice(lineEnd + 1)

            let billedCredits: number | undefined

            if (line.startsWith('data: ')) {
              const raw = line.slice('data: '.length).trim()
              if (raw !== '[DONE]') {
                try {
                  const obj = JSON.parse(raw)
                  const delta = obj.choices?.[0]?.delta

                  if (delta?.content && responseText.length < MAX_BUFFER_SIZE) {
                    responseText += delta.content
                    if (responseText.length >= MAX_BUFFER_SIZE) {
                      responseText =
                        responseText.slice(0, MAX_BUFFER_SIZE) +
                        '\n---[TRUNCATED]---'
                      logger.warn(
                        { userId, agentId, model: modelShortName },
                        'Response text buffer truncated at 1MB',
                      )
                    }
                  }
                  if (
                    delta?.reasoning &&
                    reasoningText.length < MAX_BUFFER_SIZE
                  ) {
                    reasoningText += delta.reasoning
                    if (reasoningText.length >= MAX_BUFFER_SIZE) {
                      reasoningText =
                        reasoningText.slice(0, MAX_BUFFER_SIZE) +
                        '\n---[TRUNCATED]---'
                      logger.warn(
                        { userId, agentId, model: modelShortName },
                        'Reasoning text buffer truncated at 1MB',
                      )
                    }
                  }

                  // Final chunk with usage — bill and track
                  if (obj.usage) {
                    const usageData = extractUsageAndCost(
                      obj.usage,
                      modelShortName,
                    )

                    insertMessageToBigQuery({
                      messageId: obj.id,
                      userId,
                      startTime,
                      request: body,
                      reasoningText,
                      responseText,
                      usageData,
                      logger,
                      insertMessageBigquery,
                    }).catch((error) => {
                      logger.error(
                        { error },
                        'Failed to insert message into BigQuery (OpenAI stream)',
                      )
                    })

                    billedCredits = await consumeCreditsForMessage({
                      messageId: obj.id,
                      userId,
                      stripeCustomerId,
                      agentId,
                      clientId,
                      clientRequestId,
                      startTime,
                      model: body.model,
                      reasoningText,
                      responseText,
                      usageData,
                      byok: false,
                      logger,
                      costMode,
                    })
                  }
                } catch {
                  // Parse error — pass line through as-is
                }
              }
            }

            if (!clientDisconnected) {
              try {
                const lineToSend =
                  billedCredits !== undefined
                    ? overwriteCostInLine(line, billedCredits)
                    : line
                controller.enqueue(new TextEncoder().encode(lineToSend))
              } catch (error) {
                logger.warn(
                  'Client disconnected during OpenAI stream, continuing for billing',
                )
                clientDisconnected = true
              }
            }

            lineEnd = buffer.indexOf('\n')
          }
        }

        // Flush any residual buffer content (e.g. final chunk without trailing newline)
        if (buffer.length > 0) {
          const line = buffer
          buffer = ''

          let billedCredits: number | undefined

          if (line.startsWith('data: ')) {
            const raw = line.trim()
            if (raw !== 'data: [DONE]') {
              try {
                const rawData = line.slice('data: '.length).trim()
                const obj = JSON.parse(rawData)
                const delta = obj.choices?.[0]?.delta

                if (delta?.content && responseText.length < MAX_BUFFER_SIZE) {
                  responseText += delta.content
                }
                if (delta?.reasoning && reasoningText.length < MAX_BUFFER_SIZE) {
                  reasoningText += delta.reasoning
                }

                if (obj.usage) {
                  const usageData = extractUsageAndCost(
                    obj.usage,
                    modelShortName,
                  )

                  insertMessageToBigQuery({
                    messageId: obj.id,
                    userId,
                    startTime,
                    request: body,
                    reasoningText,
                    responseText,
                    usageData,
                    logger,
                    insertMessageBigquery,
                  }).catch((error) => {
                    logger.error(
                      { error },
                      'Failed to insert message into BigQuery (OpenAI stream residual)',
                    )
                  })

                  billedCredits = await consumeCreditsForMessage({
                    messageId: obj.id,
                    userId,
                    stripeCustomerId,
                    agentId,
                    clientId,
                    clientRequestId,
                    startTime,
                    model: body.model,
                    reasoningText,
                    responseText,
                    usageData,
                    byok: false,
                    logger,
                    costMode,
                  })
                }
              } catch {
                // Parse error — pass through
              }
            }
          }

          if (!clientDisconnected) {
            try {
              const lineToSend =
                billedCredits !== undefined
                  ? overwriteCostInLine(line, billedCredits)
                  : line
              controller.enqueue(new TextEncoder().encode(lineToSend))
            } catch {
              clientDisconnected = true
            }
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
        {
          clientDisconnected,
          responseTextLength: responseText.length,
          reasoningTextLength: reasoningText.length,
        },
        'Client cancelled OpenAI stream, continuing for billing',
      )
    },
  })

  return stream
}
