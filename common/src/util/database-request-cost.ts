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

export const DEFAULT_DATABASE_COST_EVALUATION_OPTIONS: DatabaseCostEvaluationOptions =
  {
    minRequests: 100,
    minBaselineRequests: 500,
    regressionRatio: 1.5,
    minClientSqlWallRegressionMs: 20,
    minRoundTripRegression: 2,
  }

const chatClientSqlWall = { p50: 50, p95: 250, p99: 1_000 }
const chatTrips = { p50: 10, p95: 25, p99: 40 }
const sessionClientSqlWall = { p50: 25, p95: 100, p99: 500 }
const sessionTrips = { p50: 6, p95: 12, p99: 20 }
const ancillaryClientSqlWall = { p50: 25, p95: 150, p99: 750 }
const ancillaryTrips = { p50: 5, p95: 12, p99: 24 }

/**
 * Launch guardrails, not claims about the current distribution. They are
 * deliberately above the measured 1–4ms statement norm and should be tightened
 * after the first representative seven-day baseline.
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
    clientSqlWallMs: ancillaryClientSqlWall,
    roundTrips: ancillaryTrips,
  },
  {
    service: 'web',
    route: '/api/v1/freebuff/title',
    feature: 'title_post',
    clientSqlWallMs: ancillaryClientSqlWall,
    roundTrips: ancillaryTrips,
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
  ...(['web', 'freebuff-web'] as const).map((service) => ({
    service,
    route: '/api/auth/cli/status',
    feature: 'cli_auth_status',
    clientSqlWallMs: ancillaryClientSqlWall,
    roundTrips: ancillaryTrips,
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
    const previous = metricValue(baseline, family, percentile)
    if (
      previous > 0 &&
      value >= previous * regressionRatio &&
      value - previous >= minRegression
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
      // Only a regression pages. The absolute budgets are aspirational targets
      // for §4.7's capacity work, and every lane has been over them since the
      // metric started measuring CLIENT wall time (which includes the ~110ms
      // pool acquire) rather than server execution. Paging on them made this
      // alert red on every run for days, which is the same as no alert.
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
