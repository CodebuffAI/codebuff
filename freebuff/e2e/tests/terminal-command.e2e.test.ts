/**
 * E2E test that verifies Freebuff can run terminal commands.
 *
 * Starts Freebuff in tmux, sends a prompt asking it to run a shell command,
 * and verifies the command was executed by checking its side effects.
 *
 * Requires CODEBUFF_API_KEY — skipped if not set.
 */

import { afterEach, describe, expect, test } from 'bun:test'

import { FreebuffSession, requireFreebuffBinary } from '../utils'

const TEST_TIMEOUT = 1_000_000

function getApiKey(): string | null {
  return process.env.CODEBUFF_API_KEY ?? null
}

describe('Freebuff: Terminal Command', () => {
  let session: FreebuffSession | null = null

  afterEach(async () => {
    if (session) {
      await session.stop()
      session = null
    }
  })

  test(
    'runs a terminal command that creates a file',
    async () => {
      if (!getApiKey()) {
        console.log(
          'Skipping terminal-command test: CODEBUFF_API_KEY not set. ' +
            'Set it to run terminal-command e2e tests.',
        )
        return
      }

      const binary = requireFreebuffBinary()
      session = await FreebuffSession.start(binary, { waitSeconds: 5 })

      // Wait for the CLI to be fully ready before sending input
      await session.waitForReady()

      // Ask freebuff to run a shell command whose output can only come from
      // actual terminal execution (not file-writing tools)
      await session.send(
        'Execute a shell command in the terminal to write the current Unix timestamp in seconds to timestamp.txt',
      )

      // Wait for the file to be created by the terminal command
      const content = await session.waitForFileContent(
        'timestamp.txt',
        '',
        120_000,
      )

      // The file should contain a Unix timestamp (numeric string)
      const trimmed = content.trim()
      expect(trimmed).toMatch(/^\d{10,}$/)

      // Verify the timestamp is recent (within the last 5 minutes)
      const timestamp = parseInt(trimmed, 10)
      const now = Math.floor(Date.now() / 1000)
      expect(Math.abs(now - timestamp)).toBeLessThan(300)
    },
    TEST_TIMEOUT,
  )
})
