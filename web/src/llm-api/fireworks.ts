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

const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1'

// Extended timeout for deep-thinking models that can take
// a long time to start streaming.
const FIREWORKS_HEADERS_TIMEOUT_MS = 10 * 60 * 1000

const fireworksAgent = new Agent({
  headersTimeout: FIREWORKS_HEADERS_TIMEOUT_MS,
  bodyTimeout: 0,
})

/** Map from OpenRouter model IDs to Fireworks standard API model IDs */
const FIREWORKS_MODEL_MAP: Record<string, string> = {
  'minimax/minimax-m2.5': 'accounts/fireworks/models/minimax-m2p5',
}

/** Flag to enable custom Fireworks deployments (set to false to use global API only) */
const FIREWORKS_USE_CUSTOM_DEPLOYMENT = false

/** Custom deployment IDs for models with dedicated Fireworks deployments */
const FIREWORKS_DEPLOYMENT_MAP: Record<string, string> = {
  'minimax/minimax-m2.5': 'accounts/james-65d217/deployments/qne3jo8v',
}

/** Check if current time is within deployment hours (10am–8pm ET) */
export function isDeploymentHours(now: Date = new Date()): boolean {
  const etHour = parseInt(
    now.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false,
    }),
    10,
  )
  return etHour >= 10 && etHour < 20
}

/**
 * In-memory cooldown to avoid repeatedly hitting a deployment that is scaling up.
 * After a DEPLOYMENT_SCALING_UP 503, we skip the deployment for this many ms.
 */
export const DEPLOYMENT_COOLDOWN_MS = 2 * 60 * 1000
let deploymentScalingUpUntil = 0

export function isDeploymentCoolingDown(): boolean {
  return Date.now() < deploymentScalingUpUntil
}

export function markDeploymentScalingUp(): void {
  deploymentScalingUpUntil = Date.now() + DEPLOYMENT_COOLDOWN_MS
}

export function resetDeploymentCooldown(): void {
  deploymentScalingUpUntil = 0
}

export function isFireworksModel(model: string): boolean {
  return model in FIREWORKS_MODEL_MAP
}

function getFireworksModelId(openrouterModel: string): string {
  return FIREWORKS_MODEL_MAP[openrouterModel] ?? openrouterModel
}

type StreamState = { responseText: string; reasoningText: string }

type LineResult = {
  state: StreamState
  billedCredits?: number
  patchedLine: string
}

