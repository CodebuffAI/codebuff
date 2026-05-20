import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('@codebuff/bigquery', () => ({
  setupBigQuery: jest.fn(),
}))

jest.mock('@codebuff/billing', () => ({
  consumeCreditsAndAddAgentStep: jest.fn(),
  recordMessageWithoutBilling: jest.fn(),
}))

import type { ChatCompletionTraceRow } from '@codebuff/common/types/contracts/bigquery'
import type { ChatCompletionRequestBody } from '../types'
import type {
  recordChatCompletionTrace as recordChatCompletionTraceType,
  resetChatCompletionTraceCacheForTests as resetChatCompletionTraceCacheForTestsType,
} from '../helpers'

const testLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const baseBody = (
  messages: ChatCompletionRequestBody['messages'],
): ChatCompletionRequestBody => ({
    model: 'deepseek/deepseek-v4-pro',
    stream: true,
    messages,
    tools: [
      {
        type: 'function',
        function: { name: 'read_files', parameters: {} },
      },
    ],
    codebuff_metadata: {
      client_id: 'client-1',
      run_id: 'run-1',
      trace_session_id: 'session-1',
      trace_request_id: 'trace-1',
      cost_mode: 'free',
    },
})

describe('buildChatCompletionTraceRow', () => {
  let recordChatCompletionTrace: typeof recordChatCompletionTraceType
  let resetChatCompletionTraceCacheForTests: typeof resetChatCompletionTraceCacheForTestsType
  let rows: ChatCompletionTraceRow[]

  beforeAll(async () => {
    const helpers = await import('../helpers')
    recordChatCompletionTrace = helpers.recordChatCompletionTrace
    resetChatCompletionTraceCacheForTests =
      helpers.resetChatCompletionTraceCacheForTests
  })

  beforeEach(() => {
    resetChatCompletionTraceCacheForTests()
    rows = []
  })

  const record = async (params: {
    body: ChatCompletionRequestBody
    userId?: string
    agentId?: string
    ancestorRunIds?: string[]
  }) => {
    await recordChatCompletionTrace({
      body: params.body,
      userId: params.userId ?? 'user-1',
      agentId: params.agentId ?? 'base2-free-deepseek',
      ancestorRunIds: params.ancestorRunIds ?? [],
      logger: testLogger,
      insertChatCompletionTraceBigquery: async ({ row }) => {
        rows.push(row)
        return true
      },
    })
    return rows.at(-1)!
  }

  it('stores a full snapshot when the trace cache is cold', async () => {
    const row = await record({
      body: baseBody([{ role: 'user', content: 'hello' }]),
    })

    expect(row.trace_session_id).toBe('session-1')
    expect(row.trace_lineage_id).toBe('session-1')
    expect(row.message_start_index).toBe(0)
    expect(row.message_delta_count).toBe(1)
    expect(row.messages).toEqual([{ role: 'user', content: 'hello' }])
    expect(row.cache_hit).toBe(false)
    expect(row.full_snapshot).toBe(true)
    expect(row.tools_omitted).toBe(false)
    expect(row.tools).toHaveLength(1)
  })

  it('stores only the appended suffix for the same conversation', async () => {
    await record({
      body: baseBody([{ role: 'user', content: 'hello' }]),
    })

    const row = await record({
      body: baseBody([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
        { role: 'user', content: 'again' },
      ]),
    })

    expect(row.message_start_index).toBe(1)
    expect(row.common_prefix_length).toBe(1)
    expect(row.message_delta_count).toBe(2)
    expect(row.messages).toEqual([
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: 'again' },
    ])
    expect(row.cache_hit).toBe(true)
    expect(row.full_snapshot).toBe(false)
    expect(row.tools_omitted).toBe(true)
    expect(row.tools).toBeNull()
  })

  it('uses trace_session_id to keep root-agent history incremental across user prompts', async () => {
    await record({
      body: baseBody([{ role: 'user', content: 'hello' }]),
    })

    const otherRunBody = baseBody([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi from next prompt' },
    ])
    otherRunBody.codebuff_metadata = {
      ...otherRunBody.codebuff_metadata,
      client_id: 'client-2',
      run_id: 'run-2',
      trace_request_id: 'trace-2',
    }

    const row = await record({
      body: otherRunBody,
    })

    expect(row.trace_lineage_id).toBe('session-1')
    expect(row.cache_hit).toBe(true)
    expect(row.message_start_index).toBe(1)
    expect(row.messages).toEqual([
      { role: 'assistant', content: 'hi from next prompt' },
    ])
  })

  it('keeps child runs isolated even when trace_session_id matches', async () => {
    await record({
      body: baseBody([{ role: 'user', content: 'hello' }]),
      agentId: 'reviewer',
      ancestorRunIds: ['root-run-1'],
    })

    const otherRunBody = baseBody([{ role: 'user', content: 'hello' }])
    otherRunBody.codebuff_metadata = {
      ...otherRunBody.codebuff_metadata,
      run_id: 'run-2',
      trace_request_id: 'trace-2',
    }

    const row = await record({
      body: otherRunBody,
      agentId: 'reviewer',
      ancestorRunIds: ['root-run-1'],
    })

    expect(row.trace_lineage_id).toBe('run-2')
    expect(row.cache_hit).toBe(false)
    expect(row.message_start_index).toBe(0)
    expect(row.messages).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('does not advance the prefix cache when BigQuery insert fails', async () => {
    await recordChatCompletionTrace({
      body: baseBody([{ role: 'user', content: 'hello' }]),
      userId: 'user-1',
      agentId: 'base2-free-deepseek',
      ancestorRunIds: [],
      logger: testLogger,
      insertChatCompletionTraceBigquery: async () => false,
    })

    const row = await record({
      body: baseBody([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ]),
    })

    expect(row.cache_hit).toBe(false)
    expect(row.message_start_index).toBe(0)
    expect(row.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ])
  })

  it('skips the new table for old clients without trace_session_id', async () => {
    const body = baseBody([{ role: 'user', content: 'hello' }])
    body.codebuff_metadata = {
      client_id: 'client-1',
      run_id: 'run-1',
      cost_mode: 'free',
    }

    const traceRequestId = await recordChatCompletionTrace({
      body,
      userId: 'user-1',
      agentId: 'base2-free-deepseek',
      ancestorRunIds: [],
      logger: testLogger,
      insertChatCompletionTraceBigquery: async ({ row }) => {
        rows.push(row)
        return true
      },
    })

    expect(traceRequestId).toBeNull()
    expect(rows).toHaveLength(0)
    expect(body.codebuff_metadata?.trace_request_id).toBeUndefined()
  })
})
