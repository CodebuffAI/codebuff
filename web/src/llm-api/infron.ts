import { Agent } from 'undici'

import { PROFIT_MARGIN } from '@codebuff/common/constants/limits'
import { getErrorObject } from '@codebuff/common/util/error'
import { env } from '@codebuff/internal/env'

import {
  consumeCreditsForMessage,
  createRequestAuditRecord,
  extractRequestMetadata,
  insertMessageToBigQuery,
} from './helpers'

import type { UsageData } from './helpers'
import type { InsertMessageBigqueryFn } from '@codebuff/common/types/contracts/bigquery'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ChatCompletionRequestBody } from './types'

// Infron (https://infron.ai) exposes an OpenRouter-compatible aggregator at
// llm.onerouter.pro: same `provider` routing param, same `usage.cost` field
// reflecting the account's actual (post-discount) charge. We therefore read the
// returned cost directly rather than maintaining a per-token price table.
const INFRON_BASE_URL = 'https://llm.onerouter.pro/v1'

// Extended timeout for deep-thinking models that can take a long time to start
// streaming.
const INFRON_HEADERS_TIMEOUT_MS = 30 * 60 * 1000

const infronAgent = new Agent({
  headersTimeout: INFRON_HEADERS_TIMEOUT_MS,
  bodyTimeout: 0,
})

/**
 * Map from our internal (OpenRouter-style) model IDs to Infron model IDs.
 * Only models listed here route to Infron; everything else keeps its existing
 * provider.
 *
 * This map is intentionally EMPTY: the Infron provider is fully wired up but
 * dormant, so landing it is behavior-preserving (GLM 5.2 keeps routing through
 * Fireworks). A follow-up flips GLM 5.2 onto Infron with a single line — its
 * provider pin and fallback pricing are already staged below:
 *   'z-ai/glm-5.2': 'z-ai/glm-5.2',
 */
export const INFRON_MODEL_MAP: Record<string, string> = {}

/**
 * Per-model upstream provider pin, sent as Infron's `provider.order`. Alibaba
 * Cloud carries the 50% discount and benchmarked fastest/most-consistent for
 * GLM 5.2 (~1s TTFT, ~56 tok/s vs ~34 on the default deepinfra route); without
 * a pin Infron may route to a slower backend. Add entries as models onboard.
 */
const INFRON_PROVIDER_ORDER: Record<string, string[]> = {
  'z-ai/glm-5.2': ['alibaba/sg', 'alibaba/cn'],
}

const INFRON_ROUTED_MODELS = new Set<string>(Object.keys(INFRON_MODEL_MAP))

export function isInfronModel(model: string): boolean {
  return INFRON_ROUTED_MODELS.has(model)
}

function getInfronModelId(model: string): string {
  return INFRON_MODEL_MAP[model] ?? model
}

// Per-token fallback pricing (dollars per token), used only when Infron does not
// return a root `cost` (so we never under-bill on a missing-cost response).
// Mirrors GLM 5.2's published list price; the real charge normally comes from
// the returned `data.cost`, which already reflects the account discount.
interface InfronPricing {
  inputCostPerToken: number
  cachedInputCostPerToken: number
  outputCostPerToken: number
}

const INFRON_FALLBACK_PRICING: Record<string, InfronPricing> = {
  'z-ai/glm-5.2': {
    inputCostPerToken: 1.4 / 1_000_000,
    cachedInputCostPerToken: 0.26 / 1_000_000,
    outputCostPerToken: 4.4 / 1_000_000,
  },
}

function fallbackCostFromTokens(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadInputTokens: number,
): number {
  const pricing = INFRON_FALLBACK_PRICING[model]
  if (!pricing) return 0
  const nonCachedInputTokens = Math.max(0, inputTokens - cacheReadInputTokens)
  return (
    nonCachedInputTokens * pricing.inputCostPerToken +
    cacheReadInputTokens * pricing.cachedInputCostPerToken +
    outputTokens * pricing.outputCostPerToken
  )
}

type StreamState = {
  responseText: string
  reasoningText: string
  ttftMs: number | null
  billedAlready: boolean
}

