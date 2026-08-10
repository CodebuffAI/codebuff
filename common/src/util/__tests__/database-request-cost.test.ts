import { describe, expect, test } from 'bun:test'

import {
  DATABASE_REQUEST_BUDGETS,
  DEFAULT_DATABASE_COST_EVALUATION_OPTIONS,
  buildDatabaseRequestCostApl,
  evaluateDatabaseRequestCosts,
  normalizeDatabaseCostRow,
} from '../database-request-cost'

import type {
  DatabaseCostRow,
  DatabaseRequestBudget,
} from '../database-request-cost'

const budget: DatabaseRequestBudget = {
  service: 'web',
  route: '/api/v1/freebuff/session',
  feature: 'session_get',
  clientSqlWallMs: { p50: 25, p95: 100, p99: 500 },
  roundTrips: { p50: 6, p95: 12, p99: 20 },
}

/**
 * Same lane, generous limits. Regression tests need values large enough to clear
 * the absolute floors (+150ms, +8 round trips) while staying INSIDE budget, so
 * that "regressed" and "over budget" remain independently assertable — with one
 * shared tight budget every regression fixture is also over budget and the two
 * signals cannot be told apart.
 */
const roomyBudget: DatabaseRequestBudget = {
  ...budget,
  clientSqlWallMs: { p50: 400, p95: 600, p99: 900 },
  roundTrips: { p50: 50, p95: 50, p99: 50 },
}

function row(overrides: Partial<DatabaseCostRow> = {}): DatabaseCostRow {
  return {
    service: 'web',
    route: '/api/v1/freebuff/session',
    feature: 'session_get',
    requests: 1_000,
    intervals: 60,
    roundTrips: 5_000,
    failedRoundTrips: 0,
    clientSqlWallSeconds: 10,
    p50ClientSqlWallMs: 10,
    p95ClientSqlWallMs: 50,
    p99ClientSqlWallMs: 200,
    p50RoundTrips: 3,
    p95RoundTrips: 8,
    p99RoundTrips: 15,
    ...overrides,
  }
}

