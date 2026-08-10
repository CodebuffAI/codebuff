export type PercentileBudget = {
  p50: number
  p95: number
  p99: number
}

export type DatabaseRequestBudget = {
  service: 'web' | 'freebuff-web'
  route: string
  feature: string
  clientSqlWallMs: PercentileBudget
  roundTrips: PercentileBudget
}

export type DatabaseCostRow = {
  service: string
  route: string
  feature: string
  requests: number
  intervals: number
  roundTrips: number
  failedRoundTrips: number
  clientSqlWallSeconds: number
  p50ClientSqlWallMs: number
  p95ClientSqlWallMs: number
  p99ClientSqlWallMs: number
  p50RoundTrips: number
  p95RoundTrips: number
  p99RoundTrips: number
}

export type DatabaseCostVerdict = {
  row: DatabaseCostRow
  budget?: DatabaseRequestBudget
  evaluable: boolean
  /** True only for a REGRESSION against the baseline — the pageable signal. */
  breach: boolean
  /** Over the aspirational absolute budget. Reported, never paged: see the
   *  comment on `breach` in evaluateDatabaseRequestCosts. */
  overBudget: string[]
  /** Materially worse than the preceding baseline window. Pages. */
  regressed: string[]
  /** Everything, regression first. Kept for callers that just want a blob. */
  reasons: string[]
}

export type DatabaseCostEvaluationOptions = {
  minRequests: number
  minBaselineRequests: number
  regressionRatio: number
  minClientSqlWallRegressionMs: number
  minRoundTripRegression: number
}

/**
 * RATIO AND FLOORS ARE SET FROM MEASURED NOISE, not intuition — both were too
 * tight and the alert paged on ordinary traffic within a day of shipping.
 *
 * Noise across buckets with no known change (2026-08-10; wall time sampled from
 * the 9 hours after the private-endpoint rollout so the 15x improvement does not
 * pollute it):
 *
 *   family                    p50        p95        p99
 *   ClientSqlWallMs      1.2-2.3x   1.4-1.9x   1.4-1.5x
 *   RoundTrips           4.0-6.0x   1.5-2.4x   1.1-1.5x
 *
 * So `regressionRatio` is 2.0, above every tail-percentile swing observed, and
 * the absolute floors sit above the largest observed absolute move (wall p95
 * +122ms on free_mode; round trips +6). A regression has to clear BOTH, which is
 * what stops a large ratio on a tiny value — 9ms -> 20ms is 2.3x and means
 * nothing — from paging.
 *
 * p50 round trips is excluded entirely; see the note in evaluateFamily.
 */
export const DEFAULT_DATABASE_COST_EVALUATION_OPTIONS: DatabaseCostEvaluationOptions =
  {
    minRequests: 100,
    minBaselineRequests: 500,
    regressionRatio: 2.0,
    minClientSqlWallRegressionMs: 150,
    minRoundTripRegression: 8,
  }

