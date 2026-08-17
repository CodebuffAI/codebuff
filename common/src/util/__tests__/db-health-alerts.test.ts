import { describe, expect, it } from 'bun:test'

import {
  buildPgReadAllStatsMissingText,
  computeBusyBackendRank,
  DEFAULT_BACKEND_XMIN_XID,
  DEFAULT_BUSY_BACKENDS,
  DEFAULT_STUCK_BUILD_MINUTES,
  DEFAULT_WRAPAROUND_PCT,
  evaluateBackendXmin,
  evaluateBusyBackendRank,
  evaluateInvalidIndexes,
  evaluateWraparound,
  toNumber,
  WRAPAROUND_BUDGET,
  type BusyBackendRank,
  type InvalidIndexRow,
  type StatementSnapshotRow,
} from '../db-health-alerts'

describe('buildPgReadAllStatsMissingText', () => {
  it('names what is unmonitored and states the one-time grant', () => {
    const text = buildPgReadAllStatsMissingText(
      "pg_stat_activity hides other sessions' backend_xmin, so the " +
        'long-lived-snapshot signal is blind',
    )
    expect(text).toContain('lacks pg_read_all_stats')
    expect(text).toContain('long-lived-snapshot signal is blind')
    expect(text).toContain('GRANT pg_read_all_stats TO manicode_scripts;')
  })
})

