#!/usr/bin/env bun
/**
 * Query the Axiom logs dataset with APL, with a required time window + limit.
 *
 * Axiom bills on ingest (not bytes scanned), so there's no per-query cost cap —
 * but a narrow window is still faster. Use --dry-run to print the APL.
 *
 * Examples:
 *   # Errors from the web service in the last 6 hours
 *   bun scripts/logs/query-logs.ts --since 6h --level error --service web
 *
 *   # Everything for one request id today (include the data payload)
 *   bun scripts/logs/query-logs.ts --since 24h --request <run_id> --full
 *
 *   # Print the APL without running it
 *   bun scripts/logs/query-logs.ts --since 7d --grep timeout --dry-run
 *
 * Flags:
 *   --since 30m|6h|7d         time window (or --from <ISO> [--to <ISO>])  [required]
 *   --level <lvl>            debug|info|warn|error|fatal
 *   --source <src>           server|cli|browser
 *   --service <name>         web|agent-runtime|freebuff-web|cli
 *   --event <name>           AnalyticsEvent name (exact)
 *   --has-event             only rows where event is non-empty
 *   --user <id>             user_id
 *   --session <id>          client_session_id
 *   --request <id>          client_request_id
 *   --grep <text>           message contains <text>
 *   --full                  include the `data` field
 *   --limit <n>             max rows (default 100)
 *   --dataset <name>        override dataset
 *   --json                  print JSON instead of a table
 *   --dry-run               print the APL, do not execute
 */
import {
  DEFAULT_FIELDS,
  aplDatetime,
  aplString,
  getFlag,
  hasFlag,
  resolveDataset,
  resolveTimeRange,
  runApl,
  safeCol,
} from './lib'

function main() {
  const dataset = resolveDataset()
  const { from, to } = resolveTimeRange()
  const limit = Number(getFlag('limit') ?? 100)

  // Project each field via column_ifexists so a column that doesn't exist yet
  // in the dataset/window degrades to "" instead of erroring the whole query.
  // `data` is stored as a JSON string; parse it on the way out so --full shows
  // a structured object rather than an escaped blob.
  const fields = DEFAULT_FIELDS.map((f) => `${f} = ${safeCol(f)}`)
  if (hasFlag('full')) fields.push(`data = parse_json(${safeCol('data')})`)

  const filters: string[] = [
    `where _time >= ${aplDatetime(from)} and _time <= ${aplDatetime(to)}`,
  ]

  const eq: Array<[string, string]> = [
    ['level', 'level'],
    ['source', 'source'],
    ['service', 'service'],
    ['event', 'event'],
    ['user', 'user_id'],
    ['session', 'client_session_id'],
    ['request', 'client_request_id'],
  ]
  for (const [flag, field] of eq) {
    const val = getFlag(flag)
    if (val) filters.push(`where ${safeCol(field)} == ${aplString(val)}`)
  }
  if (hasFlag('has-event')) filters.push(`where ${safeCol('event')} != ""`)
  const grep = getFlag('grep')
  if (grep) filters.push(`where ${safeCol('message')} contains ${aplString(grep)}`)

  const apl = [
    `['${dataset}']`,
    ...filters,
    `sort by _time desc`,
    `limit ${Number.isFinite(limit) ? limit : 100}`,
    `project _time, ${fields.join(', ')}`,
  ].join('\n| ')

  return runApl(apl)
}

main()
  .then((rows) => {
    if (!rows || rows.length === 0) return
    if (hasFlag('json')) {
      process.stdout.write(JSON.stringify(rows, null, 2) + '\n')
    } else {
      console.table(rows)
    }
  })
  .catch((err) => {
    console.error(err?.message ?? err)
    process.exit(1)
  })
