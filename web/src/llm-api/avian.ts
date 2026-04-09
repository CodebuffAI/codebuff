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

const AVIAN_BASE_URL = 'https://api.avian.io/v1'

// Extended timeout for models that can take a long time to start streaming.
const AVIAN_HEADERS_TIMEOUT_MS = 10 * 60 * 1000

const avianAgent = new Agent({
  headersTimeout: AVIAN_HEADERS_TIMEOUT_MS,
  bodyTimeout: 0,
})

/** Map from OpenRouter-style model IDs to Avian model IDs */
const AVIAN_MODEL_MAP: Record<string, string> = {
  'avian/deepseek-v3.2': 'deepseek-v3.2',
  'avian/kimi-k2.5': 'kimi-k2.5',
  'avian/glm-5': 'glm-5',
  'avian/minimax-m2.5': 'minimax-m2.5',
}

/** Per-million-token pricing for Avian models (dollars per million tokens) */
const AVIAN_PRICING: Record<string, { input: number; output: number }> = {
  'deepseek-v3.2': { input: 0.14, output: 0.28 },
  'kimi-k2.5': { input: 0.14, output: 0.28 },
  'glm-5': { input: 0.25, output: 0.50 },
  'minimax-m2.5': { input: 0.15, output: 0.30 },
}

const DEFAULT_INPUT_COST = 0.20
const DEFAULT_OUTPUT_COST = 0.40

export function isAvianModel(model: string): boolean {
  return model in AVIAN_MODEL_MAP
}

function getAvianModelId(openrouterModel: string): string {
  return AVIAN_MODEL_MAP[openrouterModel] ?? openrouterModel
}

type StreamState = { responseText: string; reasoningText: string; ttftMs: number | null; billedAlready: boolean }

type LineResult = {
  state: StreamState
  billedCredits?: number
  patchedLine: string
}

function createAvianRequest(params: {
  body: ChatCompletionRequestBody
  originalModel: string
  fetch: typeof globalThis.fetch
  sessionId: string
}) {
  const { body, originalModel, fetch, sessionId } = params
  const avianBody: Record<string, unknown> = {
    ...body,
    model: getAvianModelId(originalModel),
  }

  // Strip OpenRouter-specific / internal fields
  delete avianBody.provider
  delete avianBody.transforms
  delete avianBody.codebuff_metadata
  delete avianBody.usage

  // For streaming, request usage in the final chunk
  if (avianBody.stream) {
    avianBody.stream_options = { include_usage: true }
  }

  if (!env.AVIAN_API_KEY) {
    throw new Error('AVIAN_API_KEY is not configured')
  }

  return fetch(`${AVIAN_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.AVIAN_API_KEY}`,
      'Content-Type': 'application/json',
      'x-session-affinity': sessionId,
    },
    body: JSON.stringify(avianBody),
    // @ts-expect-error - dispatcher is a valid undici option not in fetch types
    dispatcher: avianAgent,
  })
}

function extractUsageAndCost(usage: Record<string, unknown> | undefined | null, avianModelId: string): UsageData {
  if (!usage) return { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, reasoningTokens: 0, cost: 0 }
  const promptDetails = usage.prompt_tokens_details as Record<string, unknown> | undefined | null
  const completionDetails = usage.completion_tokens_details as Record<string, unknown> | undefined | null

  const inputTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0
  const outputTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0
  const cacheReadInputTokens = typeof promptDetails?.cached_tokens === 'number' ? promptDetails.cached_tokens : 0
  const reasoningTokens = typeof completionDetails?.reasoning_tokens === 'number' ? completionDetails.reasoning_tokens : 0

  const pricing = AVIAN_PRICING[avianModelId]
  const inputCostPerToken = (pricing?.input ?? DEFAULT_INPUT_COST) / 1_000_000
  const outputCostPerToken = (pricing?.output ?? DEFAULT_OUTPUT_COST) / 1_000_000

  const cost =
    inputTokens * inputCostPerToken +
    outputTokens * outputCostPerToken

  return { inputTokens, outputTokens, cacheReadInputTokens, reasoningTokens, cost }
}

export async function handleAvianNonStream({
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
  const originalModel = body.model
  const avianModelId = getAvianModelId(originalModel)
  const startTime = new Date()
  const { clientId, clientRequestId, costMode } = extractRequestMetadata({ body, logger })

  const response = await createAvianRequest({ body, originalModel, fetch, sessionId: userId })

  if (!response.ok) {
    throw await parseAvianError(response)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content ?? ''
  const reasoningText = data.choices?.[0]?.message?.reasoning_content ?? data.choices?.[0]?.message?.reasoning ?? ''
  const usageData = extractUsageAndCost(data.usage, avianModelId)

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
    logger.error({ error }, 'Failed to insert message into BigQuery')
  })

  const billedCredits = await consumeCreditsForMessage({
    messageId: data.id,
    userId,
    stripeCustomerId,
    agentId,
    clientId,
    clientRequestId,
    startTime,
    model: originalModel,
    reasoningText,
    responseText: content,
    usageData,
    byok: false,
    logger,
    costMode,
    ttftMs: null, // Non-stream - no TTFT to report
  })

  // Overwrite cost so SDK calculates exact credits we charged
  if (data.usage) {
    data.usage.cost = creditsToFakeCost(billedCredits)
    data.usage.cost_details = { upstream_inference_cost: 0 }
  }

  // Normalise model name back to OpenRouter format for client compatibility
  data.model = originalModel
  if (!data.provider) data.provider = 'Avian'

  return data
}

