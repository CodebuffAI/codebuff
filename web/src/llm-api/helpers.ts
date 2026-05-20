import { createHash, randomUUID } from 'node:crypto'

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

import type {
  ChatCompletionTraceRow,
  InsertChatCompletionTraceBigqueryFn,
  InsertMessageBigqueryFn,
} from '@codebuff/common/types/contracts/bigquery'
import type { Logger } from '@codebuff/common/types/contracts/logger'

import type { ChatCompletionRequestBody } from './types'

export type UsageData = {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  reasoningTokens: number
  cost: number
}

type TraceCacheEntry = {
  messageHashes: string[]
  toolsHash: string | null
}

const MAX_TRACE_CACHE_ENTRIES = 10_000
const traceCache = new Map<string, TraceCacheEntry>()

function stableJsonHash(value: unknown): string {
  const json = JSON.stringify(value)
  return createHash('sha256')
    .update(json ?? 'undefined')
    .digest('hex')
}

function getTraceCacheKey(params: {
  userId: string
  traceLineageId: string
  agentId: string
}) {
  const { userId, traceLineageId, agentId } = params
  return [userId, traceLineageId, agentId].join(':')
}

function countCommonPrefix(left: string[], right: string[]) {
  const max = Math.min(left.length, right.length)
  for (let i = 0; i < max; i++) {
    if (left[i] !== right[i]) return i
  }
  return max
}

function rememberTraceCacheEntry(key: string, entry: TraceCacheEntry) {
  if (traceCache.has(key)) {
    traceCache.delete(key)
  }
  traceCache.set(key, entry)

  while (traceCache.size > MAX_TRACE_CACHE_ENTRIES) {
    const oldestKey = traceCache.keys().next().value
    if (!oldestKey) break
    traceCache.delete(oldestKey)
  }
}

export function createRequestAuditRecord(body: unknown) {
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

function buildChatCompletionTraceRecord(params: {
  body: ChatCompletionRequestBody
  userId: string
  agentId: string
  ancestorRunIds: string[]
  traceRequestId: string
  createdAt: Date
}): {
  row: ChatCompletionTraceRow
  cacheKey: string
  cacheEntry: TraceCacheEntry
} {
  const { body, userId, agentId, ancestorRunIds, traceRequestId, createdAt } =
    params
  const messages = Array.isArray(body.messages) ? body.messages : []
  const tools = Array.isArray(body.tools) ? body.tools : undefined
  const metadata = body.codebuff_metadata
  const clientId =
    typeof metadata?.client_id === 'string' ? metadata.client_id : null
  const runId = typeof metadata?.run_id === 'string' ? metadata.run_id : ''
  const traceSessionId =
    typeof metadata?.trace_session_id === 'string'
      ? metadata.trace_session_id
      : undefined
  if (!traceSessionId) {
    throw new Error('trace_session_id is required for chat completion traces')
  }
  const traceLineageId = ancestorRunIds.length === 0 ? traceSessionId : runId
  const costMode =
    typeof metadata?.cost_mode === 'string' ? metadata.cost_mode : null
  const cacheKey = getTraceCacheKey({ userId, traceLineageId, agentId })
  const cached = traceCache.get(cacheKey)
  const messageHashes = messages.map(stableJsonHash)
  const commonPrefixLength = cached
    ? countCommonPrefix(cached.messageHashes, messageHashes)
    : 0
  const deltaMessages = messages.slice(commonPrefixLength)
  const deltaMessageHashes = messageHashes.slice(commonPrefixLength)
  const toolsHash = tools ? stableJsonHash(tools) : null
  const shouldIncludeTools = !!tools && cached?.toolsHash !== toolsHash

  const cacheEntry = {
    messageHashes,
    toolsHash,
  }

  return {
    cacheKey,
    cacheEntry,
    row: {
      id: traceRequestId,
      user_id: userId,
      client_id: clientId,
      trace_session_id: traceSessionId,
      trace_lineage_id: traceLineageId,
      run_id: runId,
      agent_id: agentId,
      created_at: createdAt,
      model: body.model,
      cost_mode: costMode,
      request: createRequestAuditRecord(body),
      message_count: messages.length,
      message_start_index: commonPrefixLength,
      message_delta_count: deltaMessages.length,
      previous_message_count: cached?.messageHashes.length ?? null,
      common_prefix_length: commonPrefixLength,
      cache_hit: !!cached,
      full_snapshot: commonPrefixLength === 0,
      messages: deltaMessages,
      delta_message_hashes: deltaMessageHashes,
      tool_count: tools?.length ?? 0,
      tools: shouldIncludeTools ? tools : null,
      tools_omitted: !!tools && !shouldIncludeTools,
    },
  }
}

export function buildChatCompletionTraceRow(
  params: Parameters<typeof buildChatCompletionTraceRecord>[0],
): ChatCompletionTraceRow {
  return buildChatCompletionTraceRecord(params).row
}

export async function insertChatCompletionTraceToBigQuery(params: {
  row: ChatCompletionTraceRow
  logger: Logger
  insertChatCompletionTraceBigquery: InsertChatCompletionTraceBigqueryFn
}) {
  const { row, logger, insertChatCompletionTraceBigquery } = params

  await setupBigQuery({ logger })
  const success = await insertChatCompletionTraceBigquery({
    row,
    logger,
  })
  if (!success) {
    logger.error(
      {
        traceId: row.id,
        userId: row.user_id,
        clientId: row.client_id,
        runId: row.run_id,
        messageDeltaCount: row.message_delta_count,
      },
      'Failed to insert chat completion trace into BigQuery',
    )
  }
  return success
}

export async function recordChatCompletionTrace(params: {
  body: ChatCompletionRequestBody
  userId: string
  agentId: string
  ancestorRunIds: string[]
  logger: Logger
  insertChatCompletionTraceBigquery?: InsertChatCompletionTraceBigqueryFn
}) {
  const {
    body,
    userId,
    agentId,
    ancestorRunIds,
    logger,
    insertChatCompletionTraceBigquery,
  } = params
  if (typeof body.codebuff_metadata?.trace_session_id !== 'string') {
    return null
  }
  if (!insertChatCompletionTraceBigquery) {
    return null
  }

  const traceRequestId = randomUUID()
  body.codebuff_metadata = {
    ...(body.codebuff_metadata ?? {}),
    trace_request_id: traceRequestId,
  }

  const { row, cacheKey, cacheEntry } = buildChatCompletionTraceRecord({
    body,
    userId,
    agentId,
    ancestorRunIds,
    traceRequestId,
    createdAt: new Date(),
  })

  try {
    const success = await insertChatCompletionTraceToBigQuery({
      row,
      logger,
      insertChatCompletionTraceBigquery,
    })
    if (success) {
      rememberTraceCacheEntry(cacheKey, cacheEntry)
    }
  } catch (error) {
    logger.error(
      { error, traceId: row.id },
      'Failed to insert chat completion trace into BigQuery',
    )
  }

  return traceRequestId
}

export function resetChatCompletionTraceCacheForTests() {
  traceCache.clear()
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