// RECALIBRATED 2026-08-09 against one hour of post-private-endpoint traffic
// (~470k requests). Each number sits just above that hour's measured
// percentile, so these are a RATCHET — "no worse than the day we measured" —
// rather than the aspirational guardrails they started as. That change is only
// possible because moving off the public database endpoint took the
// per-round-trip cost from 114ms to 11.8ms; the old budgets were written for
// server execution time and every lane ran 4-25x over them continuously.
//
// Measured p50/p95/p99 at the time of writing, for anyone re-deriving these:
//   chat free_mode          22.2 / 253.7 / 582.7 ms   trips  3 / 11 / 12
//   chat freebuff_service   17.5 / 341.1 / 354.8 ms   trips  4 / 13 / 13
//   chat paid_mode           7.0 /  85.3 /  85.3 ms   trips  2 / 21 / 21
//   session_get              7.8 /  94.1 / 327.9 ms   trips  1 / 14 / 16
//   session_post             9.7 / 234.5 / 507.3 ms   trips  1 / 19 / 21
//   streak_get               6.0 /  41.0 /  41.0 ms   trips  2 /  2 /  2
//   cli_auth_status          2.2 /  10.9 /  15.2 ms   trips  1 /  1 /  1
//   cli_auth_code           56.3 /  94.1 /  94.1 ms   trips  2 /  2 /  2
//   account_providers       75.3 / 116.8 / 116.8 ms   trips  2 /  2 /  2
const chatClientSqlWall = { p50: 40, p95: 400, p99: 700 }
const chatTrips = { p50: 8, p95: 24, p99: 28 }
const sessionClientSqlWall = { p50: 20, p95: 275, p99: 600 }
const sessionTrips = { p50: 4, p95: 22, p99: 24 }
// Split out of `ancillary`, because one shared budget wide enough for
// account_providers (75ms p50 on 2 round trips) was blind to lanes that
// actually run at 2-6ms. A budget that every lane passes is not a budget.
const lightClientSqlWall = { p50: 12, p95: 60, p99: 90 }
const lightTrips = { p50: 2, p95: 3, p99: 4 }
const ancillaryClientSqlWall = { p50: 100, p95: 175, p99: 300 }
const ancillaryTrips = { p50: 6, p95: 8, p99: 12 }

/**
 * A no-regression ratchet against measured production, not an aspiration.
 *
 * Still REPORTED, never paged — see the `breach` comment in
 * evaluateDatabaseRequestCosts. Promoting these to pageable is a deliberate
 * follow-up, and the precondition is a full week with every lane inside them.
 *
 * The lane most worth driving down is `session_post`: 19 round trips at p95.
 * With transport at ~11ms that is ~210ms of pure round-tripping, and round
 * trips — not query time — are what handlers control.
 */
export const DATABASE_REQUEST_BUDGETS: DatabaseRequestBudget[] = [
  ...['chat_unknown', 'free_mode', 'freebuff_service', 'paid_mode'].map(
    (feature) => ({
      service: 'web' as const,
      route: '/api/v1/chat/completions',
      feature,
      clientSqlWallMs: chatClientSqlWall,
      roundTrips: chatTrips,
    }),
  ),
  ...['session_get', 'session_post', 'session_delete'].map((feature) => ({
    service: 'web' as const,
    route: '/api/v1/freebuff/session',
    feature,
    clientSqlWallMs: sessionClientSqlWall,
    roundTrips: sessionTrips,
  })),
  {
    service: 'web',
    route: '/api/v1/freebuff/streak',
    feature: 'streak_get',
    clientSqlWallMs: lightClientSqlWall,
    roundTrips: lightTrips,
  },
  {
    service: 'web',
    route: '/api/v1/freebuff/title',
    feature: 'title_post',
    clientSqlWallMs: lightClientSqlWall,
    roundTrips: lightTrips,
  },
  ...[
    ['/api/account/providers', 'account_providers'],
    ['/api/admin/glm-grants', 'admin_glm_grant'],
    ['/api/auth/cli/code', 'cli_auth_code'],
    ['/api/nodepod/handoff', 'nodepod_handoff'],
    ['/api/web/referrals', 'referrals_get'],
  ].map(([route, feature]) => ({
    service: 'freebuff-web' as const,
    route,
    feature,
    clientSqlWallMs: ancillaryClientSqlWall,
    roundTrips: ancillaryTrips,
  })),
  // One indexed read, on both services. The tightest lane we have, and the
  // clearest read on transport cost: 1 round trip, so its p50 IS the floor.
  ...(['web', 'freebuff-web'] as const).map((service) => ({
    service,
    route: '/api/auth/cli/status',
    feature: 'cli_auth_status',
    clientSqlWallMs: lightClientSqlWall,
    roundTrips: lightTrips,
  })),
]

function validateAplToken(value: string, label: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`Invalid ${label} "${value}"`)
  }
  return value
}

