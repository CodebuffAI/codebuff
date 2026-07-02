#!/usr/bin/env bun
/**
 * Referral lifecycle funnel from the Axiom `freebuff` dataset.
 *
 * Reads the structured events emitted by packages/billing (server logger →
 * Axiom `event` column): freebuff.referral.{redeemed,completed,sweep}. Gives the
 * redeemed → completed funnel per program, plus the "why still pending"
 * breakdown — which rides on the latest `sweep` event's aggregated outcomes
 * (one event per run covers the whole pending population) rather than a
 * per-evaluation event, so it stays cheap to ingest.
 *
 * Requires AXIOM_QUERY_TOKEN (query-scoped). Examples:
 *   infisical run --env=prod --silent -- bun scripts/logs/referral-funnel.ts --since 7d
 *   infisical run --env=prod --silent -- bun scripts/logs/referral-funnel.ts --since 24h
 */
import {
  aplDatetime,
  axiom,
  getFlag,
  parseSince,
  resolveDataset,
  runApl,
} from './lib'

const REDEEMED = 'freebuff.referral.redeemed'
const REDEEM_FAILED = 'freebuff.referral.redeem_failed'
const COMPLETED = 'freebuff.referral.completed'
const SWEEP = 'freebuff.referral.sweep'

// program / outcome counts live inside the stringified `data` payload, so parse
// it once and project the fields we group by.
const PARSE_DATA = `extend d = parse_json(tostring(['data']))`

async function summarize(
  dataset: string,
  from: Date,
  pipeline: string[],
): Promise<Array<Record<string, unknown>>> {
  const apl = [
    `['${dataset}']`,
    `where _time >= ${aplDatetime(from)}`,
    ...pipeline,
  ].join('\n| ')
  const result = await axiom().query(apl)
  return (result.buckets?.totals ?? []).map((g) => ({
    ...g.group,
    n: g.aggregations?.[0]?.value ?? 0,
  }))
}

async function main() {
  const dataset = resolveDataset()
  const since = getFlag('since') ?? '7d'
  const from = parseSince(since)

  console.log(`=== referral lifecycle events by program (since ${since}) ===`)
  console.table(
    await summarize(dataset, from, [
      `where event in ('${REDEEMED}', '${COMPLETED}', '${SWEEP}')`,
      PARSE_DATA,
      `summarize n = count() by event = tostring(event), program = tostring(d['program'])`,
      `sort by event asc, n desc`,
    ]),
  )

  console.log('\n=== failed redemptions by error (guards hit) ===')
  console.table(
    await summarize(dataset, from, [
      `where event == '${REDEEM_FAILED}'`,
      PARSE_DATA,
      `summarize n = count() by error = tostring(d['error']), program = tostring(d['program'])`,
      `sort by n desc`,
    ]),
  )

  console.log('\n=== "why still pending": outcomes from the most recent sweep run ===')
  const latestSweep = await runApl(
    [
      `['${dataset}']`,
      `where _time >= ${aplDatetime(from)}`,
      `where event == '${SWEEP}'`,
      `sort by _time desc`,
      `take 1`,
      `project _time, data`,
    ].join('\n| '),
  )
  if (latestSweep.length === 0) {
    console.log('  (no sweep events in window — cron not running yet?)')
  } else {
    const row = latestSweep[0]
    // `data` is stored as a JSON string; the outcomes map is { program: { key: n } }.
    const data =
      typeof row.data === 'string' ? JSON.parse(row.data) : (row.data ?? {})
    const outcomes: Record<string, Record<string, number>> = data.outcomes ?? {}
    const flat = Object.entries(outcomes).flatMap(([program, byKey]) =>
      Object.entries(byKey).map(([outcome, n]) => ({ program, outcome, n })),
    )
    flat.sort((a, b) => b.n - a.n)
    console.log(`  (sweep at ${row._time})`)
    console.table(flat)
  }

  console.log('\n=== sweep runs: rows completed per run (distribution) ===')
  console.table(
    await summarize(dataset, from, [
      `where event == '${SWEEP}'`,
      PARSE_DATA,
      `summarize n = count() by completed = tostring(toint(d['completed']))`,
      `sort by completed desc`,
    ]),
  )
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
