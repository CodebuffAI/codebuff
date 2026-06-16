#!/usr/bin/env bun
/**
 * Ingest-volume monitor for the Axiom logs dataset.
 *
 * Axiom cost is driven by ingested volume, so the thing to watch is which
 * service/level is emitting the most events. Use this to spot a noisy source
 * worth sampling or raising AXIOM_LOGS_MIN_LEVEL for.
 *
 * Examples:
 *   bun scripts/logs/logs-volume.ts --since 24h
 *   bun scripts/logs/logs-volume.ts --since 7d --dataset freebuff
 */
import { aplDatetime, axiom, getFlag, parseSince, resolveDataset } from './lib'

async function main() {
  const dataset = resolveDataset()
  const from = parseSince(getFlag('since') ?? '24h')

  const apl = [
    `['${dataset}']`,
    `where _time >= ${aplDatetime(from)}`,
    `summarize events = count() by service, level`,
    `sort by events desc`,
  ].join('\n| ')

  const result = await axiom().query(apl)
  const totals = result.buckets?.totals ?? []

  const rows = totals.map((group) => ({
    service: group.group?.service ?? '(none)',
    level: group.group?.level ?? '(none)',
    events: group.aggregations?.[0]?.value ?? 0,
  }))

  if (rows.length === 0) {
    process.stderr.write('[logs] no events in window\n')
    return
  }
  console.table(rows)
}

main().catch((err) => {
  console.error(err?.message ?? err)
  process.exit(1)
})
