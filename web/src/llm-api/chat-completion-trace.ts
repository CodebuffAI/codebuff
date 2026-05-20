import { createHash, randomUUID } from 'node:crypto'

import { setupBigQuery } from '@codebuff/bigquery'

import { createRequestAuditRecord } from './request-audit'

import type {
  ChatCompletionTraceRow,
  InsertChatCompletionTraceBigqueryFn,
} from '@codebuff/common/types/contracts/bigquery'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ChatCompletionRequestBody } from './types'

type TraceCacheEntry = {
  messageHashes: string[]
  toolsHash: string | null
}

const MAX_TRACE_CACHE_ENTRIES = 10_000
const MAX_TRACE_CACHE_MESSAGE_HASHES = 250_000
const traceCache = new Map<string, TraceCacheEntry>()
let traceCacheMessageHashCount = 0

type ScheduleTraceWrite = (task: () => Promise<void>) => void

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
    forgetTraceCacheEntry(key)
  }
  traceCache.set(key, entry)
  traceCacheMessageHashCount += entry.messageHashes.length

  while (
    traceCache.size > MAX_TRACE_CACHE_ENTRIES ||
    traceCacheMessageHashCount > MAX_TRACE_CACHE_MESSAGE_HASHES
  ) {
    const oldestKey = traceCache.keys().next().value
    if (!oldestKey) break
    forgetTraceCacheEntry(oldestKey)
  }
}

function forgetTraceCacheEntry(key: string) {
  const entry = traceCache.get(key)
  if (!entry) return
  traceCache.delete(key)
  traceCacheMessageHashCount -= entry.messageHashes.length
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

export function recordChatCompletionTrace(params: {
  body: ChatCompletionRequestBody
  userId: string
  agentId: string
  ancestorRunIds: string[]
  logger: Logger
  insertChatCompletionTraceBigquery?: InsertChatCompletionTraceBigqueryFn
  scheduleTraceWrite?: ScheduleTraceWrite
}) {
  const {
    body,
    userId,
    agentId,
    ancestorRunIds,
    logger,
    insertChatCompletionTraceBigquery,
    scheduleTraceWrite = (task) => {
      setTimeout(() => {
        void task()
      }, 0)
    },
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

  scheduleTraceWrite(() => {
    let traceRecord: ReturnType<typeof buildChatCompletionTraceRecord>
    try {
      traceRecord = buildChatCompletionTraceRecord({
        body,
        userId,
        agentId,
        ancestorRunIds,
        traceRequestId,
        createdAt: new Date(),
      })
    } catch (error) {
      logger.error(
        { error, traceId: traceRequestId },
        'Failed to build chat completion trace row',
      )
      return Promise.resolve()
    }

    return insertChatCompletionTraceToBigQuery({
      row: traceRecord.row,
      logger,
      insertChatCompletionTraceBigquery,
    })
      .then((success) => {
        if (success) {
          rememberTraceCacheEntry(traceRecord.cacheKey, traceRecord.cacheEntry)
        }
      })
      .catch((error) => {
        logger.error(
          { error, traceId: traceRecord.row.id },
          'Failed to insert chat completion trace into BigQuery',
        )
      })
  })

  return traceRequestId
}

export function resetChatCompletionTraceCacheForTests() {
  traceCache.clear()
  traceCacheMessageHashCount = 0
}
