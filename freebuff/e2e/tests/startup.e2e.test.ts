import { afterEach, describe, expect, test } from 'bun:test'

import { FreebuffSession, requireFreebuffBinary } from '../utils'

const STARTUP_TIMEOUT = 60_000

describe('Freebuff: Startup', () => {
  let session: FreebuffSession | null = null

  afterEach(async () => {
    if (session) {
      await session.stop()
      session = null
    }
  })

  test(
    'binary starts without crashing',
    async () => {
      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary)
      const output = await session.capture(3)

      // Should not contain fatal errors
      expect(output).not.toContain('FATAL')
      expect(output).not.toContain('panic')
      expect(output).not.toContain('Segmentation fault')

      // Should have some visible output (not a blank screen)
      const nonEmptyLines = output
        .split('\n')
        .filter((line) => line.trim().length > 0)
      expect(nonEmptyLines.length).toBeGreaterThan(0)
    },
    STARTUP_TIMEOUT,
  )

  test(
    'shows Freebuff branding',
    async () => {
      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary)
      const output = await session.capture(3)

      // The CLI should identify itself as Freebuff, not Codebuff
      const lowerOutput = output.toLowerCase()
      expect(lowerOutput).toContain('freebuff')
    },
    STARTUP_TIMEOUT,
  )

  test(
    'responds to Ctrl+C gracefully',
    async () => {
      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary)

      // Wait for startup, then send Ctrl+C
      await session.capture(2)
      await session.sendKey('C-c')

      // Give it a moment to process
      const output = await session.capture(1)

      // Should not show an unhandled error
      expect(output).not.toContain('Unhandled')
      expect(output).not.toContain('FATAL')
    },
    STARTUP_TIMEOUT,
  )
})
