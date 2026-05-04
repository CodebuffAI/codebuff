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
    'binary reaches the model selection screen',
    async () => {
      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary)

      // Wait for the model selector to render. This proves the binary survived
      // module init (including the eager tree-sitter Parser.init that crashed
      // Windows binaries after the OpenTUI 0.2.2 upgrade), passed the auth /
      // session API call, and successfully mounted the React tree. A pure
      // "non-empty output" check would pass on a half-rendered crash screen.
      const output = await session.waitForText('Pick a model to start')

      // earlyFatalHandler in cli/src/index.tsx writes this to stderr on
      // unhandled rejections during startup. Belt-and-braces: the wait above
      // would already have timed out, but if some race ever surfaces a fatal
      // *after* the model selector renders, we still want it to fail.
      expect(output).not.toContain('Fatal error during startup')
      expect(output).not.toContain('Internal error: tree-sitter.wasm not found')
      expect(output).not.toContain('FATAL')
      expect(output).not.toContain('panic')
      expect(output).not.toContain('Segmentation fault')
    },
    STARTUP_TIMEOUT,
  )

  test(
    'responds to Ctrl+C gracefully',
    async () => {
      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary)
      await session.waitForReady()

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
