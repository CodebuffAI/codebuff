import { describe, expect, it } from 'bun:test'

import {
  REPO_SNAPSHOT_FIELDS,
  toRepoSnapshot,
  type RepoSnapshot,
} from '../file'

import type { ProjectFileContext } from '../file'

type GitChanges = ProjectFileContext['gitChanges']

/** A snapshot with every aggregate field set, plus the legacy fields an older
 *  client still populates. The legacy ones are the hazard this suite exists
 *  for: they carry raw patch content. */
const fullGitChanges = (): GitChanges => ({
  gitAvailable: true,
  branch: 'feature/secret-project-name',
  changedFiles: ['src/internal/pricing.ts', 'docs/acquisition-memo.md'],
  changedFileCount: 2,
  changedFileScanTruncated: false,
  repositoryVisibility: 'private',
  commitCount: 4471,
  historyIsShallow: false,
  historyScanTruncated: false,
  commitDatePercentiles: {
    p0: '2019-03-02',
    p25: '2021-07-14',
    p50: '2023-01-09',
    p75: '2024-11-30',
    p100: '2026-08-24',
  },
  mergedPullRequestCount: 812,
  humanContributorCount: 34,
  botContributorCount: 2,
  contributorCount: 36,
  fileCount: 8123,
  fileCountIsLowerBound: false,
  testFileCount: 611,
  status: 'On branch feature/secret-project-name\nChanges not staged',
  diff: 'diff --git a/src/internal/pricing.ts b/src/internal/pricing.ts\n+const MARGIN = 0.42',
  diffCached: 'diff --git a/docs/acquisition-memo.md b/docs/acquisition-memo.md\n+Target: $4M',
  lastCommitMessages: 'Raise the enterprise floor before the Q3 renewal',
})

describe('toRepoSnapshot', () => {
  it('never emits patch content, paths, or branch names', () => {
    const snapshot = toRepoSnapshot(fullGitChanges())
    const serialized = JSON.stringify(snapshot)

    // The four legacy fields hold raw repository source. A spread instead of
    // the allowlist would put all of them in the warehouse.
    for (const forbidden of [
      'status',
      'diff',
      'diffCached',
      'lastCommitMessages',
      // Names and paths are out of contract for an aggregate snapshot.
      'branch',
      'changedFiles',
    ]) {
      expect(snapshot).not.toHaveProperty(forbidden)
    }

    // Belt and braces: assert on the serialized bytes too, so a future field
    // that merely *embeds* one of these values also trips the test.
    expect(serialized).not.toContain('diff --git')
    expect(serialized).not.toContain('MARGIN')
    expect(serialized).not.toContain('acquisition-memo')
    expect(serialized).not.toContain('secret-project-name')
    expect(serialized).not.toContain('Raise the enterprise floor')
  })

  it('keeps every aggregate the scoring job reads', () => {
    const snapshot = toRepoSnapshot(fullGitChanges())

    expect(snapshot).toMatchObject({
      gitAvailable: true,
      repositoryVisibility: 'private',
      commitCount: 4471,
      mergedPullRequestCount: 812,
      humanContributorCount: 34,
      botContributorCount: 2,
      fileCount: 8123,
      testFileCount: 611,
    })
    expect(snapshot?.commitDatePercentiles?.p50).toBe('2023-01-09')
  })

  it('carries the lower-bound flags, which are unrecoverable if dropped', () => {
    const snapshot = toRepoSnapshot({
      ...fullGitChanges(),
      historyIsShallow: true,
      historyScanTruncated: true,
      fileCountIsLowerBound: true,
    })

    expect(snapshot?.historyIsShallow).toBe(true)
    expect(snapshot?.historyScanTruncated).toBe(true)
    expect(snapshot?.fileCountIsLowerBound).toBe(true)
  })

  it('omits absent fields rather than emitting undefined', () => {
    const snapshot = toRepoSnapshot({ gitAvailable: true, fileCount: 12 })

    expect(Object.keys(snapshot ?? {}).sort()).toEqual([
      'fileCount',
      'gitAvailable',
    ])
  })

  it('returns undefined when there is nothing to record', () => {
    expect(toRepoSnapshot(undefined)).toBeUndefined()
    // A legacy-only snapshot carries no allowlisted field, so it must produce
    // an absent column rather than a row of nulls that reads as measured zero.
    expect(
      toRepoSnapshot({ status: 'On branch main', diff: 'diff --git a/a b/a' }),
    ).toBeUndefined()
  })

  it('emits false and zero, which are values rather than absences', () => {
    const snapshot = toRepoSnapshot({
      gitAvailable: false,
      commitCount: 0,
      testFileCount: 0,
    })

    expect(snapshot?.gitAvailable).toBe(false)
    expect(snapshot?.commitCount).toBe(0)
    expect(snapshot?.testFileCount).toBe(0)
  })

  it('has no allowlisted field that can hold free text', () => {
    // Every field in the contract must be a count, a boolean, a bounded enum,
    // or the date-percentile object. A future string field is how a path or a
    // repo name gets back in, so the shape is asserted rather than reviewed.
    const snapshot = toRepoSnapshot(fullGitChanges()) as Record<string, unknown>

    for (const key of REPO_SNAPSHOT_FIELDS) {
      const value = snapshot[key]
      if (value === undefined) continue
      if (key === 'repositoryVisibility') {
        expect(['public', 'private', 'internal', 'unknown']).toContain(value)
        continue
      }
      if (key === 'commitDatePercentiles') {
        expect(typeof value).toBe('object')
        continue
      }
      expect(['number', 'boolean']).toContain(typeof value)
    }
  })

  it('is the single source of truth for the field list', () => {
    // The trace writer re-applies this allowlist server-side, because the
    // client-side projection runs in code we do not control at runtime. If the
    // two lists drift, a field added here is silently stripped on arrival —
    // which looks like a producer bug and is not one.
    //
    // Asserted as a literal so adding a field is a visible line in a diff, the
    // same way REPO_SNAPSHOT_FIELDS itself is.
    expect([...REPO_SNAPSHOT_FIELDS].sort()).toEqual([
      'botContributorCount',
      'changedFileCount',
      'changedFileScanTruncated',
      'commitCount',
      'commitDatePercentiles',
      'contributorCount',
      'fileCount',
      'fileCountIsLowerBound',
      'gitAvailable',
      'historyIsShallow',
      'historyScanTruncated',
      'humanContributorCount',
      'mergedPullRequestCount',
      'repositoryVisibility',
      'testFileCount',
    ])
  })

  it('exposes a type that matches the runtime allowlist', () => {
    // Compile-time guard: RepoSnapshot must stay derived from the field list,
    // so adding a key to one without the other fails to typecheck.
    const snapshot: RepoSnapshot | undefined = toRepoSnapshot(fullGitChanges())
    expect(snapshot).toBeDefined()
  })
})
