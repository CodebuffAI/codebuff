import { afterEach, describe, expect, test } from 'bun:test'

import { FreebuffSession, requireFreebuffBinary } from '../utils'

const TEST_TIMEOUT = 60_000
const SESSION_HEIGHT = 40

/**
 * Commands that should be REMOVED in Freebuff.
 * These are stripped at build time via the FREEBUFF_REMOVED_COMMAND_IDS set
 * in cli/src/data/slash-commands.ts.
 */
const REMOVED_COMMANDS = [
  '/subscribe',
  '/usage',
  '/credits',
  '/ads:enable',
  '/ads:disable',
  '/connect:claude',
  '/refer-friends',
  '/agent:gpt-5',
  '/image',
  '/publish',
  '/init',
]

/**
 * Commands that should be KEPT in Freebuff.
 * Only includes commands reliably visible in the initial autocomplete viewport.
 * Commands like /logout and /exit exist but may be scrolled off-screen.
 */
const KEPT_COMMANDS = [
  '/help',
  '/new',
  '/history',
  '/feedback',
  '/bash',
  '/theme:toggle',
]

describe('Freebuff: Slash Commands', () => {
  let session: FreebuffSession | null = null

  afterEach(async () => {
    if (session) {
      await session.stop()
      session = null
    }
  })

  test(
    'slash command menu does not show removed commands',
    async () => {
      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary, { waitSeconds: 5, height: SESSION_HEIGHT })

      // Type "/" to trigger the slash command autocomplete menu
      // Use sendKey instead of send to avoid C-u clearing keystroke that
      // interferes with opentui's input handling in newer versions
      await session.sendKey('/')
      const output = await session.capture(4)

      // Removed commands should NOT appear in the autocomplete menu
      for (const cmd of REMOVED_COMMANDS) {
        // Strip the leading slash for matching since the menu shows command ids
        const cmdId = cmd.slice(1)
        expect(output).not.toContain(cmdId)
      }
    },
    TEST_TIMEOUT,
  )

  test(
    'slash command menu shows kept commands',
    async () => {
      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary, { waitSeconds: 5, height: SESSION_HEIGHT })

      // Type "/" to trigger the slash command autocomplete menu
      await session.sendKey('/')
      const output = await session.capture(4)

      // Kept commands SHOULD appear in the autocomplete menu
      for (const cmd of KEPT_COMMANDS) {
        const cmdId = cmd.slice(1)
        expect(output).toContain(cmdId)
      }
    },
    TEST_TIMEOUT,
  )

  test(
    'no mode-related slash commands are visible',
    async () => {
      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary, { waitSeconds: 5, height: SESSION_HEIGHT })

      // Type "/mode" to check for mode commands
      // Use sendKey for the full string to avoid C-u clearing the input
      await session.sendKey('/mode')
      const output = await session.capture(4)

      // Mode commands should not exist in Freebuff
      expect(output).not.toContain('mode:max')
      expect(output).not.toContain('mode:default')
      expect(output).not.toContain('mode:lite')
      expect(output).not.toContain('mode:free')
    },
    TEST_TIMEOUT,
  )
})
