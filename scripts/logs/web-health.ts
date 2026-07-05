/**
 * Ad-hoc web-backend health probe. Pulls the saturation signals added in the
 * 2026-07 observability work: event_loop_lag, chat_completion_concurrency
 * (queueMs), GC attribution, and error rates — bucketed hourly.
 */
import { axiom } from './lib'

const DATASET = process.env.AXIOM_DATASET || 'freebuff'
const SINCE = process.argv[2] || '24h'

async function q(apl: string) {
  const res: any = await axiom().query(apl)
  if (res.buckets?.totals?.length) {
    return res.buckets.totals.map((g: any) => ({
      ...(g.group ?? {}),
      ...Object.fromEntries(
        (g.aggregations ?? []).map((a: any) => [a.alias ?? a.op, a.value]),
      ),
    }))
  }
  return (res.matches ?? []).map((m: any) => ({ ...m.data, _time: m._time }))
}

function table(title: string, rows: any[]) {
  console.log(`\n=== ${title} ===`)
  if (!rows.length) return console.log('(no rows)')
  console.table(rows)
}

async function main() {
  const base = `['${DATASET}'] | where _time >= ago(${SINCE}) and service == "web"`

  // 1. Event loop lag / utilization / GC, hourly
  table(
    'event_loop_lag (hourly): loop stalls, utilization, GC',
    await q(`${base}
      | where message startswith "[EventLoop]"
      | extend d = parse_json(data)
      | extend hr=tostring(bin(_time,1h))
      | extend p99=toreal(d.p99Ms), mx=toreal(d.maxMs), util=toreal(d.utilization),
               gcMax=toreal(d.gcMaxMs), gcTot=toreal(d.gcTotalMs), gcOld=toreal(d.gcOldGenMs)
      | summarize samples=count(), avgUtil=round(avg(util),3), maxUtil=round(max(util),3),
                  avgP99ms=round(avg(p99),1), maxLagMs=round(max(mx),1),
                  avgGcTotMs=round(avg(gcTot),1), maxGcMs=round(max(gcMax),1), maxGcOldMs=round(max(gcOld),1)
        by hr
      | sort by hr asc`),
  )

  // 2. Number of distinct instances reporting (fleet size over time)
  table(
    'distinct web instances reporting event_loop_lag (hourly)',
    await q(`${base}
      | where message startswith "[EventLoop]"
      | extend d = parse_json(data)
      | summarize instances=dcount(tostring(d.host)) by bin(_time, 1h)
      | sort by _time asc`),
  )

  // 3. Chat completion queue time (backpressure), hourly
  table(
    'chat_completion queueMs (ingress backpressure), hourly',
    await q(`${base}
      | extend d = parse_json(data)
      | where tostring(d.metric) == "chat_completion_concurrency"
      | where isnotnull(d.queueMs)
      | extend hr=tostring(bin(_time,1h))
      | extend qm=toreal(d.queueMs), cb=toreal(d.contentBytes), active=toreal(d.activeChatCompletionRequests)
      | summarize logged=count(), avgQueueMs=round(avg(qm),0), p95QueueMs=round(percentile(qm,95),0),
                  maxQueueMs=round(max(qm),0), avgContentKB=round(avg(cb)/1024,1),
                  maxActive=max(active)
        by hr
      | sort by hr asc`),
  )

  // 4. Error/warn volume from web, hourly
  table(
    'web log volume by level (hourly)',
    await q(`${base}
      | extend hr=tostring(bin(_time,1h))
      | summarize n=count() by level, hr
      | sort by hr asc`),
  )

  // 5. Top error messages last window
  table(
    'top web error messages',
    await q(`${base}
      | where level in ("error","fatal")
      | summarize n=count() by message
      | sort by n desc
      | limit 25`),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
