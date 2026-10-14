import { describe, expect, test } from 'bun:test'

import { ensureCliTestEnv } from '../../__tests__/test-utils'

import type { LogRecordInput } from '@codebuff/common/schemas/logs'

ensureCliTestEnv()

const { createClientLogFlusher, toShippableRecord } =
  await import('../log-shipper')

describe('client log draining', () => {
  test('waits for an active request and drains every buffered batch', async () => {
    let releaseFirstRequest: (() => void) | undefined
    let markFirstRequestStarted: (() => void) | undefined
    const firstRequestStarted = new Promise<void>((resolve) => {
      markFirstRequestStarted = resolve
    })
    const firstRequestGate = new Promise<void>((resolve) => {
      releaseFirstRequest = resolve
    })
    const pending: LogRecordInput[] = Array.from(
      { length: 101 },
      (_, index) => ({ level: 'info', message: `record-${index}` }),
    )
    const batchSizes: number[] = []
    const flusher = createClientLogFlusher({
      takeBatch: () => pending.splice(0, 50),
      hasPending: () => pending.length > 0,
      sendBatch: async (batch) => {
        batchSizes.push(batch.length)
        if (batchSizes.length === 1) {
          markFirstRequestStarted?.()
          await firstRequestGate
        }
      },
    })

    void flusher.flush()
    await firstRequestStarted

    let drainFinished = false
    const drainPromise = flusher.drain().then(() => {
      drainFinished = true
    })
    await Promise.resolve()
    expect(drainFinished).toBe(false)

    releaseFirstRequest?.()
    await drainPromise

    expect(batchSizes).toEqual([50, 50, 1])
  })
})

describe('shipping an error', () => {
  // `/api/logs` is another process: the record is stringified on the way out,
  // and `name`/`message`/`stack` are non-enumerable, so an error buffered as
  // itself arrives with no reason attached.
  test('keeps the reason across the hop to /api/logs', () => {
    const record = toShippableRecord({
      level: 'error',
      message: '[ads] Failed to fetch ad',
      data: {
        provider: 'gravity',
        err: Object.assign(new Error('Unable to connect.'), {
          code: 'ECONNRESET',
          path: 'https://freebuff.com/api/ads',
        }),
      },
    })

    const wire = JSON.parse(JSON.stringify(record)) as {
      data: { err: Record<string, unknown> }
    }
    expect(wire.data.err.message).toBe('Unable to connect.')
    expect(wire.data.err.name).toBe('Error')
    expect(wire.data.err.code).toBe('ECONNRESET')
    expect(wire.data.err.path).toBe('https://freebuff.com/api/ads')
  })

  test('leaves a record without a payload alone', () => {
    const record = { level: 'info' as const, message: 'app_launched' }
    expect(toShippableRecord(record)).toBe(record)
  })
})
