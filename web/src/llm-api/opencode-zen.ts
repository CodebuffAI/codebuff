import { Agent } from 'undici'

import { openCodeZenModels } from '@codebuff/common/constants/model-config'
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
import type {
  ChatCompletionContentPart,
  ChatCompletionRequestBody,
  ChatCompletionTool,
} from './types'

const OPENCODE_ZEN_BASE_URL = 'https://opencode.ai/zen/v1'
const OPENCODE_ZEN_HEADERS_TIMEOUT_MS = 30 * 60 * 1000

const opencodeZenAgent = new Agent({
  headersTimeout: OPENCODE_ZEN_HEADERS_TIMEOUT_MS,
  bodyTimeout: 0,
})

interface OpenCodeZenPricing {
  inputCostPerToken: number
  cachedInputCostPerToken: number
  outputCostPerToken: number
}

const OPENCODE_ZEN_MODELS: Record<
  string,
  { opencodeId: string; pricing: OpenCodeZenPricing }
> = {
  [openCodeZenModels.opencode_minimax_m2_7]: {
    opencodeId: 'minimax-m2.7',
    pricing: {
      inputCostPerToken: 0.3 / 1_000_000,
      cachedInputCostPerToken: 0.06 / 1_000_000,
      outputCostPerToken: 1.2 / 1_000_000,
    },
  },
  [openCodeZenModels.opencode_kimi_k2_6]: {
    opencodeId: 'kimi-k2.6',
    pricing: {
      inputCostPerToken: 0.95 / 1_000_000,
      cachedInputCostPerToken: 0.16 / 1_000_000,
      outputCostPerToken: 4.0 / 1_000_000,
    },
  },
}

const OPENCODE_ZEN_MODEL_PREFIX = 'opencode/'

export function isOpenCodeZenModel(model: unknown): model is string {
  return typeof model === 'string' && model.startsWith(OPENCODE_ZEN_MODEL_PREFIX)
}

function getOpenCodeZenModelId(model: string): string {
  return (
    OPENCODE_ZEN_MODELS[model]?.opencodeId ??
    model.slice(OPENCODE_ZEN_MODEL_PREFIX.length)
  )
}