export async function handleAvianStream({
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
  const originalModel = body.model
  const startTime = new Date()
  const { clientId, clientRequestId, costMode } = extractRequestMetadata({ body, logger })

  const response = await createAvianRequest({ body, originalModel, fetch, sessionId: userId })

  if (!response.ok) {
    throw await parseAvianError(response)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Failed to get response reader')
  }

  let heartbeatInterval: NodeJS.Timeout
  let state: StreamState = { responseText: '', reasoningText: '', ttftMs: null, billedAlready: false }
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

          if (done) break

          buffer += decoder.decode(value, { stream: true })
          let lineEnd = buffer.indexOf('\n')

          while (lineEnd !== -1) {
            const line = buffer.slice(0, lineEnd + 1)
            buffer = buffer.slice(lineEnd + 1)

            const lineResult = await handleLine({
              userId,
              stripeCustomerId,
              agentId,
              clientId,
              clientRequestId,
              costMode,
              startTime,
              request: body,
              originalModel,
              line,
              state,
              logger,
              insertMessage: insertMessageBigquery,
            })
            state = lineResult.state

            if (!clientDisconnected) {
              try {
                controller.enqueue(new TextEncoder().encode(lineResult.patchedLine))
              } catch {
                logger.warn('Client disconnected during stream, continuing for billing')
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
            'Error after client disconnect in Avian stream',
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
          responseTextLength: state.responseText.length,
          reasoningTextLength: state.reasoningText.length,
        },
        'Client cancelled stream, continuing Avian consumption for billing',
      )
    },
  })

  return stream
}

async function handleLine({
  userId,
  stripeCustomerId,
  agentId,
  clientId,
  clientRequestId,
  costMode,
  startTime,
  request,
  originalModel,
  line,
  state,
  logger,
  insertMessage,
}: {
  userId: string
  stripeCustomerId?: string | null
  agentId: string
  clientId: string | null
  clientRequestId: string | null
  costMode: string | undefined
  startTime: Date
  request: unknown
  originalModel: string
  line: string
  state: StreamState
  logger: Logger
  insertMessage: InsertMessageBigqueryFn
}): Promise<LineResult> {
  if (!line.startsWith('data: ')) {
    return { state, patchedLine: line }
  }

  const raw = line.slice('data: '.length)
  if (raw === '[DONE]\n' || raw === '[DONE]') {
    return { state, patchedLine: line }
  }

  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(raw)
  } catch (error) {
    logger.warn(
      { error: getErrorObject(error, { includeRawError: true }) },
      'Received non-JSON Avian response',
    )
    return { state, patchedLine: line }
  }

  // Patch model and provider for SDK compatibility
  if (obj.model) obj.model = originalModel
  if (!obj.provider) obj.provider = 'Avian'

  const avianModelId = getAvianModelId(originalModel)

  // Process the chunk for billing / state tracking
  const result = await handleResponse({
    userId,
    stripeCustomerId,
    agentId,
    clientId,
    clientRequestId,
    costMode,
    startTime,
    request,
    originalModel,
    avianModelId,
    data: obj,
    state,
    logger,
    insertMessage,
  })

  // If this is the final chunk with billing, overwrite cost in the patched object
  if (result.billedCredits !== undefined && obj.usage) {
    const usage = obj.usage as Record<string, unknown>
    usage.cost = creditsToFakeCost(result.billedCredits)
    usage.cost_details = { upstream_inference_cost: 0 }
  }

  const patchedLine = `data: ${JSON.stringify(obj)}\n`
  return { state: result.state, billedCredits: result.billedCredits, patchedLine }
}

function isFinalChunk(data: Record<string, unknown>): boolean {
  const choices = data.choices as Array<Record<string, unknown>> | undefined
  if (!choices || choices.length === 0) return true
  return choices.some(c => c.finish_reason != null)
}

