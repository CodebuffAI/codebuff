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
    'ads:enable command is not available',
    async () => {
      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary, { waitSeconds: 5 })

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
    'ads:disable command is not available',
    async () => {
      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary, { waitSeconds: 5 })

      // Try to send the /ads:disable command
      await session.send('/ads:disable')
      const output = await session.capture(3)

      // The command should not be recognized
      // It should NOT show "Ads disabled" confirmation
      expect(output).not.toMatch(/ads disabled/i)
    },
    TEST_TIMEOUT,
  )

  test(
    'does not show credits earned from ads',
    async () => {
      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary, { waitSeconds: 5 })
      const output = await session.capture()

      // In Freebuff, ads don't show "+X credits" because credits don't apply
      // Check the startup screen doesn't mention ad credits
      expect(output).not.toMatch(/\+\d+ credits/)
    },
    TEST_TIMEOUT,
  )

  test(
    'does not show "Hide ads" option',
    async () => {
      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary, { waitSeconds: 5 })
      const output = await session.capture()

      // In Freebuff, the "Hide ads" link is not shown because ads are mandatory
      expect(output).not.toContain('Hide ads')
      // Also should not mention /ads:enable as a way to re-enable
      expect(output).not.toContain('/ads:enable')
    },
    TEST_TIMEOUT,
  )
})
