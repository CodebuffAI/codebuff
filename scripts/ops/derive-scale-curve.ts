/**
 * Derive the scale-web.ts hourly instance curve(s) from Axiom data.
 *
 * DATA CONSTRAINT (2026-07): the event-loop `utilization` metric (the capacity
 * signal) only went live ~2026-07-03 23:00Z, so there is exactly ONE full day of
 * it — Saturday 2026-07-04 — and that day ran ~65% above the normal daily load.
 * A straight multi-day utilization curve is therefore impossible yet. Request
 * LOAD, however, has months of history (chat_completion_concurrency count), and
 * the 14-day picture shows weekday vs weekend TOTAL load within ~2% — the real
 * variation is the hourly SHAPE, not weekday/weekend volume.
 *
 * METHOD (honest projection):
 *  1. Calibrate utilization-vs-load from the one util-day (07-04): least-squares
 *     fit util ≈ a + b·load at the current flat BASELINE_INSTANCES.
 *  2. Pull the *normal* (07-04 spike excluded) 14-day hourly load shape, split
 *     weekday vs weekend.
 *  3. Project util per hour per day-type, size instances to hold projected
 *     per-instance util near TARGET_UTIL.
 *
 * Re-run once ≥2 full weekdays of real utilization exist to replace the
 * projection with measured weekday util.
 */
import { axiom } from '../logs/lib'

const DS = 'freebuff'
const WINDOW = process.argv[2] || '14d'
const CALIB_DAY = '2026-07-04' // the only full utilization day (also a load spike)
const SKIP_DAYS = new Set([CALIB_DAY, '2026-07-05']) // spike day + partial today
const BASELINE_INSTANCES = 6
const TARGET_UTIL = 0.4
const FLOOR = 6
const CAP = 16

async function q(apl: string): Promise<Record<string, any>[]> {
  const res: any = await axiom().query(apl)
  if (res.buckets?.totals?.length)
    return res.buckets.totals.map((g: any) => ({
      ...(g.group ?? {}),
      ...Object.fromEntries(
        (g.aggregations ?? []).map((a: any) => [a.alias ?? a.op, a.value]),
      ),
    }))
  return (res.matches ?? []).map((m: any) => ({ ...m.data, _time: m._time }))
}

const hourOf = (iso: string) => new Date(iso).getUTCHours()
const isWeekend = (iso: string) => [0, 6].includes(new Date(iso).getUTCDay())
const sizeFor = (util: number) =>
  Math.min(CAP, Math.max(FLOOR, Math.round((BASELINE_INSTANCES * util) / TARGET_UTIL)))

async function main() {
  // --- 1. calibration day: util AND load per hour ---
  const calUtil = await q(`['${DS}']
    | where _time >= datetime(${CALIB_DAY}) and _time < datetime(${CALIB_DAY}) + 1d
    | where service == "web" and message startswith "[EventLoop]"
    | extend h = toint(bin(_time,1h) - startofday(_time)) / 3600000000000, u = toreal(parse_json(data).utilization)
    | summarize util = avg(u) by h | sort by h asc`)
  const calLoad = await q(`['${DS}']
    | where _time >= datetime(${CALIB_DAY}) and _time < datetime(${CALIB_DAY}) + 1d
    | where service == "web" and tostring(parse_json(data).metric) == "chat_completion_concurrency"
    | extend h = toint(bin(_time,1h) - startofday(_time)) / 3600000000000
    | summarize load = count() by h | sort by h asc`)
  const loadByH = new Map<number, number>(calLoad.map((r) => [Number(r.h), Number(r.load)]))
  const pts = calUtil
    .map((r) => ({ x: loadByH.get(Number(r.h)) ?? 0, y: Number(r.util) }))
    .filter((p) => p.x > 0 && p.y > 0)
  // least squares util = a + b*load
  const n = pts.length
  const sx = pts.reduce((s, p) => s + p.x, 0)
  const sy = pts.reduce((s, p) => s + p.y, 0)
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0)
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0)
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx)
  const a = (sy - b * sx) / n
  console.log(`Calibration (${CALIB_DAY}, ${n} hrs): util ≈ ${a.toFixed(4)} + ${b.toExponential(3)}·load`)

  // --- 2. normal 14-day hourly load shape, weekday vs weekend ---
  const rows = await q(`['${DS}']
    | where _time >= ago(${WINDOW}) and service == "web"
    | where tostring(parse_json(data).metric) == "chat_completion_concurrency"
    | extend hr = tostring(bin(_time,1h)) | summarize n = count() by hr | sort by hr asc`)
  const wd: number[][] = Array.from({ length: 24 }, () => [])
  const we: number[][] = Array.from({ length: 24 }, () => [])
  for (const r of rows) {
    const iso = String(r.hr)
    if (SKIP_DAYS.has(iso.slice(0, 10))) continue
    ;(isWeekend(iso) ? we : wd)[hourOf(iso)].push(Number(r.n) || 0)
  }
  const mean = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0)

  // --- 3. project util per hour per day-type, size instances ---
  const build = (buckets: number[][], label: string) => {
    const curve: number[] = []
    const table: any[] = []
    for (let h = 0; h < 24; h++) {
      const load = mean(buckets[h])
      const projUtil = a + b * load
      const inst = sizeFor(projUtil)
      curve.push(inst)
      table.push({ hourUTC: h, avgLoad: Math.round(load), projUtil: Math.round(projUtil * 1000) / 1000, instances: inst })
    }
    console.log(`\n--- ${label} (UTC) ---`)
    console.table(table)
    return curve
  }
  const wdCurve = build(wd, 'WEEKDAY (Mon–Fri)')
  const weCurve = build(we, 'WEEKEND (Sat–Sun)')
  const merged = wdCurve.map((v, i) => Math.max(v, weCurve[i])) // safe single curve

  const fmt = (c: number[]) =>
    c.map((v, i) => (i % 12 === 0 ? `\n  ${v}` : `${v}`)).join(', ')
  const delta = wdCurve.map((v, i) => Math.abs(v - weCurve[i]))
  console.log(`\nmax |weekday−weekend| across hours: ${Math.max(...delta)} instance(s)`)
  console.log(`WEEKDAY_CURVE = [${fmt(wdCurve)},\n]`)
  console.log(`WEEKEND_CURVE = [${fmt(weCurve)},\n]`)
  console.log(`MERGED (max) = [${fmt(merged)},\n]`)
  const peak = (c: number[]) => Math.max(...c)
  const avg = (c: number[]) => Math.round((c.reduce((s, v) => s + v, 0) / c.length) * 10) / 10
  console.log(
    `\nweekday peak ${peak(wdCurve)} avg ${avg(wdCurve)} · weekend peak ${peak(weCurve)} avg ${avg(weCurve)} · merged peak ${peak(merged)} avg ${avg(merged)}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