function validateWindow(value: string): string {
  if (!/^[1-9]\d*[mhd]$/.test(value)) {
    throw new Error(`Invalid database cost window "${value}"`)
  }
  return value
}

function windowMinutes(value: string): number {
  const safe = validateWindow(value)
  const amount = Number(safe.slice(0, -1))
  const unit = safe.at(-1)
  const minutes = amount * (unit === 'd' ? 1_440 : unit === 'h' ? 60 : 1)
  if (!Number.isSafeInteger(minutes)) {
    throw new Error(`Invalid database cost window "${value}"`)
  }
  return minutes
}

function combinedWindowMinutes(first: string, second: string): number {
  const minutes = windowMinutes(first) + windowMinutes(second)
  if (!Number.isSafeInteger(minutes)) {
    throw new Error(`Combined database cost window is too large`)
  }
  return minutes
}

/** One canonical APL definition for the scheduled alert and admin dashboard. */
export function buildDatabaseRequestCostApl({
  dataset,
  since,
  before,
}: {
  dataset: string
  since: string
  before?: string
}): string {
  const safeDataset = validateAplToken(dataset, 'Axiom dataset')
  const safeSince = validateWindow(since)
  const start = before
    ? `${combinedWindowMinutes(safeSince, before)}m`
    : safeSince
  const timeFilter = `_time >= ago(${start})${
    before ? ` and _time < ago(${validateWindow(before)})` : ''
  }`
  return `['${safeDataset}']
    | where ${timeFilter} and service in ("web", "freebuff-web")
    | extend d = parse_json(data)
    | where tostring(d.metric) == "database_request_cost"
    | extend requests=toint(d.requests), roundTrips=toint(d.roundTrips),
             failedRoundTrips=toint(d.failedRoundTrips),
             clientSqlWallSeconds=toreal(d.clientSqlWallSeconds),
             p50ClientSqlWall=toreal(d.p50ClientSqlWallMs),
             p95ClientSqlWall=toreal(d.p95ClientSqlWallMs),
             p99ClientSqlWall=toreal(d.p99ClientSqlWallMs),
             p50Trips=toreal(d.p50RoundTrips), p95Trips=toreal(d.p95RoundTrips),
             p99Trips=toreal(d.p99RoundTrips)
    | summarize requests=sum(requests), intervals=count(),
                roundTrips=sum(roundTrips), failedRoundTrips=sum(failedRoundTrips),
                clientSqlWallSeconds=round(sum(clientSqlWallSeconds),3),
                p50ClientSqlWallMs=round(percentile(p50ClientSqlWall,50),2),
                p95ClientSqlWallMs=round(percentile(p95ClientSqlWall,95),2),
                p99ClientSqlWallMs=round(percentile(p99ClientSqlWall,95),2),
                p50RoundTrips=round(percentile(p50Trips,50),2),
                p95RoundTrips=round(percentile(p95Trips,95),2),
                p99RoundTrips=round(percentile(p99Trips,95),2)
      by service=tostring(service), route=tostring(d.route), feature=tostring(d.feature)`
}

export function normalizeDatabaseCostRow(
  row: Record<string, unknown>,
): DatabaseCostRow {
  const number = (value: unknown) => Number(value) || 0
  const string = (value: unknown) => (typeof value === 'string' ? value : '')
  return {
    service: string(row.service),
    route: string(row.route),
    feature: string(row.feature),
    requests: number(row.requests),
    intervals: number(row.intervals),
    roundTrips: number(row.roundTrips),
    failedRoundTrips: number(row.failedRoundTrips),
    clientSqlWallSeconds: number(row.clientSqlWallSeconds),
    p50ClientSqlWallMs: number(row.p50ClientSqlWallMs),
    p95ClientSqlWallMs: number(row.p95ClientSqlWallMs),
    p99ClientSqlWallMs: number(row.p99ClientSqlWallMs),
    p50RoundTrips: number(row.p50RoundTrips),
    p95RoundTrips: number(row.p95RoundTrips),
    p99RoundTrips: number(row.p99RoundTrips),
  }
}