type LineResult = {
  state: StreamState
  billedCredits?: number
  patchedLine: string
}

/**
 * Build the request body Infron expects. The endpoint is OpenRouter-compatible,
 * so most fields pass through unchanged; we only map the model ID, enable usage
 * reporting, apply any provider pin, and strip our internal fields.
 */
export function buildInfronRequestBody(
  body: ChatCompletionRequestBody,
  originalModel: string = body.model,
): Record<string, unknown> {
  const infronBody = {
    ...body,
    model: getInfronModelId(originalModel),
  } as unknown as Record<string, unknown>

  // Ask for usage (incl. cost) in the response / final stream chunk.
  infronBody.usage = { include: true }

  // Apply the configured upstream provider pin, if any; otherwise drop any
  // inbound provider routing so callers can't override our routing.
  const providerOrder = INFRON_PROVIDER_ORDER[originalModel]
  if (providerOrder && providerOrder.length > 0) {
    infronBody.provider = { order: providerOrder }
  } else {
    delete infronBody.provider
  }

  // Strip internal-only fields.
  delete infronBody.transforms
  delete infronBody.codebuff_metadata

  return infronBody
}

export function createInfronRequest(params: {
  body: ChatCompletionRequestBody
  originalModel: string
  fetch: typeof globalThis.fetch
}) {
  const { body, originalModel, fetch } = params
  const infronBody = buildInfronRequestBody(body, originalModel)

  if (!env.INFRON_API_KEY) {
    throw new Error('INFRON_API_KEY is not configured')
  }

  return fetch(`${INFRON_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.INFRON_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(infronBody),
    // @ts-expect-error - dispatcher is a valid undici option not in fetch types
    dispatcher: infronAgent,
  })
}

/**
 * Extract token counts and billed cost from an Infron response (or final stream
 * chunk). Unlike OpenRouter, Infron reports `cost`/`cost_details` at the
 * RESPONSE ROOT (siblings of `usage`), not inside `usage`. The root `cost`
 * already reflects the account discount (e.g. cost_details.discount_rate: 0.5),
 * so we use it directly and fall back to list-price token math only if absent.
 */
export function extractUsageAndCost(
  data: Record<string, unknown> | undefined | null,
  model: string,
): UsageData {
  const usage = (data?.usage ?? null) as Record<string, unknown> | null
  if (!usage)
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      reasoningTokens: 0,
      cost: 0,
    }
  const promptDetails = usage.prompt_tokens_details as
    | Record<string, unknown>
    | undefined
    | null
  const completionDetails = usage.completion_tokens_details as
    | Record<string, unknown>
    | undefined
    | null

  const inputTokens =
    typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0
  const outputTokens =
    typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0
  const cacheReadInputTokens =
    typeof promptDetails?.cached_tokens === 'number'
      ? promptDetails.cached_tokens
      : 0
  const reasoningTokens =
    typeof completionDetails?.reasoning_tokens === 'number'
      ? completionDetails.reasoning_tokens
      : 0

  // Infron's post-discount charge lives at the response root, not in `usage`.
  const reportedCost = typeof data?.cost === 'number' ? data.cost : 0
  const cost =
    reportedCost ||
    fallbackCostFromTokens(
      model,
      inputTokens,
      outputTokens,
      cacheReadInputTokens,
    )

  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    reasoningTokens,
    cost,
  }
}

export async function handleInfronNonStream({
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
  const { clientId, clientRequestId, costMode } = extractRequestMetadata({
    body,
    logger,
  })
  const auditRequest = createRequestAuditRecord(body)

  const response = await createInfronRequest({ body, originalModel, fetch })

  if (!response.ok) {
    throw await parseInfronError(response)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content ?? ''
  const reasoningText =
    data.choices?.[0]?.message?.reasoning_content ??
    data.choices?.[0]?.message?.reasoning ??
    ''
  const usageData = extractUsageAndCost(data, originalModel)

  insertMessageToBigQuery({
    messageId: data.id,
    userId,
    startTime,
    request: auditRequest,
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

  // Normalise model name back to our format for client compatibility
  data.model = originalModel
  if (!data.provider) data.provider = 'Infron'

  return data
}

export async function handleInfronStream({
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
  const { clientId, clientRequestId, costMode } = extractRequestMetadata({
    body,
    logger,
  })
  const auditRequest = createRequestAuditRecord(body)

  const response = await createInfronRequest({ body, originalModel, fetch })

  if (!response.ok) {
    throw await parseInfronError(response)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Failed to get response reader')
  }

  let heartbeatInterval: NodeJS.Timeout
  let state: StreamState = {
    responseText: '',
    reasoningText: '',
    ttftMs: null,
    billedAlready: false,
  }
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
              request: auditRequest,
              originalModel,
              line,
              state,
              logger,
              insertMessage: insertMessageBigquery,
            })
            state = lineResult.state

            if (!clientDisconnected) {
              try {
                controller.enqueue(
                  new TextEncoder().encode(lineResult.patchedLine),
                )
              } catch {
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
            'Error after client disconnect in Infron stream',
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
        'Client cancelled stream, continuing Infron consumption for billing',
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
      'Received non-JSON Infron response',
    )
    return { state, patchedLine: line }
  }

  // Patch model and provider for SDK compatibility
  if (obj.model) obj.model = originalModel
  if (!obj.provider) obj.provider = 'Infron'

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
  return {
    state: result.state,
    billedCredits: result.billedCredits,
    patchedLine,
  }
}

function isFinalChunk(data: Record<string, unknown>): boolean {
  const choices = data.choices as Array<Record<string, unknown>> | undefined
  if (!choices || choices.length === 0) return true
  return choices.some((c) => c.finish_reason != null)
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
  data: Record<string, unknown>
  state: StreamState
  logger: Logger
  insertMessage: InsertMessageBigqueryFn
}): Promise<{ state: StreamState; billedCredits?: number }> {
  state = handleStreamChunk({
    data,
    state,
    startTime,
    logger,
    userId,
    agentId,
    model: originalModel,
  })

  // Some providers send cumulative usage on EVERY chunk (not just the final
  // one), so we must only bill once on the final chunk to avoid charging N times.
  if (
    'error' in data ||
    !data.usage ||
    state.billedAlready ||
    !isFinalChunk(data)
  ) {
    // Strip usage from non-final chunks and duplicate final chunks so the SDK
    // doesn't see multiple usage objects.
    if (data.usage && (!isFinalChunk(data) || state.billedAlready)) {
      delete data.usage
    }
    return { state }
  }

  const usageData = extractUsageAndCost(data, originalModel)
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
      'Received error chunk in Infron stream',
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
      logger.warn(
        { userId, agentId, model },
        'Response text buffer truncated at 1MB',
      )
    }
  }

  const reasoningDelta =
    typeof delta?.reasoning_content === 'string'
      ? delta.reasoning_content
      : typeof delta?.reasoning === 'string'
        ? delta.reasoning
        : ''

  // Track time to first token (TTFT) - set on first meaningful delta.
  const hasToolCallsDelta =
    delta?.tool_calls != null && (delta.tool_calls as unknown[])?.length > 0
  if (
    state.ttftMs === null &&
    (contentDelta !== '' || reasoningDelta !== '' || hasToolCallsDelta)
  ) {
    state.ttftMs = Date.now() - startTime.getTime()
  }

  if (state.reasoningText.length < MAX_BUFFER_SIZE) {
    state.reasoningText += reasoningDelta
    if (state.reasoningText.length >= MAX_BUFFER_SIZE) {
      state.reasoningText =
        state.reasoningText.slice(0, MAX_BUFFER_SIZE) + '\n---[TRUNCATED]---'
      logger.warn(
        { userId, agentId, model },
        'Reasoning text buffer truncated at 1MB',
      )
    }
  }

  return state
}

export class InfronError extends Error {
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
    this.name = 'InfronError'
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

async function parseInfronError(response: Response): Promise<InfronError> {
  const errorText = await response.text()
  let errorBody: InfronError['errorBody']
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
  return new InfronError(response.status, response.statusText, errorBody)
}

function creditsToFakeCost(credits: number): number {
  return credits / ((1 + PROFIT_MARGIN) * 100)
}
