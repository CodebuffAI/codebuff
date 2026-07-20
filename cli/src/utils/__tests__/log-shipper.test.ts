import { afterEach, describe, expect, test } from 'bun:test'

const originalAppUrl = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL
const originalShipLogs = process.env.CODEBUFF_SHIP_LOGS

afterEach(() => {
  if (originalAppUrl === undefined) {
    delete process.env.NEXT_PUBLIC_CODEBUFF_APP_URL
  } else {
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = originalAppUrl
  }
  if (originalShipLogs === undefined) {
    delete process.env.CODEBUFF_SHIP_LOGS
  } else {
    process.env.CODEBUFF_SHIP_LOGS = originalShipLogs
  }
})

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
    const batchSizes: number[] = []
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const body = (await request.json()) as { records: unknown[] }
        batchSizes.push(body.records.length)
        if (batchSizes.length === 1) {
          markFirstRequestStarted?.()
          await firstRequestGate
        }
        return Response.json({ success: true })
      },
    })

    try {
      process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = server.url.origin
      process.env.CODEBUFF_SHIP_LOGS = 'true'
      const { drainClientLogs, enqueueClientLog } = await import(
        `../log-shipper?drain-test=${Date.now()}`
      )

      for (let index = 0; index < 50; index++) {
        enqueueClientLog({ level: 'info', message: `first-${index}` })
      }
      await firstRequestStarted

      for (let index = 0; index < 51; index++) {
        enqueueClientLog({ level: 'info', message: `remaining-${index}` })
      }
      let drainFinished = false
      const drainPromise = drainClientLogs().then(() => {
        drainFinished = true
      })
      await Promise.resolve()
      expect(drainFinished).toBe(false)

      releaseFirstRequest?.()
      await drainPromise

      expect(batchSizes).toEqual([50, 50, 1])
    } finally {
      releaseFirstRequest?.()
      server.stop(true)
    }
  })
})