function getOpenCodeZenPricing(model: string): OpenCodeZenPricing {
  const entry = OPENCODE_ZEN_MODELS[model]
  if (!entry) {
    throw new Error(`No OpenCode Zen pricing found for model: ${model}`)
  }
  return entry.pricing
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

function getOpenCodeZenApiKey(): string {
  const apiKey = env.OPENCODE_API_KEY
  if (!apiKey) {
    throw new Error('OPENCODE_API_KEY is not configured')
  }
  return apiKey
}

function createOpenCodeZenRequest(params: {
  body: ChatCompletionRequestBody
  originalModel: string
  fetch: typeof globalThis.fetch
}) {
  const { body, originalModel, fetch } = params
  const opencodeBody: Record<string, unknown> = {
    ...body,
    messages: normalizeOpenCodeZenMessages(body.messages ?? []),
    tools: body.tools?.map(normalizeOpenCodeZenTool),
    model: getOpenCodeZenModelId(originalModel),
  }

  delete opencodeBody.provider
  delete opencodeBody.transforms
  delete opencodeBody.codebuff_metadata
  delete opencodeBody.usage

  if (opencodeBody.stream) {
    opencodeBody.stream_options = { include_usage: true }
  }

  return fetch(`${OPENCODE_ZEN_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getOpenCodeZenApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(opencodeBody),
    // @ts-expect-error - dispatcher is a valid undici option not in fetch types
    dispatcher: opencodeZenAgent,
  })
}

function normalizeOpenCodeZenMessages(
  messages: ChatCompletionRequestBody['messages'],
): ChatCompletionRequestBody['messages'] {
  return messages.map((message) => {
    const {
      cache_control: _cacheControl,
      content,
      ...rest
    } = message as typeof message & {
      cache_control?: unknown
    }
    return {
      ...rest,
      ...(content !== undefined && {
        content: normalizeOpenCodeZenContent(content),
      }),
    }
  })
}

function normalizeOpenCodeZenContent(
  content: ChatCompletionRequestBody['messages'][number]['content'],
): ChatCompletionRequestBody['messages'][number]['content'] {
  if (!Array.isArray(content)) {
    return content
  }

  return content.map((part) => {
    if (!part || typeof part !== 'object') {
      return part
    }
    const { cache_control: _cacheControl, ...rest } =
      part as ChatCompletionContentPart & {
        cache_control?: unknown
      }
    return rest
  })
}

function normalizeOpenCodeZenTool(
  tool: ChatCompletionTool,
): ChatCompletionTool {
  const { id: _id, ...rest } = tool
  return rest
}

function extractUsageAndCost(
  usage: Record<string, unknown> | undefined | null,
  model: string,
): UsageData {
  if (!usage) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      reasoningTokens: 0,
      cost: 0,
    }
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

  const pricing = getOpenCodeZenPricing(model)
  const nonCachedInputTokens = Math.max(0, inputTokens - cacheReadInputTokens)
  const cost =
    nonCachedInputTokens * pricing.inputCostPerToken +
    cacheReadInputTokens * pricing.cachedInputCostPerToken +
    outputTokens * pricing.outputCostPerToken

  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    reasoningTokens,
    cost,
  }
}

export async function handleOpenCodeZenNonStream({
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

  const response = await createOpenCodeZenRequest({
    body,
    originalModel,
    fetch,
  })
  if (!response.ok) {
    throw await parseOpenCodeZenError(response)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content ?? ''
  const reasoningText =
    data.choices?.[0]?.message?.reasoning_content ??
    data.choices?.[0]?.message?.reasoning ??
    ''
  const usageData = extractUsageAndCost(data.usage, originalModel)

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
    ttftMs: null,
  })

  if (data.usage) {
    data.usage.cost = creditsToFakeCost(billedCredits)
    data.usage.cost_details = { upstream_inference_cost: 0 }
  }

  data.model = originalModel
  if (!data.provider) data.provider = 'OpenCode Zen'

  return data
}

export async function handleOpenCodeZenStream({
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

  const response = await createOpenCodeZenRequest({
    body,
    originalModel,
    fetch,
  })
  if (!response.ok) {
    throw await parseOpenCodeZenError(response)
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
            'Error after client disconnect in OpenCode Zen stream',
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
        'Client cancelled stream, continuing OpenCode Zen consumption for billing',
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
      'Received non-JSON OpenCode Zen response',
    )
    return { state, patchedLine: line }
  }

  if (obj.model) obj.model = originalModel
  if (!obj.provider) obj.provider = 'OpenCode Zen'

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
  return choices.some((choice) => choice.finish_reason != null)
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

  if (
    'error' in data ||
    !data.usage ||
    state.billedAlready ||
    !isFinalChunk(data)
  ) {
    if (data.usage && (!isFinalChunk(data) || state.billedAlready)) {
      delete data.usage
    }
    return { state }
  }

  const usageData = extractUsageAndCost(
    data.usage as Record<string, unknown>,
    originalModel,
  )
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
      'Received error chunk in OpenCode Zen stream',
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
  const hasToolCallsDelta =
    Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0

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

export class OpenCodeZenError extends Error {
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
    this.name = 'OpenCodeZenError'
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

async function parseOpenCodeZenError(
  response: Response,
): Promise<OpenCodeZenError> {
  const errorText = await response.text()
  let errorBody: OpenCodeZenError['errorBody']
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
  return new OpenCodeZenError(response.status, response.statusText, errorBody)
}

function creditsToFakeCost(credits: number): number {
  return credits / ((1 + PROFIT_MARGIN) * 100)
}
