/**
 * Shared helpers for the logs query scripts (Axiom / APL).
 *
 * Cost model: Axiom bills primarily by **ingested GB + retention**, not by
 * bytes scanned per query, so there is no per-query "bytes billed" cap to set
 * (unlike BigQuery). Queries are still cheaper and faster over a narrow time
 * window, so these helpers REQUIRE an explicit `--since`/`--from` range and a
 * `limit`. The main cost lever lives at ingest time (`AXIOM_LOGS_MIN_LEVEL`,
 * sampling) — see docs/logging.md.
 */
import { Axiom } from '@axiomhq/js'

const IS_PROD = process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'prod'

/** Default dataset, overridable with --dataset or AXIOM_DATASET. */
export function resolveDataset(): string {
  const name =
    getFlag('dataset') ||
    process.env.AXIOM_DATASET ||
    (IS_PROD ? 'freebuff' : 'freebuff-dev')
  // The dataset is interpolated raw into APL (`['name']`), so validate it
  // can't break out of the brackets / inject operators.
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error(`Invalid dataset name "${name}" (allowed: A-Z a-z 0-9 . _ -).`)
  }
  return name
}

let client: Axiom | null = null
export function axiom(): Axiom {
  if (!client) {
    const token = process.env.AXIOM_QUERY_TOKEN
    if (!token) {
      throw new Error(
        'AXIOM_QUERY_TOKEN is required to query logs (a query-scoped token; ' +
          'distinct from the ingest AXIOM_API_TOKEN used by the sink).',
      )
    }
    const orgId = process.env.AXIOM_ORG_ID
    client = new Axiom({ token, ...(orgId ? { orgId } : {}) })
  }
  return client
}

// ---- tiny argv helpers -----------------------------------------------------

export function getFlag(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (eq) return eq.slice(`--${name}=`.length)
  const idx = process.argv.indexOf(`--${name}`)
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1]
  }
  return undefined
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

/** Quote a value as an APL string literal (prevents APL injection). */
export function aplString(value: string): string {
  return JSON.stringify(value) // JSON string syntax is valid APL string syntax
}

/**
 * Reference a column that may not exist in the dataset yet.
 *
 * Axiom is schemaless: a field only becomes a column once a row carries it.
 * APL hard-errors ("field 'x' not found") when you project or filter a column
 * that is absent from *every* row in the window — which happens for the
 * correlation/identity fields (`event`, `user_id`, …) whenever a window has
 * none of them. `column_ifexists` degrades the missing column to an empty
 * string instead, so queries never error on a sparsely-populated field.
 */
export function safeCol(name: string): string {
  return `column_ifexists(${aplString(name)}, "")`
}

/** Format a Date as an APL datetime() literal. */
export function aplDatetime(d: Date): string {
  return `datetime(${aplString(d.toISOString())})`
}

// ---- time range ------------------------------------------------------------

const UNIT_MS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
}

/**
 * Parse a relative window like "1h", "24h", "7d", "30m" into a Date in the
 * past. Throws on malformed input so callers never silently scan everything.
 */
export function parseSince(spec: string): Date {
  const match = /^(\d+)([mhd])$/.exec(spec.trim())
  if (!match) {
    throw new Error(
      `Invalid --since "${spec}". Use <number><m|h|d>, e.g. 30m, 6h, 7d.`,
    )
  }
  const [, n, unit] = match
  return new Date(Date.now() - Number(n) * UNIT_MS[unit])
}

/** Resolve the required time window from --since / --from / --to. */
export function resolveTimeRange(): { from: Date; to: Date } {
  const since = getFlag('since')
  const from = getFlag('from')
  const to = getFlag('to')
  if (since) {
    return { from: parseSince(since), to: new Date() }
  }
  if (from) {
    return { from: new Date(from), to: to ? new Date(to) : new Date() }
  }
  throw new Error(
    'A time range is required. Pass --since 24h (or --from <ISO> [--to <ISO>]).',
  )
}

/**
 * Run an APL query and return the matched rows (flattened: `_time` + event
 * fields). With --dry-run it prints the APL and returns nothing.
 */
export async function runApl(apl: string): Promise<Record<string, unknown>[]> {
  if (hasFlag('dry-run')) {
    process.stderr.write(`[logs] --dry-run APL:\n${apl}\n`)
    return []
  }
  const result = await axiom().query(apl)
  // Spread projected fields first, then pin the system `_time` so it can't be
  // shadowed by a same-named projected field.
  return (result.matches ?? []).map((m) => ({ ...m.data, _time: m._time }))
}

/**
 * Run a `summarize … by …` APL and return one row per group (group keys merged
 * with the named aggregation values). Aggregation results come back in
 * `buckets.totals` rather than `matches`, so this is separate from `runApl`.
 * With --dry-run it prints the APL and returns nothing.
 */
export async function runAplSummarize(
  apl: string,
): Promise<Record<string, unknown>[]> {
  if (hasFlag('dry-run')) {
    process.stderr.write(`[logs] --dry-run APL:\n${apl}\n`)
    return []
  }
  const result = (await axiom().query(apl)) as {
    buckets?: {
      totals?: Array<{
        group?: Record<string, unknown>
        aggregations?: Array<{ alias?: string; op?: string; value?: unknown }>
      }>
    }
  }
  return (result.buckets?.totals ?? []).map((g) => ({
    ...(g.group ?? {}),
    ...Object.fromEntries(
      (g.aggregations ?? []).map((a) => [a.alias ?? a.op ?? 'value', a.value]),
    ),
  }))
}

/** Validate a column name passed by the user before splicing it into APL. */
export function assertSafeColumnName(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(
      `Invalid column "${name}" (allowed: a letter/underscore then letters/digits/underscores).`,
    )
  }
  return name
}

/** Columns projected by default — excludes the (potentially large) `data`. */
export const DEFAULT_FIELDS = [
  'level',
  'source',
  'service',
  'event',
  'user_id',
  'client_session_id',
  'client_request_id',
  'fingerprint_id',
  'message',
] as const