function createFireworksRequest(params: {
  body: ChatCompletionRequestBody
  originalModel: string
  fetch: typeof globalThis.fetch
  modelIdOverride?: string
}) {
  const { body, originalModel, fetch, modelIdOverride } = params
  const fireworksBody: Record<string, unknown> = {
    ...body,
    model: modelIdOverride ?? getFireworksModelId(originalModel),
  }

  // Strip OpenRouter-specific / internal fields
  delete fireworksBody.provider
  delete fireworksBody.transforms
  delete fireworksBody.codebuff_metadata
  delete fireworksBody.usage

  // For streaming, request usage in the final chunk
  if (fireworksBody.stream) {
    fireworksBody.stream_options = { include_usage: true }
  }

  return fetch(`${FIREWORKS_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.FIREWORKS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(fireworksBody),
    // @ts-expect-error - dispatcher is a valid undici option not in fetch types
    dispatcher: fireworksAgent,
  })
}

// Fireworks per-token pricing (dollars per token)
const FIREWORKS_INPUT_COST_PER_TOKEN = 0.30 / 1_000_000
const FIREWORKS_CACHED_INPUT_COST_PER_TOKEN = 0.03 / 1_000_000
const FIREWORKS_OUTPUT_COST_PER_TOKEN = 1.20 / 1_000_000

function extractUsageAndCost(usage: Record<string, unknown> | undefined | null): UsageData {
  if (!usage) return { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, reasoningTokens: 0, cost: 0 }
  const promptDetails = usage.prompt_tokens_details as Record<string, unknown> | undefined | null
  const completionDetails = usage.completion_tokens_details as Record<string, unknown> | undefined | null

  const inputTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0
  const outputTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0
  const cacheReadInputTokens = typeof promptDetails?.cached_tokens === 'number' ? promptDetails.cached_tokens : 0
  const reasoningTokens = typeof completionDetails?.reasoning_tokens === 'number' ? completionDetails.reasoning_tokens : 0

  // Fireworks doesn't return cost — compute from token counts and known pricing
  const nonCachedInputTokens = Math.max(0, inputTokens - cacheReadInputTokens)
  const cost =
    nonCachedInputTokens * FIREWORKS_INPUT_COST_PER_TOKEN +
    cacheReadInputTokens * FIREWORKS_CACHED_INPUT_COST_PER_TOKEN +
    outputTokens * FIREWORKS_OUTPUT_COST_PER_TOKEN

  return { inputTokens, outputTokens, cacheReadInputTokens, reasoningTokens, cost }
}

export async function handleFireworksNonStream({
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

  const response = await createFireworksRequestWithFallback({ body, originalModel, fetch, logger })

  if (!response.ok) {
    throw await parseFireworksError(response)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content ?? ''
  const reasoningText = data.choices?.[0]?.message?.reasoning_content ?? data.choices?.[0]?.message?.reasoning ?? ''
  const usageData = extractUsageAndCost(data.usage)

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
  })

  // Overwrite cost so SDK calculates exact credits we charged
  if (data.usage) {
    data.usage.cost = creditsToFakeCost(billedCredits)
    data.usage.cost_details = { upstream_inference_cost: 0 }
  }

  // Normalise model name back to OpenRouter format for client compatibility
  data.model = originalModel
  if (!data.provider) data.provider = 'Fireworks'

  return data
}

export async function handleFireworksStream({
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

  const response = await createFireworksRequestWithFallback({ body, originalModel, fetch, logger })

  if (!response.ok) {
    throw await parseFireworksError(response)
  }

  const reader = response.body?.getReader()
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
            'Error after client disconnect in Fireworks stream',
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
        'Client cancelled stream, continuing Fireworks consumption for billing',
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
      'Received non-JSON Fireworks response',
    )
    return { state, patchedLine: line }
  }

  // Patch model and provider for SDK compatibility
  if (obj.model) obj.model = originalModel
  if (!obj.provider) obj.provider = 'Fireworks'

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
  return { state: result.state, billedCredits: result.billedCredits, patchedLine }
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
  state = handleStreamChunk({ data, state, logger, userId, agentId, model: originalModel })

  if ('error' in data || !data.usage) {
    return { state }
  }

  const usageData = extractUsageAndCost(data.usage as Record<string, unknown>)
  const messageId = typeof data.id === 'string' ? data.id : 'unknown'

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
  })

  return { state, billedCredits }
}

function handleStreamChunk({
  data,
  state,
  logger,
  userId,
  agentId,
  model,
}: {
  data: Record<string, unknown>
  state: StreamState
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
      'Received error chunk in Fireworks stream',
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

export class FireworksError extends Error {
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
    this.name = 'FireworksError'
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

function parseFireworksErrorFromText(
  statusCode: number,
  statusText: string,
  errorText: string,
): FireworksError {
  let errorBody: FireworksError['errorBody']
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
          message: errorText || statusText,
          code: statusCode,
        },
      }
    }
  } catch {
    errorBody = {
      error: {
        message: errorText || statusText,
        code: statusCode,
      },
    }
  }
  return new FireworksError(statusCode, statusText, errorBody)
}

async function parseFireworksError(response: Response): Promise<FireworksError> {
  const errorText = await response.text()
  return parseFireworksErrorFromText(response.status, response.statusText, errorText)
}

/**
 * Tries the custom Fireworks deployment during business hours (10am–8pm ET),
 * falling back to the standard API if the deployment returns 503 DEPLOYMENT_SCALING_UP.
 * Outside deployment hours or during cooldown, goes straight to the standard API.
 */
export async function createFireworksRequestWithFallback(params: {
  body: ChatCompletionRequestBody
  originalModel: string
  fetch: typeof globalThis.fetch
  logger: Logger
  useCustomDeployment?: boolean
}): Promise<Response> {
  const { body, originalModel, fetch, logger } = params
  const useCustomDeployment = params.useCustomDeployment ?? FIREWORKS_USE_CUSTOM_DEPLOYMENT
  const deploymentModelId = FIREWORKS_DEPLOYMENT_MAP[originalModel]
  const shouldTryDeployment =
    useCustomDeployment &&
    deploymentModelId &&
    isDeploymentHours() &&
    !isDeploymentCoolingDown()

  if (shouldTryDeployment) {
    logger.info(
      { model: originalModel, deploymentModel: deploymentModelId },
      'Trying Fireworks custom deployment (business hours)',
    )
    const response = await createFireworksRequest({
      body,
      originalModel,
      fetch,
      modelIdOverride: deploymentModelId,
    })

    if (response.status === 503) {
      const errorText = await response.text()
      if (errorText.includes('DEPLOYMENT_SCALING_UP')) {
        logger.info(
          { model: originalModel },
          'Fireworks deployment scaling up, falling back to standard API',
        )
        markDeploymentScalingUp()
        // Fall through to standard API request below
      } else {
        // Non-scaling 503 — treat as a real error
        throw parseFireworksErrorFromText(response.status, response.statusText, errorText)
      }
    } else {
      return response
    }
  }

  return createFireworksRequest({ body, originalModel, fetch })
}

function creditsToFakeCost(credits: number): number {
  return credits / ((1 + PROFIT_MARGIN) * 100)
}
