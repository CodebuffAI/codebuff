import { describe, expect, test } from 'bun:test'

import { getFileTokenScores } from '../parse'

import type { ParsedFileTokens } from '../parse'

describe('getFileTokenScores incremental reuse', () => {
  test('reuses cached parse output instead of re-parsing a file', async () => {
    // A path that does not exist on disk: a real parse would yield nothing, so
    // any score present can only have come from the reused parse data.
    const reuse: Record<string, ParsedFileTokens> = {
      'virtual/does-not-exist.ts': {
        identifiers: ['SentinelSymbol', 'anotherOne'],
        calls: [],
        numLines: 10,
      },
    }

    const data = await getFileTokenScores(
      '/nonexistent-root',
      ['virtual/does-not-exist.ts'],
      undefined,
      reuse,
    )

    const scores = data.tokenScores['virtual/does-not-exist.ts'] ?? {}
    expect(Object.keys(scores)).toContain('SentinelSymbol')
    // And the parsed map echoes the reused entry back for the next round's cache.
    expect(data.parsed['virtual/does-not-exist.ts']?.identifiers).toContain(
      'SentinelSymbol',
    )
  })

  test('returns parsed output for freshly parsed files', async () => {
    const data = await getFileTokenScores(process.cwd(), ['src/parse.ts'])
    expect(data.parsed['src/parse.ts']).toBeDefined()
    expect(data.parsed['src/parse.ts'].identifiers.length).toBeGreaterThan(0)
  })
})
