import { afterEach, describe, expect, test } from 'bun:test'

import { FreebuffSession, requireFreebuffBinary } from '../utils'

const TEST_TIMEOUT = 60_000

describe('Freebuff: Ads Behavior', () => {
  let session: FreebuffSession | null = null

  afterEach(async () => {
    if (session) {
      await session.stop()
      session = null
    }
  })

  test(
    'ads commands are not available',
    async () => {
      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary)
      await session.waitForReady()

      // Type "/ads" to check for ads commands in autocomplete
      await session.send('/ads', { noEnter: true })
      const output = await session.capture(2)

      // Neither ads:enable nor ads:disable should appear
      expect(output).not.toContain('ads:enable')
      expect(output).not.toContain('ads:disable')
    },
    TEST_TIMEOUT,
  )

  test(
    'startup screen does not show ad-related UI',
    async () => {
      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary)
      await session.waitForReady()

      const output = await session.capture()

      // Ads are always enabled in Freebuff — no credits or toggle UI
      expect(output).not.toMatch(/\+\d+ credits/)
      expect(output).not.toContain('Hide ads')
      expect(output).not.toContain('/ads:enable')
    },
    TEST_TIMEOUT,
  )
})
