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
    'binary renders its boot screen',
    async () => {
      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary)

      // The 3rd row of the FREEBUFF ASCII logo: the crossbars of F and R
      // adjacent. Picked because the logo renders for *every* valid boot
      // state — model picker, waiting room, country-blocked (which is what
      // CI runners hit, since GitHub Actions egress is flagged as anonymized
      // network) — but never appears if module init crashes before React
      // mounts (the post-OpenTUI-upgrade tree-sitter wasm regression). This
      // gives us a positive "boot succeeded" signal that's robust against
      // novel error modes, not just the ones we listed below.
      const output = await session.waitForText('█████╗  ██████╔╝')

      // Belt-and-braces: known fatal markers should never coexist with a
      // rendered logo, but if some race ever surfaces one we still want to
      // see it called out clearly rather than buried in raw output.
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
