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

  test('reports deterministic file-budget truncation and spreads work across prefixes', async () => {
    const files = ['apps/a.ts', 'packages/a.ts', 'apps/b.ts', 'packages/b.ts']
    const data = await getFileTokenScores(
      process.cwd(),
      files,
      () => 'export function sharedSymbol() { return 1 }\n',
      undefined,
      { maxFiles: 2, maxFileBytes: 10_000, maxTotalBytes: 100_000 },
    )

    expect(data.coverage).toMatchObject({
      requestedFiles: 4,
      freshParsedFiles: 2,
      skippedFiles: 2,
      fileBudgetExceeded: true,
      byteBudgetExceeded: false,
      truncated: true,
    })
    expect(
      Object.keys(data.parsed).some((file) => file.startsWith('apps/')),
    ).toBe(true)
    expect(
      Object.keys(data.parsed).some((file) => file.startsWith('packages/')),
    ).toBe(true)
    expect(data.coverage.skippedPrefixes).toEqual(['apps', 'packages'])
  })

  test('reports byte-budget and oversized-file coverage separately', async () => {
    const data = await getFileTokenScores(
      process.cwd(),
      ['src/large.ts', 'src/first.ts', 'src/after.ts'],
      (filePath) =>
        filePath.endsWith('large.ts')
          ? 'x'.repeat(50)
          : filePath.endsWith('first.ts')
            ? 'x'.repeat(8)
            : 'x'.repeat(5),
      undefined,
      { maxFiles: 10, maxFileBytes: 10, maxTotalBytes: 10 },
    )

    expect(data.coverage.oversizedFiles).toBe(1)
    expect(data.coverage.byteBudgetExceeded).toBe(true)
    expect(data.coverage.skippedFiles).toBe(2)
    expect(data.coverage.skippedKnownBytes).toBeGreaterThanOrEqual(50)
    expect(data.coverage.truncated).toBe(true)
  })
})