describe('database request cost budgets', () => {
  test('covers CLI auth polling in both deployed services', () => {
    expect(
      DATABASE_REQUEST_BUDGETS.filter(
        (item) => item.feature === 'cli_auth_status',
      ).map((item) => item.service),
    ).toEqual(['web', 'freebuff-web'])
  })

  test('accepts a healthy distribution', () => {
    const [verdict] = evaluateDatabaseRequestCosts(
      [row()],
      [row({ requests: 10_000 })],
      [budget],
      DEFAULT_DATABASE_COST_EVALUATION_OPTIONS,
    )
    expect(verdict.evaluable).toBe(true)
    expect(verdict.breach).toBe(false)
  })

  test('reports p50, p95, and p99 budget overruns for both metric families', () => {
    // Each percentile of each family is still checked and named. What changed
    // 2026-08-07 is that being over an ABSOLUTE budget is reported rather than
    // paged — see the `breach` comment in evaluateDatabaseRequestCosts.
    const cases: Partial<DatabaseCostRow>[] = [
      { p50ClientSqlWallMs: 26 },
      { p95ClientSqlWallMs: 101 },
      { p99ClientSqlWallMs: 501 },
      { p50RoundTrips: 7 },
      { p95RoundTrips: 13 },
      { p99RoundTrips: 21 },
    ]
    for (const current of cases) {
      const [verdict] = evaluateDatabaseRequestCosts(
        [row(current)],
        [],
        [budget],
        DEFAULT_DATABASE_COST_EVALUATION_OPTIONS,
      )
      expect(verdict.overBudget).toHaveLength(1)
      expect(verdict.breach).toBe(false)
    }
  })

  test('alerts on a material relative regression below the fixed budget', () => {
    // Must clear BOTH 2.0x and +150ms. 40 -> 80 is 2x but only +40ms, which is
    // inside the measured noise band and deliberately does NOT page.
    const [verdict] = evaluateDatabaseRequestCosts(
      [row({ p95ClientSqlWallMs: 400 })],
      [row({ requests: 5_000, p95ClientSqlWallMs: 200 })],
      [roomyBudget],
      DEFAULT_DATABASE_COST_EVALUATION_OPTIONS,
    )
    expect(verdict.breach).toBe(true)
    expect(verdict.reasons[0]).toContain('regressed 200 -> 400')
  })

  // p50 tracks request mix, not cost, and is 1.2-2.3x noisy on wall time and
  // 4-6x on round trips. session_post's p50 wall really does move 9ms -> 20ms on
  // ordinary traffic, which is 2.2x.
  test.each(['p50ClientSqlWallMs', 'p50RoundTrips'] as const)(
    '%s never pages, however large the jump',
    (metric) => {
      const [verdict] = evaluateDatabaseRequestCosts(
        [row({ [metric]: 400 })],
        [row({ requests: 5_000, [metric]: 9 })],
        [budget],
        DEFAULT_DATABASE_COST_EVALUATION_OPTIONS,
      )
      expect(verdict.regressed).toEqual([])
      expect(verdict.breach).toBe(false)
    },
  )

  // The other half: a light lane must still HAVE a pageable signal. Its whole
  // p95 budget (100ms here) is below the global +150ms floor, so a flat floor
  // would leave it unable to page at any magnitude.
  test('a light lane can still page on its own scale', () => {
    const [verdict] = evaluateDatabaseRequestCosts(
      [row({ p95ClientSqlWallMs: 90 })],
      [row({ requests: 5_000, p95ClientSqlWallMs: 20 })],
      [budget],
      DEFAULT_DATABASE_COST_EVALUATION_OPTIONS,
    )
    expect(verdict.breach).toBe(true)
    expect(verdict.reasons[0]).toContain('clientSqlWallMs.p95 regressed 20 -> 90')
  })

  test('p95 round trips still pages on a structural jump', () => {
    const [verdict] = evaluateDatabaseRequestCosts(
      [row({ p95RoundTrips: 30 })],
      [row({ requests: 5_000, p95RoundTrips: 12 })],
      [roomyBudget],
      DEFAULT_DATABASE_COST_EVALUATION_OPTIONS,
    )
    expect(verdict.breach).toBe(true)
    expect(verdict.reasons[0]).toContain('roundTrips.p95 regressed 12 -> 30')
  })

  test('alerts exactly at the relative and absolute regression thresholds', () => {
    // Exactly 2.0x and exactly the absolute floors: +150ms and +8 round trips.
    const [verdict] = evaluateDatabaseRequestCosts(
      [row({ p95ClientSqlWallMs: 300, p95RoundTrips: 16 })],
      [
        row({
          requests: 5_000,
          p95ClientSqlWallMs: 150,
          p95RoundTrips: 8,
        }),
      ],
      [roomyBudget],
      DEFAULT_DATABASE_COST_EVALUATION_OPTIONS,
    )

    expect(verdict.breach).toBe(true)
    expect(verdict.reasons).toEqual([
      'clientSqlWallMs.p95 regressed 150 -> 300 (>=2.00x)',
      'roundTrips.p95 regressed 8 -> 16 (>=2.00x)',
    ])
  })

  test('ignores tiny ratio changes and under-sampled routes', () => {
    const verdicts = evaluateDatabaseRequestCosts(
      [
        row({ p95ClientSqlWallMs: 15 }),
        row({
          feature: 'too_quiet',
          requests: 20,
          p99ClientSqlWallMs: 5_000,
        }),
      ],
      [row({ requests: 5_000, p95ClientSqlWallMs: 5 })],
      [budget, { ...budget, feature: 'too_quiet' }],
      DEFAULT_DATABASE_COST_EVALUATION_OPTIONS,
    )
    expect(verdicts[0].breach).toBe(false)
    expect(verdicts[1].evaluable).toBe(false)
    expect(verdicts[1].breach).toBe(false)
  })

  test('does not evaluate unbudgeted cardinality', () => {
    const [verdict] = evaluateDatabaseRequestCosts(
      [row({ feature: 'unexpected' })],
      [],
      [budget],
      DEFAULT_DATABASE_COST_EVALUATION_OPTIONS,
    )
    expect(verdict.budget).toBeUndefined()
    expect(verdict.evaluable).toBe(false)
    expect(verdict.breach).toBe(false)
    expect(verdict.reasons).toEqual([
      'No database cost budget is configured for this lane',
    ])
  })

  test('rejects alert settings that would silently disable evaluation', () => {
    expect(() =>
      evaluateDatabaseRequestCosts([row()], [], [budget], {
        ...DEFAULT_DATABASE_COST_EVALUATION_OPTIONS,
        regressionRatio: Number.NaN,
      }),
    ).toThrow('regressionRatio')
    expect(() =>
      evaluateDatabaseRequestCosts([row()], [], [budget], {
        ...DEFAULT_DATABASE_COST_EVALUATION_OPTIONS,
        minRequests: 0,
      }),
    ).toThrow('minRequests')
  })

  test('allows values exactly at their budgets', () => {
    const [verdict] = evaluateDatabaseRequestCosts(
      [
        row({
          p50ClientSqlWallMs: 25,
          p95ClientSqlWallMs: 100,
          p99ClientSqlWallMs: 500,
          p50RoundTrips: 6,
          p95RoundTrips: 12,
          p99RoundTrips: 20,
        }),
      ],
      [],
      [budget],
      DEFAULT_DATABASE_COST_EVALUATION_OPTIONS,
    )
    expect(verdict.breach).toBe(false)
  })
})

