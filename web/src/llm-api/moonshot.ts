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
import { addKimiToolCompatibilityFields } from './kimi-tool-compat'

import type { UsageData } from './helpers'
import type { InsertMessageBigqueryFn } from '@codebuff/common/types/contracts/bigquery'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  ChatCompletionContentPart,
  ChatCompletionRequestBody,
  ChatCompletionTool,
} from './types'

const MOONSHOT_BASE_URL = 'https://api.moonshot.ai/v1'
const MOONSHOT_HEADERS_TIMEOUT_MS = 30 * 60 * 1000

const moonshotAgent = new Agent({
  headersTimeout: MOONSHOT_HEADERS_TIMEOUT_MS,
  bodyTimeout: 0,
})

interface MoonshotPricing {
  inputCostPerToken: number
  cachedInputCostPerToken: number
  outputCostPerToken: number
}

const MOONSHOT_MODEL_MAP: Record<string, string> = {
  'moonshotai/kimi-k2.6': 'kimi-k2.6',
}

const MOONSHOT_PRICING: Record<string, MoonshotPricing> = {
  'moonshotai/kimi-k2.6': {
    inputCostPerToken: 0.95 / 1_000_000,
    cachedInputCostPerToken: 0.16 / 1_000_000,
    outputCostPerToken: 4.0 / 1_000_000,
  },
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

type MoonshotChatMessage = ChatCompletionRequestBody['messages'][number] & {
  cache_control?: unknown
  reasoning_content?: string | null
}

export function isMoonshotModel(model: unknown): model is string {
  return typeof model === 'string' && model in MOONSHOT_MODEL_MAP
}

function getMoonshotModelId(model: string): string {
  return MOONSHOT_MODEL_MAP[model] ?? model
}

function getMoonshotPricing(model: string): MoonshotPricing {
  const pricing = MOONSHOT_PRICING[model]
  if (!pricing) {
    throw new Error(`No Moonshot pricing found for model: ${model}`)
  }
  return pricing
}

function getMoonshotApiKey(): string {
  const apiKey = env.MOONSHOT_API_KEY
  if (!apiKey) {
    throw new Error('MOONSHOT_API_KEY is not configured')
  }
  return apiKey
}

function createMoonshotRequest(params: {
  body: ChatCompletionRequestBody
  originalModel: string
  fetch: typeof globalThis.fetch
}) {
  const { body, originalModel, fetch } = params
  const moonshotBody = buildMoonshotRequestBody(body, originalModel)

  return fetch(`${MOONSHOT_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getMoonshotApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(moonshotBody),
    // @ts-expect-error - dispatcher is a valid undici option not in fetch types
    dispatcher: moonshotAgent,
  })
}

export function buildMoonshotRequestBody(
  body: ChatCompletionRequestBody,
  originalModel: string,
): Record<string, unknown> {
  const moonshotCompatibleBody = addKimiToolCompatibilityFields(body)
  const moonshotBody: Record<string, unknown> = {
    ...moonshotCompatibleBody,
    messages: normalizeMoonshotMessages(moonshotCompatibleBody.messages ?? []),
    tools: moonshotCompatibleBody.tools?.map(normalizeMoonshotTool),
    model: getMoonshotModelId(originalModel),
  }

  moonshotBody.thinking = createMoonshotThinking(moonshotBody)

  delete moonshotBody.reasoning
  delete moonshotBody.reasoning_effort
  delete moonshotBody.provider
  delete moonshotBody.transforms
  delete moonshotBody.codebuff_metadata
  delete moonshotBody.usage

  if (moonshotBody.stream) {
    moonshotBody.stream_options = { include_usage: true }
  }

  return moonshotBody
}

function createMoonshotThinking(
  moonshotBody: Record<string, unknown>,
): Record<string, unknown> {
  const reasoning =
    moonshotBody.reasoning && typeof moonshotBody.reasoning === 'object'
      ? (moonshotBody.reasoning as { enabled?: boolean })
      : undefined
  if (reasoning?.enabled === false) {
    return { type: 'disabled' }
  }

  const existingThinking =
    moonshotBody.thinking && typeof moonshotBody.thinking === 'object'
      ? (moonshotBody.thinking as Record<string, unknown>)
      : {}
  if (existingThinking.type === 'disabled') {
    return { type: 'disabled' }
  }

  return {
    ...existingThinking,
    type: 'enabled',
    keep: 'all',
  }
}

function normalizeMoonshotMessages(
  messages: ChatCompletionRequestBody['messages'],
): MoonshotChatMessage[] {
  return messages.map((message) => {
    const {
      cache_control: _cacheControl,
      content,
      ...rest
    } = message as MoonshotChatMessage
    return {
      ...rest,
      ...(content !== undefined && {
        content: normalizeMoonshotContent(content),
      }),
    }
  })
}

function normalizeMoonshotContent(
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

function normalizeMoonshotTool(tool: ChatCompletionTool): ChatCompletionTool {
  const { function: fn, ...rest } = tool
  if (!fn) return rest

  return {
    ...rest,
    function: {
      ...fn,
      strict: true,
    },
  }
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
    typeof usage.cached_tokens === 'number'
      ? usage.cached_tokens
      : typeof promptDetails?.cached_tokens === 'number'
        ? promptDetails.cached_tokens
        : 0
  const reasoningTokens =
    typeof completionDetails?.reasoning_tokens === 'number'
      ? completionDetails.reasoning_tokens
      : 0

  const pricing = getMoonshotPricing(model)
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

export async function handleMoonshotNonStream({
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

  const response = await createMoonshotRequest({ body, originalModel, fetch })
  if (!response.ok) {
    throw await parseMoonshotError(response)
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
    ttftMs: null,
  })

  if (data.usage) {
    data.usage.cost = creditsToFakeCost(billedCredits)
    data.usage.cost_details = { upstream_inference_cost: 0 }
  }

  data.model = originalModel
  if (!data.provider) data.provider = 'Moonshot'

  return data
}

export async function handleMoonshotStream({
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

  const response = await createMoonshotRequest({ body, originalModel, fetch })
  if (!response.ok) {
    throw await parseMoonshotError(response)
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
            'Error after client disconnect in Moonshot stream',
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
        'Client cancelled stream, continuing Moonshot consumption for billing',
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
      'Received non-JSON Moonshot response',
    )
    return { state, patchedLine: line }
  }

  if (obj.model) obj.model = originalModel
  if (!obj.provider) obj.provider = 'Moonshot'

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
      'Received error chunk in Moonshot stream',
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

export class MoonshotError extends Error {
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
    this.name = 'MoonshotError'
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

async function parseMoonshotError(response: Response): Promise<MoonshotError> {
  const errorText = await response.text()
  let errorBody: MoonshotError['errorBody']
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
  return new MoonshotError(response.status, response.statusText, errorBody)
}

function creditsToFakeCost(credits: number): number {
  return credits / ((1 + PROFIT_MARGIN) * 100)
}