describe('toNumber', () => {
  it('coerces numeric strings and numbers', () => {
    expect(toNumber('123')).toBe(123)
    expect(toNumber(123)).toBe(123)
    expect(toNumber('0')).toBe(0)
    expect(toNumber(0)).toBe(0)
  })

  it('returns null for null, undefined, empty and non-numeric input', () => {
    expect(toNumber(null)).toBeNull()
    expect(toNumber(undefined)).toBeNull()
    expect(toNumber('')).toBeNull()
    expect(toNumber('abc')).toBeNull()
    expect(toNumber(Number.NaN)).toBeNull()
    expect(toNumber(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('evaluateWraparound', () => {
  it('breaches at the configured fraction of the 2^31 budget', () => {
    // 50% of 2^31 is exactly 2^30.
    const threshold = Math.floor(WRAPAROUND_BUDGET * DEFAULT_WRAPAROUND_PCT)
    expect(evaluateWraparound(threshold)).toBe(true)
    expect(evaluateWraparound(threshold - 1)).toBe(false)
  })

  it('honors a custom fraction', () => {
    expect(evaluateWraparound(200_000_000, 0.1)).toBe(false) // 10% of 2^31 ≈ 214.7M
    expect(evaluateWraparound(215_000_000, 0.1)).toBe(true)
  })

  it('never breaches without a measured age', () => {
    expect(evaluateWraparound(null)).toBe(false)
  })
})

describe('evaluateBackendXmin', () => {
  it('breaches at the threshold, inclusive', () => {
    expect(evaluateBackendXmin(DEFAULT_BACKEND_XMIN_XID)).toBe(true)
    expect(evaluateBackendXmin(DEFAULT_BACKEND_XMIN_XID - 1)).toBe(false)
  })

  it('never breaches with no snapshot held', () => {
    expect(evaluateBackendXmin(null)).toBe(false)
  })
})

describe('evaluateInvalidIndexes', () => {
  const row = (over: Partial<InvalidIndexRow>): InvalidIndexRow => ({
    schema: 'public',
    table_name: 'messages',
    index_name: 'messages_created_at_idx',
    indisready: true,
    build_phase: null,
    build_seconds: null,
    ...over,
  })

  it('breaches on a permanently-invalid index', () => {
    const { breach, offenders } = evaluateInvalidIndexes([row({})])
    expect(breach).toBe(true)
    expect(offenders[0]).toContain('public.messages.messages_created_at_idx')
    expect(offenders[0]).toContain('not building')
  })

  it('does not breach on a fresh in-flight build', () => {
    const { breach } = evaluateInvalidIndexes([
      row({ build_phase: 'building index', build_seconds: 60 }),
    ])
    expect(breach).toBe(false)
  })

  it('breaches on a build stuck past the threshold', () => {
    const { breach, offenders } = evaluateInvalidIndexes([
      row({
        build_phase: 'building index',
        build_seconds: DEFAULT_STUCK_BUILD_MINUTES * 60 + 1,
      }),
    ])
    expect(breach).toBe(true)
    expect(offenders[0]).toContain('building 30m')
  })

  it('reports but does not page a build whose age is hidden (no pg_read_all_stats)', () => {
    const { breach } = evaluateInvalidIndexes([
      row({ build_phase: 'building index', build_seconds: null }),
    ])
    expect(breach).toBe(false)
  })

  it('is empty-safe', () => {
    expect(evaluateInvalidIndexes([])).toEqual({ breach: false, offenders: [] })
  })
})

describe('computeBusyBackendRank', () => {
  const snap = (
    rows: Array<Partial<StatementSnapshotRow>>,
  ): StatementSnapshotRow[] =>
    rows.map((r) => ({
      queryid: r.queryid!,
      calls: r.calls ?? 0,
      total_exec_time: r.total_exec_time ?? 0,
      query: r.query ?? '',
    }))

  it('computes busy-backend equivalents from the delta over the window', () => {
    const before = snap([
      { queryid: '1', calls: 100, total_exec_time: 10_000, query: 'SELECT 1' },
    ])
    const after = snap([
      { queryid: '1', calls: 200, total_exec_time: 60_000, query: 'SELECT 1' },
    ])
    const rank = computeBusyBackendRank(before, after, 60)
    expect(rank).toHaveLength(1)
    // 50,000ms delta / 1000 / 60s = 0.833 busy-backend equivalents.
    expect(rank[0].busy).toBeCloseTo(0.833, 3)
    expect(rank[0].calls).toBe(100)
    expect(rank[0].meanMs).toBeCloseTo(500, 3)
  })

  it('counts a query first seen in the after snapshot from zero', () => {
    const before = snap([])
    const after = snap([
      { queryid: '2', calls: 10, total_exec_time: 5_000, query: 'SELECT 2' },
    ])
    const rank = computeBusyBackendRank(before, after, 50)
    expect(rank).toHaveLength(1)
    expect(rank[0].busy).toBeCloseTo(5_000 / 1000 / 50, 3)
  })

  it('drops queries that vanished between snapshots', () => {
    const before = snap([
      { queryid: '3', calls: 5, total_exec_time: 5_000, query: 'x' },
    ])
    const after = snap([])
    expect(computeBusyBackendRank(before, after, 60)).toEqual([])
  })

  it('skips rows with no activity in the window', () => {
    const before = snap([
      { queryid: '4', calls: 50, total_exec_time: 5_000, query: 'x' },
    ])
    const after = snap([
      { queryid: '4', calls: 50, total_exec_time: 5_000, query: 'x' },
    ])
    expect(computeBusyBackendRank(before, after, 60)).toEqual([])
  })

  it('sorts by busy descending', () => {
    const before = snap([])
    const after = snap([
      { queryid: 'a', calls: 1, total_exec_time: 2_000, query: 'a' },
      { queryid: 'b', calls: 1, total_exec_time: 9_000, query: 'b' },
    ])
    const rank = computeBusyBackendRank(before, after, 10)
    expect(rank.map((r) => r.query)).toEqual(['b', 'a'])
  })

  it('returns an empty rank for a non-positive wall window (never Infinity)', () => {
    const before = snap([])
    const after = snap([
      { queryid: 'x', calls: 1, total_exec_time: 100, query: 'x' },
    ])
    expect(computeBusyBackendRank(before, after, 0)).toEqual([])
    expect(computeBusyBackendRank(before, after, -5)).toEqual([])
  })

  it('is empty-safe', () => {
    expect(computeBusyBackendRank([], [], 60)).toEqual([])
  })
})

describe('evaluateBusyBackendRank', () => {
  const top = (busy: number): BusyBackendRank => ({
    busy,
    calls: 1,
    meanMs: 10,
    query: 'SELECT 1',
  })

  it('breaches when the top query holds at least the threshold', () => {
    expect(evaluateBusyBackendRank([top(DEFAULT_BUSY_BACKENDS)]).breach).toBe(
      true,
    )
    expect(
      evaluateBusyBackendRank([top(DEFAULT_BUSY_BACKENDS - 0.01)]).breach,
    ).toBe(false)
  })

  it('returns the top offender', () => {
    const { top: offender } = evaluateBusyBackendRank([top(9.65)])
    expect(offender?.busy).toBe(9.65)
  })

  it('never breaches an empty rank', () => {
    expect(evaluateBusyBackendRank([])).toEqual({ breach: false, top: null })
  })
})