const PERCENTILES = ['p50', 'p95', 'p99'] as const

function budgetKey({
  service,
  route,
  feature,
}: Pick<DatabaseCostRow, 'service' | 'route' | 'feature'>): string {
  return `${service}\u0000${route}\u0000${feature}`
}

function metricValue(
  row: DatabaseCostRow,
  family: 'ClientSqlWallMs' | 'RoundTrips',
  percentile: (typeof PERCENTILES)[number],
): number {
  return Number(row[`${percentile}${family}` as keyof DatabaseCostRow]) || 0
}

/**
 * How much of a lane's budget a regression must move before it can page, used to
 * scale the absolute floor down for lanes whose whole budget is smaller than the
 * global floor. 0.375 reproduces the measured floors on the heavy lanes it was
 * derived from (chat p95 budget 400ms x 0.375 = 150ms) while giving the light
 * ones something proportionate (p95 budget 60ms -> 22.5ms).
 */
const REGRESSION_FLOOR_BUDGET_SHARE = 0.375

function evaluateFamily({
  current,
  baseline,
  budget,
  family,
  regressionRatio,
  minRegression,
}: {
  current: DatabaseCostRow
  baseline?: DatabaseCostRow
  budget: PercentileBudget
  family: 'ClientSqlWallMs' | 'RoundTrips'
  regressionRatio: number
  minRegression: number
}): { overBudget: string[]; regressed: string[] } {
  const label = family === 'ClientSqlWallMs' ? 'clientSqlWallMs' : 'roundTrips'
  const overBudget: string[] = []
  const regressed: string[] = []
  for (const percentile of PERCENTILES) {
    const value = metricValue(current, family, percentile)
    const limit = budget[percentile]
    if (value > limit) {
      overBudget.push(`${label}.${percentile} ${value} > budget ${limit}`)
      // Deliberately NOT `continue`. Skipping the regression check for an
      // over-budget percentile is what silently disabled regression detection:
      // by 2026-08-07 every lane was over every budget, so nothing was ever
      // compared against its baseline and a genuine 10x regression on top
      // would have gone unreported.
    }
    if (!baseline) continue
    // The absolute floor is scaled DOWN for light lanes. The global floors are
    // derived from the heaviest lanes' noise (+150ms came from free_mode's p95),
    // and applied flat they leave a lane like cli_auth_status — p95 10-15ms —
    // able to regress 10x without ever clearing them, i.e. with no pageable
    // signal at all. The lane's own budget is the per-lane scale we already
    // calibrate, so the floor is the lesser of the global value and a share of
    // it: heavy lanes keep the measured floor, light lanes get a proportionate
    // one.
    const floor = Math.min(minRegression, limit * REGRESSION_FLOOR_BUDGET_SHARE)
    // p50 NEVER pages, for either family, and no threshold fixes it. p50 is the
    // typical request, so it tracks request MIX — which share took the cheap
    // branch — while the tails track structural cost. Measured noise in periods
    // with no known change:
    //
    //   family              p50        p95        p99
    //   ClientSqlWallMs  1.2-2.3x   1.4-1.9x   1.4-1.5x
    //   RoundTrips       4.0-6.0x   1.5-2.4x   1.1-1.5x
    //
    // No ratio separates a 2.3x-noisy p50 from a real 2x regression, and
    // 4-6x on p50RoundTrips is hopeless. Both produced false pages on
    // 2026-08-10 ("roundTrips.p50 regressed 2 -> 5"; session_post's p50 wall
    // moving 9ms -> 20ms). Still reported via the budgets, just not pageable.
    if (percentile === 'p50') continue
    const previous = metricValue(baseline, family, percentile)
    if (
      previous > 0 &&
      value >= previous * regressionRatio &&
      value - previous >= floor
    ) {
      regressed.push(
        `${label}.${percentile} regressed ${previous} -> ${value} ` +
          `(>=${regressionRatio.toFixed(2)}x)`,
      )
    }
  }
  return { overBudget, regressed }
}

