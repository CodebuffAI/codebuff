/**
 * Shared SQL + threshold logic for the production database health alerts
 * (docs/db-capacity-and-scaling.md §7 rec #3 and #4).
 *
 * The queries are plain SQL strings (not drizzle fragments) so this module
 * stays dependency-free; the alert scripts wrap them with `sql.raw(...)`.
 * Threshold defaults are grounded in the capacity doc's measured numbers:
 *
 *   - Wraparound: the doc measured `xid_age` 199.6M = 9.98% of the 2^31 budget
 *     and called it "not urgent". DEFAULT_WRAPAROUND_PCT (50%) pages with
 *     roughly a year of runway at today's growth, and is the standard
 *     conservative wraparound bar.
 *   - backend_xmin: the 2026-08-03 incident's long-lived snapshots were
 *     1,137,687 transactions behind (normal is ~1); DEFAULT_BACKEND_XMIN_XID
 *     (1M) sits just under that severity while far above any ordinary backend.
 *   - Invalid index: the incident's `CREATE INDEX CONCURRENTLY` was stuck for
 *     72 minutes; DEFAULT_STUCK_BUILD_MINUTES (30) is far above any normal
 *     build while catching a stuck one.
 *   - Busy-backend equivalents: the incident query held 9.65 backends (59% of
 *     all DB execution); current total fleet load is ~4.0 (§5.5).
 *     DEFAULT_BUSY_BACKENDS (4) pages when ONE query owns as much as the
 *     entire fleet currently uses.
 */

export const WRAPAROUND_BUDGET = 2 ** 31
export const DEFAULT_WRAPAROUND_PCT = 0.5
export const DEFAULT_BACKEND_XMIN_XID = 1_000_000
export const DEFAULT_STUCK_BUILD_MINUTES = 30
export const DEFAULT_BUSY_BACKENDS = 4
export const DEFAULT_SAMPLE_SECONDS = 60

export interface WraparoundRow {
  xid_age: string | number
}
export interface BackendXminRow {
  oldest_xmin_age: string | number | null
}
export interface InvalidIndexRow {
  schema: string
  table_name: string
  index_name: string
  indisready: boolean
  /** Non-null while a CREATE INDEX / REINDEX is actively running. */
  build_phase: string | null
  /** Seconds the build has run; null when not visible (no pg_read_all_stats). */
  build_seconds: string | number | null
}
export interface StatementSnapshotRow {
  queryid: string | null
  calls: string | number
  total_exec_time: string | number
  query: string
}
export interface BusyBackendRank {
  /** delta total_exec_time (ms) / 1000 / wall seconds. */
  busy: number
  calls: number
  meanMs: number
  query: string
}

/** The database's transaction-id age, as a fraction of the wraparound budget. */
export function buildWraparoundSql(): string {
  return `
    SELECT age(datfrozenxid)::bigint AS xid_age
    FROM pg_database
    WHERE datname = current_database()
  `
}

/** The oldest client backend's held snapshot, in transactions. */
export function buildBackendXminSql(): string {
  return `
    SELECT max(age(backend_xmin))::bigint AS oldest_xmin_age
    FROM pg_stat_activity
    WHERE backend_type = 'client backend'
      AND backend_xmin IS NOT NULL
  `
}

/**
 * User indexes with `indisvalid = false`, joined to build progress so a
 * legitimate in-flight CREATE INDEX CONCURRENTLY is distinguishable from a
 * permanently broken index.
 */
export function buildInvalidIndexesSql(): string {
  return `
    SELECT
      n.nspname                                          AS schema,
      c.relname                                          AS table_name,
      i.relname                                          AS index_name,
      ix.indisready,
      p.phase                                            AS build_phase,
      extract(epoch FROM (now() - a.query_start))        AS build_seconds
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class c ON c.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_progress_create_index p ON p.index_relid = ix.indexrelid
    LEFT JOIN pg_stat_activity a ON a.pid = p.pid
    WHERE ix.indisvalid = false
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY n.nspname, c.relname, i.relname
  `
}

/** One pg_stat_statements snapshot for the current database, by queryid. */
export function buildStatementSnapshotSql(): string {
  return `
    SELECT
      s.queryid::text                           AS queryid,
      s.calls::bigint                           AS calls,
      s.total_exec_time::double precision       AS total_exec_time,
      left(regexp_replace(s.query, '\\s+', ' ', 'g'), 200) AS query
    FROM pg_stat_statements s
    JOIN pg_database d ON d.oid = s.dbid AND d.datname = current_database()
    WHERE s.queryid IS NOT NULL
  `
}

