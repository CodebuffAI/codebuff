import { describe, expect, test } from 'bun:test'

import { handleIndexCommand } from '../index-command'

const createDeps = (overrides: Record<string, unknown> = {}) => {
  const manager = {
    markStale: () => {},
    ensureBuilt: () => {},
    waitUntilReady: async () => {},
    query: () => ({
      results: [],
      ready: true,
      totalIndexed: 42,
      indexAge: 65_000,
      status: {
        state: 'ready' as const,
        ready: true,
        stale: false,
        refreshing: false,
        semantic: 'unavailable' as const,
        totalIndexed: 42,
        indexAge: 65_000,
        diagnostics: [],
        message: 'Index ready.',
      },
    }),
    queryBlended: async () => ({
      results: [
        {
          path: 'src/auth.ts',
          score: 12.345,
          matchedOn: ['symbol'],
          explanation: 'Defines authenticate.',
        },
      ],
      ready: true,
      totalIndexed: 42,
      indexAge: 65_000,
      status: {
        state: 'ready' as const,
        ready: true,
        stale: false,
        refreshing: false,
        semantic: 'unavailable' as const,
        totalIndexed: 42,
        indexAge: 65_000,
        diagnostics: [],
        message: 'Index ready.',
      },
    }),
    isSemanticReady: () => false,
    ...overrides,
  }
  return {
    manager,
    deps: {
      getManager: () => ({
        enabled: true,
        semanticEnabled: true,
        manager,
      }),
    },
  }
}

describe('/index command', () => {
  test('reports readiness, age, corpus size, and semantic fallback', async () => {
    const { deps } = createDeps()

    const result = await handleIndexCommand('status', deps)

    expect(result).toContain('Index status: ready')
    expect(result).toContain('42 indexed files')
    expect(result).toContain('Age: 1m')
    expect(result).toContain('metadata-only fallback')
  })

  test('renders stale, degraded, coverage, and parser diagnostics faithfully', async () => {
    const { deps } = createDeps({
      query: () => ({
        results: [],
        ready: true,
        totalIndexed: 100,
        indexAge: 2_000,
        status: {
          state: 'degraded' as const,
          ready: true,
          stale: true,
          refreshing: true,
          semantic: 'failed' as const,
          totalIndexed: 100,
          indexAge: 2_000,
          diagnostics: [
            { filePath: 'src/bad.ts', stage: 'parse', message: 'syntax error' },
          ],
          coverage: {
            truncated: true,
            maxFiles: 100,
            skippedFiles: 12,
            skippedPrefixes: ['vendor'],
          },
          message: 'Index ready with parser diagnostics.',
        },
      }),
    })

    const result = await handleIndexCommand('status', deps)

    expect(result).toContain('degraded · refreshing')
    expect(result).toContain('Coverage: partial')
    expect(result).toContain('src/bad.ts (parse): syntax error')
    expect(result).toContain('failed (metadata-only fallback)')
  })

  test('requests a safe refresh and waits for status', async () => {
    let marked = false
    let ensured = false
    let waited = false
    const { deps } = createDeps({
      markStale: () => {
        marked = true
      },
      ensureBuilt: () => {
        ensured = true
      },
      waitUntilReady: async () => {
        waited = true
      },
    })

    const result = await handleIndexCommand('rebuild', deps)

    expect({ marked, ensured, waited }).toEqual({
      marked: true,
      ensured: true,
      waited: true,
    })
    expect(result).toContain('Index refresh requested')
  })

  test('explains ranked results with provenance', async () => {
    const { deps } = createDeps()

    const result = await handleIndexCommand('explain authentication', deps)

    expect(result).toContain('src/auth.ts')
    expect(result).toContain('matched symbol')
    expect(result).toContain('Defines authenticate.')
  })

  test('reports disabled indexing without creating a manager', async () => {
    const result = await handleIndexCommand('status', {
      getManager: () => ({
        enabled: false,
        semanticEnabled: false,
        manager: null,
      }),
    })

    expect(result).toContain('disabled in openbuff.json')
    expect(result).toContain('read_subtree, glob, or code_search')
  })
})