export function evaluateDatabaseRequestCosts(
  currentRows: DatabaseCostRow[],
  baselineRows: DatabaseCostRow[],
  budgets: DatabaseRequestBudget[],
  options: DatabaseCostEvaluationOptions,
): DatabaseCostVerdict[] {
  validateDatabaseCostEvaluationOptions(options)
  const budgetByKey = new Map(
    budgets.map((budget) => [budgetKey(budget), budget]),
  )
  const baselineByKey = new Map(
    baselineRows.map((row) => [budgetKey(row), row]),
  )

  return currentRows.map((row) => {
    const key = budgetKey(row)
    const budget = budgetByKey.get(key)
    const evaluable = row.requests >= options.minRequests && Boolean(budget)
    if (!budget) {
      return {
        row,
        budget,
        evaluable: false,
        breach: false,
        overBudget: [],
        regressed: [],
        reasons: ['No database cost budget is configured for this lane'],
      }
    }
    if (!evaluable) {
      return {
        row,
        budget,
        evaluable,
        breach: false,
        overBudget: [],
        regressed: [],
        reasons: [],
      }
    }

    const candidateBaseline = baselineByKey.get(key)
    const baseline =
      candidateBaseline &&
      candidateBaseline.requests >= options.minBaselineRequests
        ? candidateBaseline
        : undefined
    const families = [
      evaluateFamily({
        current: row,
        baseline,
        budget: budget.clientSqlWallMs,
        family: 'ClientSqlWallMs',
        regressionRatio: options.regressionRatio,
        minRegression: options.minClientSqlWallRegressionMs,
      }),
      evaluateFamily({
        current: row,
        baseline,
        budget: budget.roundTrips,
        family: 'RoundTrips',
        regressionRatio: options.regressionRatio,
        minRegression: options.minRoundTripRegression,
      }),
    ]
    const overBudget = families.flatMap((f) => f.overBudget)
    const regressed = families.flatMap((f) => f.regressed)
    return {
      row,
      budget,
      evaluable,
      // Only a regression pages.
      //
      // The absolute budgets used to be unpageable for a hard reason: they were
      // written against server execution time while this metric measures CLIENT
      // wall time, so every lane sat 4-25x over them and paging made this alert
      // red on every run for days — the same as no alert. That reason is gone.
      // The private-endpoint move (docs/db-capacity-and-scaling.md §10) cut the
      // per-round-trip cost from 114ms to 11.8ms, and the budgets above are now
      // a ratchet measured against real traffic.
      //
      // They still do not page, on purpose. A ratchet set from a single hour has
      // not been shown to survive a weekly traffic cycle, and 2026-08-10 showed
      // why that caution is warranted: the REGRESSION thresholds — which do page
      // — were themselves too tight and fired on ordinary diurnal noise within a
      // day. Promote only after a week in which nothing over-budget is reported,
      // and re-read the noise table above first.
      breach: regressed.length > 0,
      overBudget,
      regressed,
      reasons: [...regressed, ...overBudget],
    }
  })
}

export function validateDatabaseCostEvaluationOptions(
  options: DatabaseCostEvaluationOptions,
): void {
  const positiveIntegers: Array<[keyof DatabaseCostEvaluationOptions, number]> =
    [
      ['minRequests', options.minRequests],
      ['minBaselineRequests', options.minBaselineRequests],
    ]
  for (const [name, value] of positiveIntegers) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer`)
    }
  }
  if (
    !Number.isFinite(options.regressionRatio) ||
    options.regressionRatio <= 1
  ) {
    throw new Error('regressionRatio must be greater than 1')
  }
  for (const [name, value] of [
    ['minClientSqlWallRegressionMs', options.minClientSqlWallRegressionMs],
    ['minRoundTripRegression', options.minRoundTripRegression],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${name} must be a non-negative finite number`)
    }
  }
}
