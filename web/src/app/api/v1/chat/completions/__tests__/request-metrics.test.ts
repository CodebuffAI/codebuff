import { describe, expect, it, mock } from 'bun:test'

import {
  beginChatCompletionRequestMetrics,
  getActiveChatCompletionRequestCount,
} from '../request-metrics'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const createLogger = (): Logger => ({
  debug: mock(() => {}),
  error: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
})

const baseParams = (logger: Logger) => ({
  logger,
  userId: 'user-1',
  agentId: 'agent-1',
  runId: 'run-1',
  model: 'provider/model',
  streaming: true,
  costMode: 'normal',
  logSampleRate: 1,
})

const drainStream = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader()
  while (true) {
    const { done } = await reader.read()
    if (done) return
  }
}

describe('chat completion request metrics', () => {
  it('increments and decrements when manually ended', () => {
    const logger = createLogger()
    const metrics = beginChatCompletionRequestMetrics(baseParams(logger))

    expect(getActiveChatCompletionRequestCount()).toBe(1)

    metrics.end('completed')
    metrics.end('completed')

    expect(getActiveChatCompletionRequestCount()).toBe(0)
    expect(logger.info).toHaveBeenCalledTimes(2)
  })

  it('tracks requests without logging when sampling skips the request', () => {
    const logger = createLogger()
    const metrics = beginChatCompletionRequestMetrics({
      ...baseParams(logger),
      logSampleRate: 0,
    })

    expect(getActiveChatCompletionRequestCount()).toBe(1)

    metrics.end('completed')

    expect(getActiveChatCompletionRequestCount()).toBe(0)
    expect(logger.info).toHaveBeenCalledTimes(0)
  })

  it('emits queueMs and contentBytes when provided', () => {
    const logger = createLogger()
    const metrics = beginChatCompletionRequestMetrics({
      ...baseParams(logger),
      queueMs: 1234,
      contentBytes: 65536,
    })
    metrics.end('completed')

    const startFields = (logger.info as ReturnType<typeof mock>).mock
      .calls[0][0]
    expect(startFields).toMatchObject({ queueMs: 1234, contentBytes: 65536 })
  })

  it('omits contentBytes/queueMs fields when absent', () => {
    const logger = createLogger()
    const metrics = beginChatCompletionRequestMetrics(baseParams(logger))
    metrics.end('completed')

    const startFields = (logger.info as ReturnType<typeof mock>).mock
      .calls[0][0]
    expect(startFields).not.toHaveProperty('contentBytes')
    expect(startFields).not.toHaveProperty('queueMs')
  })

  it('logs a long-queued request even when sampling would skip it', () => {
    const logger = createLogger()
    const metrics = beginChatCompletionRequestMetrics({
      ...baseParams(logger),
      logSampleRate: 0,
      queueMs: 8000,
    })
    metrics.end('completed')

    // start + finish both logged despite logSampleRate 0
    expect(logger.info).toHaveBeenCalledTimes(2)
  })

  it('decrements when a wrapped stream completes', async () => {
    const logger = createLogger()
    const metrics = beginChatCompletionRequestMetrics(baseParams(logger))
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: test\n\n'))
        controller.close()
      },
    })

    await drainStream(metrics.wrapStream(stream))

    expect(getActiveChatCompletionRequestCount()).toBe(0)
    expect(logger.info).toHaveBeenCalledTimes(2)
  })

  it('decrements when a wrapped stream is cancelled', async () => {
    const logger = createLogger()
    const metrics = beginChatCompletionRequestMetrics(baseParams(logger))
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: test\n\n'))
      },
    })

    const reader = metrics.wrapStream(stream).getReader()
    await reader.cancel('client disconnected')

    expect(getActiveChatCompletionRequestCount()).toBe(0)
    expect(logger.info).toHaveBeenCalledTimes(2)
  })

  it('decrements when a wrapped stream errors', async () => {
    const logger = createLogger()
    const metrics = beginChatCompletionRequestMetrics(baseParams(logger))
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('provider stream failed')
      },
    })

    await expect(drainStream(metrics.wrapStream(stream))).rejects.toThrow(
      'provider stream failed',
    )

    expect(getActiveChatCompletionRequestCount()).toBe(0)
    expect(logger.info).toHaveBeenCalledTimes(2)
  })
})
