import { describe, expect, test } from 'bun:test'

import { ensureCliTestEnv } from '../../__tests__/test-utils'

import type { LogRecordInput } from '@codebuff/common/schemas/logs'

ensureCliTestEnv()

const { createClientLogFlusher } = await import('../log-shipper')

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
