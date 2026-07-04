import { describe, expect, test } from 'bun:test'

import { CommitSelectionSchema } from '../pick-commits'

/**
 * Unit tests for the lenient CommitSelectionSchema normalization.
 *
 * Background: the routed commit-screening model (iamhc/glm-5.2 via the default
 * route) frequently returns field-name variants like `selected_commits`,
 * `commits`, `selected`, `is_hard`, `commit`, and `commit_hash` instead of the
 * canonical `selectedCommits` key. The schema accepts the observed variants
 * and normalizes them into the shape `processCommit` consumes.
 */
describe('CommitSelectionSchema variant normalization', () => {
  test('accepts the canonical `selectedCommits` key', () => {
    const raw = {
      selectedCommits: [
        {
          sha: 'abc1234',
          reason: 'complex caching logic',
          shortDescription: 'adds cache invalidation',
        },
      ],
    }
    const parsed = CommitSelectionSchema.parse(raw)
    expect(parsed.selectedCommits).toHaveLength(1)
    expect(parsed.selectedCommits[0].sha).toBe('abc1234')
    expect(parsed.selectedCommits[0].reason).toBe('complex caching logic')
    expect(parsed.selectedCommits[0].shortDescription).toBe(
      'adds cache invalidation',
    )
  })

  test('normalizes `selected_commits` (snake_case) into `selectedCommits`', () => {
    const raw = {
      selected_commits: [
        {
          sha: 'def5678',
          reason: 'auth refactor',
          shortDescription: 'oauth flow',
        },
      ],
    }
    const parsed = CommitSelectionSchema.parse(raw)
    expect(parsed.selectedCommits).toHaveLength(1)
    expect(parsed.selectedCommits[0].sha).toBe('def5678')
  })

  test('normalizes `commits` into `selectedCommits`', () => {
    const raw = {
      commits: [
        {
          sha: 'ghi9012',
          reason: 'state machine',
          shortDescription: 'workflow engine',
        },
      ],
    }
    const parsed = CommitSelectionSchema.parse(raw)
    expect(parsed.selectedCommits).toHaveLength(1)
    expect(parsed.selectedCommits[0].sha).toBe('ghi9012')
  })

  test('normalizes a single-object `selected` into `selectedCommits`', () => {
    const raw = {
      selected: {
        sha: 'jkl3456',
        reason: 'realtime sync',
        shortDescription: 'conflict resolution',
      },
    }
    const parsed = CommitSelectionSchema.parse(raw)
    expect(parsed.selectedCommits).toHaveLength(1)
    expect(parsed.selectedCommits[0].sha).toBe('jkl3456')
  })

  test('normalizes an array `selected` into `selectedCommits`', () => {
    const raw = {
      selected: [
        { sha: 'mno7890', reason: 'r1', shortDescription: 'd1' },
        { sha: 'pqr1234', reason: 'r2', shortDescription: 'd2' },
      ],
    }
    const parsed = CommitSelectionSchema.parse(raw)
    expect(parsed.selectedCommits).toHaveLength(2)
    expect(parsed.selectedCommits[0].sha).toBe('mno7890')
    expect(parsed.selectedCommits[1].sha).toBe('pqr1234')
  })

  test('merges entries across multiple variant keys', () => {
    const raw = {
      selectedCommits: [{ sha: 'sha-1', reason: 'r1', shortDescription: 'd1' }],
      selected_commits: [{ sha: 'sha-2', reason: 'r2', shortDescription: 'd2' }],
      commits: [{ sha: 'sha-3', reason: 'r3', shortDescription: 'd3' }],
    }
    const parsed = CommitSelectionSchema.parse(raw)
    expect(parsed.selectedCommits).toHaveLength(3)
    expect(parsed.selectedCommits.map((c) => c.sha)).toEqual([
      'sha-1',
      'sha-2',
      'sha-3',
    ])
  })

  test('falls back across sha / commit / commit_hash fields', () => {
    const raw = {
      selected_commits: [
        { commit: 'fallback-commit-sha', reason: 'uses commit key' },
        { commit_hash: 'fallback-hash-sha', reason: 'uses commit_hash key' },
      ],
    }
    const parsed = CommitSelectionSchema.parse(raw)
    expect(parsed.selectedCommits).toHaveLength(2)
    expect(parsed.selectedCommits[0].sha).toBe('fallback-commit-sha')
    expect(parsed.selectedCommits[1].sha).toBe('fallback-hash-sha')
  })

  test('falls back across reason / why_hard / why_it_is_hard / reasoning', () => {
    const raw = {
      selected_commits: [
        { sha: 's1', why_hard: 'uses why_hard' },
        { sha: 's2', why_it_is_hard: 'uses why_it_is_hard' },
        { sha: 's3', reasoning: 'uses reasoning' },
      ],
    }
    const parsed = CommitSelectionSchema.parse(raw)
    expect(parsed.selectedCommits[0].reason).toBe('uses why_hard')
    expect(parsed.selectedCommits[1].reason).toBe('uses why_it_is_hard')
    expect(parsed.selectedCommits[2].reason).toBe('uses reasoning')
  })

  test('joins array-valued reason fields into a single string', () => {
    const raw = {
      selected_commits: [
        {
          sha: 's1',
          why_hard: ['first reason', 'second reason'],
        },
      ],
    }
    const parsed = CommitSelectionSchema.parse(raw)
    expect(parsed.selectedCommits[0].reason).toBe('first reason second reason')
  })

  test('falls back across shortDescription / description', () => {
    const raw = {
      selected_commits: [
        { sha: 's1', description: 'uses description field' },
      ],
    }
    const parsed = CommitSelectionSchema.parse(raw)
    expect(parsed.selectedCommits[0].shortDescription).toBe(
      'uses description field',
    )
  })

  test('drops entries that have no resolvable sha', () => {
    const raw = {
      selectedCommits: [
        { sha: 'keep-me', reason: 'r', shortDescription: 'd' },
        { reason: 'no sha here', shortDescription: 'd' },
        { commit_hash: '', reason: 'empty hash', shortDescription: 'd' },
      ],
    }
    const parsed = CommitSelectionSchema.parse(raw)
    expect(parsed.selectedCommits).toHaveLength(1)
    expect(parsed.selectedCommits[0].sha).toBe('keep-me')
  })

  test('returns an empty selectedCommits array when the model rejects all commits', () => {
    const raw = { selectedCommits: [] }
    const parsed = CommitSelectionSchema.parse(raw)
    expect(parsed.selectedCommits).toEqual([])
  })

  test('returns an empty selectedCommits array when no variant keys are present', () => {
    const raw = { unrelated_field: 'something' }
    const parsed = CommitSelectionSchema.parse(raw)
    expect(parsed.selectedCommits).toEqual([])
  })

  test('ignores a boolean `selected` value (not an object/array)', () => {
    const raw = { selected: true, selectedCommits: [] }
    const parsed = CommitSelectionSchema.parse(raw)
    expect(parsed.selectedCommits).toEqual([])
  })

  test('does not throw on unexpected extra fields (passthrough)', () => {
    const raw = {
      selectedCommits: [
        { sha: 's1', reason: 'r', shortDescription: 'd', is_hard: true, extra: 'x' },
      ],
      extra_top_level: 'ignored',
    }
    expect(() => CommitSelectionSchema.parse(raw)).not.toThrow()
  })
})