/**
 * Whether the connecting role can see fleet-wide stats. Without
 * `pg_read_all_stats`, pg_stat_statements shows only the role's OWN statements
 * and pg_stat_activity hides other sessions' `backend_xmin`/`query_start`, so
 * both the busy-backend rank (rec #4) and the long-lived-snapshot signal (rec
 * #3) are uncomputable — and would silently read "all clear".
 */
export function buildPgReadAllStatsProbeSql(): string {
  return `
    SELECT pg_has_role(current_user, 'pg_read_all_stats', 'USAGE') AS has_read_all_stats
  `
}

/**
 * The broken-run text for when the scripts role lacks `pg_read_all_stats`,
 * shared by both DB alerts so the one-time grant is stated identically.
 * `unmonitored` names what the missing grant makes invisible (the signal that
 * would otherwise silently read "all clear").
 */
export function buildPgReadAllStatsMissingText(unmonitored: string): string {
  return (
    `the scripts role lacks pg_read_all_stats, so ${unmonitored}. ` +
    `Grant it once on prod: GRANT pg_read_all_stats TO manicode_scripts;`
  )
}

/** Coerce a Postgres-returned number-or-string (or null/undefined) to number. */
export function toNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Breach when the database's xid age is at least `pct` of the 2^31 budget. */
export function evaluateWraparound(
  xidAge: number | null,
  pct = DEFAULT_WRAPAROUND_PCT,
): boolean {
  return xidAge !== null && xidAge >= WRAPAROUND_BUDGET * pct
}

/** Breach when the oldest held backend_xmin snapshot is >= `threshold` xids. */
export function evaluateBackendXmin(
  oldestXminAge: number | null,
  threshold = DEFAULT_BACKEND_XMIN_XID,
): boolean {
  return oldestXminAge !== null && oldestXminAge >= threshold
}

/**
 * Which invalid indexes are a breach. A permanently-invalid index (not
 * building) is never OK. A building index pages only once it has been stuck
 * for `stuckMinutes`; a building index whose age we cannot see (query_start
 * hidden without pg_read_all_stats) is treated as in-progress and reported,
 * not paged.
 */
export function evaluateInvalidIndexes(
  rows: InvalidIndexRow[],
  stuckMinutes = DEFAULT_STUCK_BUILD_MINUTES,
): { breach: boolean; offenders: string[] } {
  const offenders: string[] = []
  for (const row of rows) {
    const building = row.build_phase !== null
    const buildSeconds = toNumber(row.build_seconds)
    const stuck =
      building && buildSeconds !== null && buildSeconds >= stuckMinutes * 60
    if (!building || stuck) {
      const where = building
        ? `building ${Math.round((buildSeconds ?? 0) / 60)}m`
        : 'not building'
      offenders.push(
        `${row.schema}.${row.table_name}.${row.index_name} (${where}, indisready=${row.indisready})`,
      )
    }
  }
  return { breach: offenders.length > 0, offenders }
}

/**
 * Busy-backend equivalents per query: delta `total_exec_time` over the
 * wall-clock window, the metric that found the 2026-08-03 incident (§3).
 * Mirrors the ad-hoc recipe in scripts/logs/_adhoc-pgdelta.ts.
 */
export function computeBusyBackendRank(
  before: StatementSnapshotRow[],
  after: StatementSnapshotRow[],
  wallSeconds: number,
): BusyBackendRank[] {
  if (wallSeconds <= 0) return []
  const beforeById = new Map(before.map((r) => [r.queryid, r]))
  const out: BusyBackendRank[] = []
  for (const nb of after) {
    const na = beforeById.get(nb.queryid)
    const dc = Number(nb.calls) - Number(na?.calls ?? 0)
    const dt = Number(nb.total_exec_time) - Number(na?.total_exec_time ?? 0)
    if (dc <= 0 && dt <= 0) continue
    out.push({
      busy: dt / 1000 / wallSeconds,
      calls: dc,
      meanMs: dc > 0 ? dt / dc : 0,
      query: nb.query,
    })
  }
  return out.sort((a, b) => b.busy - a.busy)
}

/** Breach when the top query holds at least `threshold` busy-backend equivalents. */
export function evaluateBusyBackendRank(
  rank: BusyBackendRank[],
  threshold = DEFAULT_BUSY_BACKENDS,
): { breach: boolean; top: BusyBackendRank | null } {
  const top = rank[0] ?? null
  return { breach: top !== null && top.busy >= threshold, top }
}
