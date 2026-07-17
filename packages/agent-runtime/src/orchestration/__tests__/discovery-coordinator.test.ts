import { describe, expect, test } from 'bun:test'

import {
  buildDiscoveryQuestion,
  claimDiscoveryShard,
  completeDiscoveryShard,
  planDiscoveryBatch,
} from '../discovery-coordinator'

describe('discovery coordinator', () => {
  test('derives a stable non-empty question for params-only discovery agents', () => {
    const first = buildDiscoveryQuestion({
      agentType: 'code-searcher',
      spawnParams: {
        searchQueries: [
          { cwd: 'server/src', flags: '-g *.test.ts', pattern: 'worker' },
        ],
      },
    })
    const reordered = buildDiscoveryQuestion({
      agentType: 'code-searcher',
      spawnParams: {
        searchQueries: [
          { pattern: 'worker', flags: '-g *.test.ts', cwd: 'server/src' },
        ],
      },
    })

    expect(first).toBe(reordered)
    expect(first).toContain('worker')
    expect(first.length).toBeGreaterThan(0)
  })

  test('never records an empty shard question', () => {
    const claimed = claimDiscoveryShard({
      agentType: 'code-searcher',
      question: '   ',
      workspaceRevision: 1,
    })

    expect(claimed.state.shards[0].question).toBe('code-searcher discovery')
  })

  test('deduplicates candidates and merges evidence reasons', () => {
    const state = planDiscoveryBatch({
      query: 'find parser files',
      workspaceRevision: 1,
      result: {
        relatedFiles: ['src/parser.ts', './src/parser.ts:42'],
        matchedSnippets: [{ path: 'src/parser.ts' }, { file: 'src/token.ts' }],
        ignored: 'not a path',
      },
    })

    expect(state.candidates.map((candidate) => candidate.path)).toEqual([
      'src/parser.ts',
      'src/token.ts',
    ])
    expect(state.candidates[0].reasons).toEqual(['relatedFiles', 'path'])
    expect(state.unresolvedGaps).toEqual(['src/parser.ts', 'src/token.ts'])
  })

  test('marks omitted candidates stale after a workspace revision change', () => {
    const initial = planDiscoveryBatch({
      query: 'parser',
      workspaceRevision: 1,
      result: ['src/parser.ts', 'src/token.ts'],
    })
    initial.candidates = initial.candidates.map((candidate) => ({
      ...candidate,
      verified: true,
    }))

    const refreshed = planDiscoveryBatch({
      existing: initial,
      query: 'parser',
      workspaceRevision: 2,
      result: ['src/parser.ts'],
    })

    expect(
      refreshed.candidates.find((item) => item.path === 'src/parser.ts'),
    ).toMatchObject({
      stale: false,
      workspaceRevision: 2,
    })
    expect(
      refreshed.candidates.find((item) => item.path === 'src/token.ts'),
    ).toMatchObject({
      stale: true,
      workspaceRevision: 1,
    })
    expect(refreshed.unresolvedGaps).toEqual(['src/token.ts'])
  })

  test('stales unattested candidates when the workspace revision becomes known', () => {
    const initial = planDiscoveryBatch({
      query: 'parser',
      result: ['src/legacy.ts'],
    })
    initial.candidates[0].verified = true

    const refreshed = planDiscoveryBatch({
      existing: initial,
      query: 'parser',
      workspaceRevision: 1,
      result: [],
    })

    expect(refreshed.candidates[0]).toMatchObject({
      path: 'src/legacy.ts',
      stale: true,
      workspaceRevision: undefined,
    })
    expect(refreshed.unresolvedGaps).toEqual(['src/legacy.ts'])
  })

  test('rejects semantically duplicate active and completed shards', () => {
    const claimed = claimDiscoveryShard({
      agentType: 'file-picker',
      question: 'auth parser',
      workspaceRevision: 3,
    })

    expect(() =>
      claimDiscoveryShard({
        existing: claimed.state,
        agentType: 'file-picker',
        question: 'parser auth',
        workspaceRevision: 3,
      }),
    ).toThrow('Duplicate discovery shard')

    const completed = completeDiscoveryShard({
      existing: claimed.state,
      shardKey: claimed.shardKey,
      status: 'completed',
    })
    expect(() =>
      claimDiscoveryShard({
        existing: completed,
        agentType: 'file-picker',
        question: 'parser auth',
        workspaceRevision: 3,
      }),
    ).toThrow('already completed')
  })

  test('allows a failed shard to be retried and records completion', () => {
    const claimed = claimDiscoveryShard({
      agentType: 'code-searcher',
      question: 'mutation broker',
      workspaceRevision: 4,
    })
    const failed = completeDiscoveryShard({
      existing: claimed.state,
      shardKey: claimed.shardKey,
      status: 'failed',
    })
    const retried = claimDiscoveryShard({
      existing: failed,
      agentType: 'code-searcher',
      question: 'broker mutation',
      workspaceRevision: 4,
    })

    expect(failed?.shards[0]).toMatchObject({ status: 'failed' })
    expect(failed?.shards[0].completedAt).toBeNumber()
    expect(retried.shardKey).toBe(claimed.shardKey)
    expect(retried.state.shards).toHaveLength(2)
  })
})