describe('budgets versus regressions', () => {
  const options = DEFAULT_DATABASE_COST_EVALUATION_OPTIONS

  test('being over the absolute budget does not page', () => {
    // Originally because every lane sat 4-25x over these: they were written
    // for server execution while the metric measures client wall time, and
    // paging on it made the job red on every run for days. The budgets are now
    // a ratchet measured against real traffic, but they stay report-only until
    // that has survived a full weekly cycle.
    const [verdict] = evaluateDatabaseRequestCosts(
      [row({ p50ClientSqlWallMs: 192 })],
      [row({ p50ClientSqlWallMs: 190 })],
      [budget],
      options,
    )

    expect(verdict!.overBudget.length).toBeGreaterThan(0)
    expect(verdict!.regressed).toEqual([])
    expect(verdict!.breach).toBe(false)
  })

  test('a regression ON TOP of an over-budget lane still pages', () => {
    // The bug this replaces: the over-budget branch used to `continue`, so once
    // a lane was over budget its baseline comparison never ran and a genuine
    // regression was invisible.
    // p95 rather than p50, because p50 is not a pageable percentile — see the
    // noise table in evaluateFamily.
    const [verdict] = evaluateDatabaseRequestCosts(
      [row({ p95ClientSqlWallMs: 2_000 })],
      [row({ p95ClientSqlWallMs: 192 })],
      [budget],
      options,
    )

    expect(verdict!.overBudget.length).toBeGreaterThan(0)
    expect(verdict!.regressed.join(' ')).toContain('regressed 192 -> 2000')
    expect(verdict!.breach).toBe(true)
  })

  test('a regression within budget pages', () => {
    const [verdict] = evaluateDatabaseRequestCosts(
      [row({ p95ClientSqlWallMs: 400 })],
      [row({ p95ClientSqlWallMs: 200 })],
      [roomyBudget],
      options,
    )

    expect(verdict!.overBudget).toEqual([])
    expect(verdict!.breach).toBe(true)
  })

  test('steady state pages nothing', () => {
    const [verdict] = evaluateDatabaseRequestCosts(
      [row()],
      [row()],
      [budget],
      options,
    )

    expect(verdict!.breach).toBe(false)
    expect(verdict!.regressed).toEqual([])
  })
})

describe('database request cost APL', () => {
  test('builds the same current and baseline aggregation shape', () => {
    const current = buildDatabaseRequestCostApl({
      dataset: 'freebuff-dev',
      since: '1h',
    })
    const baseline = buildDatabaseRequestCostApl({
      dataset: 'freebuff-dev',
      since: '7d',
      before: '1h',
    })

    expect(current).toContain("['freebuff-dev']")
    expect(current).toContain('_time >= ago(1h) and service in')
    expect(baseline).toContain('_time >= ago(10140m) and _time < ago(1h)')
    expect(current).toContain('p99RoundTrips=round(percentile(p99Trips,95),2)')
  })

  test('rejects interpolated dataset names and unsupported windows', () => {
    expect(() =>
      buildDatabaseRequestCostApl({ dataset: "x'] | take 1", since: '1h' }),
    ).toThrow('Invalid Axiom dataset')
    expect(() =>
      buildDatabaseRequestCostApl({ dataset: 'freebuff', since: '1 hour' }),
    ).toThrow('Invalid database cost window')
    expect(() =>
      buildDatabaseRequestCostApl({ dataset: 'freebuff', since: '0m' }),
    ).toThrow('Invalid database cost window')
    expect(() =>
      buildDatabaseRequestCostApl({
        dataset: 'freebuff',
        since: '9007199254740991m',
        before: '1m',
      }),
    ).toThrow('too large')
  })

  test('normalizes missing and string-valued Axiom fields', () => {
    expect(
      normalizeDatabaseCostRow({
        service: 'web',
        route: '/route',
        feature: 'feature',
        requests: '12',
        p95RoundTrips: '4.5',
      }),
    ).toMatchObject({
      service: 'web',
      route: '/route',
      feature: 'feature',
      requests: 12,
      p95RoundTrips: 4.5,
      failedRoundTrips: 0,
    })
  })
})
