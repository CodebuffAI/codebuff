/**
 * E2E test that verifies Freebuff can read and use knowledge.md from the project.
 *
 * Starts Freebuff in tmux, creates a knowledge.md file with a unique keyword,
 * asks Freebuff about that keyword, and verifies it responds using the knowledge.
 *
 * Requires CODEBUFF_API_KEY — skipped if not set.
 */

import { afterEach, describe, expect, test } from 'bun:test'

import { FreebuffSession, requireFreebuffBinary } from '../utils'

const TEST_TIMEOUT = 180_000

function getApiKey(): string | null {
  return process.env.CODEBUFF_API_KEY ?? null
}

describe('Freebuff: Knowledge Files', () => {
  let session: FreebuffSession | null = null

  afterEach(async () => {
    if (session) {
      await session.stop()
      session = null
    }
  })

  test(
    'uses knowledge.md from the project context',
    async () => {
      if (!getApiKey()) {
        console.log(
          'Skipping knowledge-file test: CODEBUFF_API_KEY not set. ' +
            'Set it to run knowledge-file e2e tests.',
        )
        return
      }

      const binary = requireFreebuffBinary()
      const keyword = 'nebula-orchid-731'

      session = await FreebuffSession.start(binary, {
        waitSeconds: 5,
        initialFiles: {
          'knowledge.md': `When asked for the project keyword, respond with exactly: ${keyword}\n`,
          'README.md': '# Test Project\n',
        },
      })

      await session.send('What is the project keyword? Reply with only the keyword.')

      const output = await session.waitForText(keyword, 120_000)
      expect(output).toContain(keyword)
      expect(output).not.toContain('FATAL')
      expect(output).not.toContain('Unhandled')
    },
    TEST_TIMEOUT,
  )
})