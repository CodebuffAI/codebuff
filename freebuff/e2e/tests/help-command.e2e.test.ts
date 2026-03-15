import { execSync } from 'child_process'

import { afterEach, describe, expect, test } from 'bun:test'

import { FreebuffSession, requireFreebuffBinary } from '../utils'

const TEST_TIMEOUT = 60_000

describe('Freebuff: --help flag', () => {
  test('shows CLI usage information', () => {
    const binary = requireFreebuffBinary()
    const output = execSync(`'${binary}' --help`, {
      encoding: 'utf-8',
      timeout: 10_000,
    })

    // Should show the binary name
    expect(output.toLowerCase()).toContain('freebuff')

    // Should show usage info
    expect(output).toMatch(/usage|options|commands/i)
  })

  test('does not reference Codebuff', () => {
    const binary = requireFreebuffBinary()
    const output = execSync(`'${binary}' --help`, {
      encoding: 'utf-8',
      timeout: 10_000,
    })

    // The --help output should say Freebuff, not Codebuff
    expect(output).not.toMatch(/\bcodebuff\b/i)
  })
})

describe('Freebuff: /help slash command', () => {
  let session: FreebuffSession | null = null

  afterEach(async () => {
    if (session) {
      await session.stop()
      session = null
    }
  })

  test(
    'shows help content when /help is entered',
    async () => {
      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary)
      await session.waitForReady()

      await session.send('/help')
      const output = await session.capture(2)

      // Should show shortcuts section
      expect(output).toMatch(/shortcut|ctrl|esc/i)
    },
    TEST_TIMEOUT,
  )

  test(
    'does not show subscription commands in help',
    async () => {
      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary)
      await session.waitForReady()

      await session.send('/help')
      const output = await session.capture(2)

      // Freebuff should NOT show these paid/subscription commands
      expect(output).not.toContain('/subscribe')
      expect(output).not.toContain('/usage')
      expect(output).not.toContain('/credits')
    },
    TEST_TIMEOUT,
  )
})