async function handleResponse({
  userId,
  stripeCustomerId,
  agentId,
  clientId,
  clientRequestId,
  costMode,
  startTime,
  request,
  originalModel,
  avianModelId,
  data,
  state,
  logger,
  insertMessage,
}: {
  userId: string
  stripeCustomerId?: string | null
  agentId: string
  clientId: string | null
  clientRequestId: string | null
  costMode: string | undefined
  startTime: Date
  request: unknown
  originalModel: string
  avianModelId: string
  data: Record<string, unknown>
  state: StreamState
  logger: Logger
  insertMessage: InsertMessageBigqueryFn
}): Promise<{ state: StreamState; billedCredits?: number }> {
  state = handleStreamChunk({ data, state, startTime, logger, userId, agentId, model: originalModel })

  // Some providers send cumulative usage on EVERY chunk (not just the final one),
  // so we must only bill once on the final chunk to avoid charging N times.
  if ('error' in data || !data.usage || state.billedAlready || !isFinalChunk(data)) {
    // Strip usage from non-final chunks and duplicate final chunks
    // so the SDK doesn't see multiple usage objects
    if (data.usage && (!isFinalChunk(data) || state.billedAlready)) {
      delete data.usage
    }
    return { state }
  }

  const usageData = extractUsageAndCost(data.usage as Record<string, unknown>, avianModelId)
  const messageId = typeof data.id === 'string' ? data.id : 'unknown'

  state.billedAlready = true

  insertMessageToBigQuery({
    messageId,
    userId,
    startTime,
    request,
    reasoningText: state.reasoningText,
    responseText: state.responseText,
    usageData,
    logger,
    insertMessageBigquery: insertMessage,
  }).catch((error) => {
    logger.error({ error }, 'Failed to insert message into BigQuery')
  })

  const billedCredits = await consumeCreditsForMessage({
    messageId,
    userId,
    stripeCustomerId,
    agentId,
    clientId,
    clientRequestId,
    startTime,
    model: originalModel,
    reasoningText: state.reasoningText,
    responseText: state.responseText,
    usageData,
    byok: false,
    logger,
    costMode,
    ttftMs: state.ttftMs,
  })

  return { state, billedCredits }
}

function handleStreamChunk({
  data,
  state,
  startTime,
  logger,
  userId,
  agentId,
  model,
}: {
  data: Record<string, unknown>
  state: StreamState
  startTime: Date
  logger: Logger
  userId: string
  agentId: string
  model: string
}): StreamState {
  const MAX_BUFFER_SIZE = 1 * 1024 * 1024

  if ('error' in data) {
    const errorData = data.error as Record<string, unknown>
    logger.error(
      {
        userId,
        agentId,
        model,
        errorCode: errorData?.code,
        errorType: errorData?.type,
        errorMessage: errorData?.message,
      },
      'Received error chunk in Avian stream',
    )
    return state
  }

  const choices = data.choices as Array<Record<string, unknown>> | undefined
  if (!choices?.length) {
    return state
  }
  const choice = choices[0]
  const delta = choice.delta as Record<string, unknown> | undefined

  const contentDelta = typeof delta?.content === 'string' ? delta.content : ''
  if (state.responseText.length < MAX_BUFFER_SIZE) {
    state.responseText += contentDelta
    if (state.responseText.length >= MAX_BUFFER_SIZE) {
      state.responseText =
        state.responseText.slice(0, MAX_BUFFER_SIZE) + '\n---[TRUNCATED]---'
      logger.warn({ userId, agentId, model }, 'Response text buffer truncated at 1MB')
    }
  }

  const reasoningDelta = typeof delta?.reasoning_content === 'string' ? delta.reasoning_content
    : typeof delta?.reasoning === 'string' ? delta.reasoning
      : ''

  // Track time to first token (TTFT) - set on first meaningful delta (content, reasoning, or tool_calls)
  const hasToolCallsDelta = delta?.tool_calls != null && (delta.tool_calls as unknown[])?.length > 0
  if (state.ttftMs === null && (contentDelta !== '' || reasoningDelta !== '' || hasToolCallsDelta)) {
    state.ttftMs = Date.now() - startTime.getTime()
  }

  if (state.reasoningText.length < MAX_BUFFER_SIZE) {
    state.reasoningText += reasoningDelta
    if (state.reasoningText.length >= MAX_BUFFER_SIZE) {
      state.reasoningText =
        state.reasoningText.slice(0, MAX_BUFFER_SIZE) + '\n---[TRUNCATED]---'
      logger.warn({ userId, agentId, model }, 'Reasoning text buffer truncated at 1MB')
    }
  }

  return state
}

export class AvianError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly statusText: string,
    public readonly errorBody: {
      error: {
        message: string
        code: string | number | null
        type?: string | null
      }
    },
  ) {
    super(errorBody.error.message)
    this.name = 'AvianError'
  }

  toJSON() {
    return {
      error: {
        message: this.errorBody.error.message,
        code: this.errorBody.error.code,
        type: this.errorBody.error.type,
      },
    }
  }
}

async function parseAvianError(response: Response): Promise<AvianError> {
  const errorText = await response.text()
  let errorBody: AvianError['errorBody']
  try {
    const parsed = JSON.parse(errorText)
    if (parsed?.error?.message) {
      errorBody = {
        error: {
          message: parsed.error.message,
          code: parsed.error.code ?? null,
          type: parsed.error.type ?? null,
        },
      }
    } else {
      errorBody = {
        error: {
          message: errorText || response.statusText,
          code: response.status,
        },
      }
    }
  } catch {
    errorBody = {
      error: {
        message: errorText || response.statusText,
        code: response.status,
      },
    }
  }
  return new AvianError(response.status, response.statusText, errorBody)
}

function creditsToFakeCost(credits: number): number {
  return credits / ((1 + PROFIT_MARGIN) * 100)
}
