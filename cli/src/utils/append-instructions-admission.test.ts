import { expect, test } from 'bun:test'
import { getCodebuffClient, resetCodebuffClient } from './codebuff-client'
import { AppendInstructionsError } from './append-instructions'

test('invalid host input fails real CLI client admission before auth/provider and remains fail closed after reset', async () => {
  const original = process.env.FREEBUFF_APPEND_INSTRUCTIONS_FILE
  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = (async () => { requests++; throw new Error('provider must not be contacted') }) as typeof fetch
  try {
    process.env.FREEBUFF_APPEND_INSTRUCTIONS_FILE = '/missing-private-instruction-canary'
    for (let attempt = 0; attempt < 2; attempt++) {
      resetCodebuffClient()
      await expect(getCodebuffClient()).rejects.toBeInstanceOf(AppendInstructionsError)
      delete process.env.FREEBUFF_APPEND_INSTRUCTIONS_FILE
    }
    expect(requests).toBe(0)
  } finally {
    globalThis.fetch = originalFetch
    if (original === undefined) delete process.env.FREEBUFF_APPEND_INSTRUCTIONS_FILE
    else process.env.FREEBUFF_APPEND_INSTRUCTIONS_FILE = original
  }
})
