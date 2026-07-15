import { describe, expect, test } from 'bun:test'

import { queryIndexParams } from '../params/tool/query-index'

describe('query_index result contract', () => {
  test('accepts safe path prefixes and rejects traversal or glob scopes', () => {
    expect(
      queryIndexParams.inputSchema.safeParse({
        query: 'auth',
        pathPrefixes: ['packages/runtime', 'docs'],
      }).success,
    ).toBe(true)
    for (const prefix of ['../outside', '/tmp/private', 'src/**']) {
      expect(
        queryIndexParams.inputSchema.safeParse({
          query: 'auth',
          pathPrefixes: [prefix],
        }).success,
      ).toBe(false)
    }
  })

  test('accepts the canonical versioned snapshot and per-result provenance', () => {
    const parsed = queryIndexParams.outputSchema.safeParse([
      {
        type: 'json',
        value: {
          kind: 'query_index_result',
          schemaVersion: 1,
          results: [
            {
              path: 'src/auth.ts',
              indexedHash: 'sha256:indexed',
              score: 1,
              matchedOn: ['symbol'],
            },
          ],
          totalIndexed: 1,
          indexAge: 5,
          snapshot: {
            schemaVersion: 1,
            snapshotId: 'snapshot',
            indexVersion: '2',
            builtAt: 1,
            workspaceRevision: 3,
          },
          message: 'Index ready.',
        },
      },
    ])

    expect(parsed.success).toBe(true)
  })

  test('rejects unversioned query envelopes', () => {
    expect(
      queryIndexParams.outputSchema.safeParse([
        {
          type: 'json',
          value: {
            results: [],
            totalIndexed: 0,
            indexAge: 0,
            message: 'legacy',
          },
        },
      ]).success,
    ).toBe(false)
  })
})
