/**
 * Scheduled peak-hours scaler for the Render `web` service.
 *
 * WHY (2026-07 saturation): the web tier runs a FLAT 6 instances 24/7 while load
 * swings ~2x on a very predictable daily curve. At the 12-17Z peak, event-loop
 * utilization hits 0.73-0.76 avg (0.93 max) and chat-completion ingress queue
 * time (queueMs) p95 climbs from ~1.4s off-peak to ~6.8s — users wait seconds
 * before their request is even dequeued. The tier is ingress/connection-bound,
 * not CPU-bound, so the fix is to scale OUT during the peak window.
 *
 * WHY SCHEDULED (not Render native autoscaling): Render autoscaling keys only off
 * CPU/memory %. Our bottleneck (event-loop saturation → ingress queue) leads CPU
 * — a single-threaded Node process on a multi-vCPU instance can peg its event
 * loop while container CPU still looks moderate — so CPU-target autoscaling
 * reacts late. The load is clock-predictable, so a time-based instance floor is
 * both more precise and simpler. This drives the *fixed* instance count via
 * Render's manual scale endpoint on a per-hour curve.
 *
 *   NOTE: `POST /v1/services/{id}/scale` is IGNORED when native autoscaling is
 *   enabled on the service. This scheduler therefore requires autoscaling to be
 *   OFF (which is the current state — the service is at a fixed 6). The two
 *   strategies are mutually exclusive; see docs/web-scaling.md.
 *
 * Env:
 *   RENDER_API_KEY        (required) Render API key with permission on the service
 *   RENDER_WEB_SERVICE_ID (default srv-crm8estds78s73e7evd0 — the prod `web` svc,
 *                          derived from prod pod hostnames srv-<id>-<rs>-<pod>)
 *
 * Flags:
 *   --dry-run          print the target without calling Render
 *   --instances <n>    override the curve and set an explicit count
 *   --hour <0-23>      evaluate the curve for a specific UTC hour (testing)
 */

const SERVICE_ID =
  process.env.RENDER_WEB_SERVICE_ID || 'srv-crm8estds78s73e7evd0'
const API_KEY = process.env.RENDER_API_KEY

/**
 * Instance count by UTC hour, sized to hold per-instance event-loop utilization
 * near ~0.4. Re-derived by scripts/ops/derive-scale-curve.ts over 14 days.
 *
 * Method & caveats (2026-07): the utilization metric only went live ~07-03 23Z,
 * so there is ONE full util-day (Sat 07-04) — and it ran ~65% above normal load.
 * So this curve is NOT the raw 07-04 util (that over-fit the spike and peaked at
 * 14); it's a projection: calibrate util≈0.115+5.2e-5·load from 07-04, then apply
 * to the *normal* 14-day hourly load shape. A typical day peaks at 7-8.
 *
 * Weekday vs weekend: checked and negligible (≤1 instance at every hour; total
 * load within 2%), so a single curve is used — the per-hour max of the two.
 *
 * TRADE-OFF: this sizes for NORMAL load. Spike days (e.g. the 07-04 Saturday,
 * +65%) will still see elevated queue at this floor. If recurring spike-day pain
 * shows up, either raise the peak here or switch to Render native autoscaling
 * (min 6 / max 14, low CPU target) — see docs/web-scaling.md. Re-run the derive
 * script once ≥2 full weekdays of real utilization exist to drop the projection.
 */
const CURVE_BY_UTC_HOUR: number[] = [
  //00 01 02 03 04 05 06 07 08 09 10 11
  6, 6, 6, 6, 6, 7, 7, 7, 8, 7, 8, 7,
  //12 13 14 15 16 17 18 19 20 21 22 23
  7, 7, 7, 8, 8, 8, 7, 7, 7, 7, 7, 6,
]

function getFlag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 ? process.argv[i + 1] : undefined
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`)

function targetInstances(): { instances: number; reason: string } {
  const override = getFlag('instances')
  if (override !== undefined) {
    const n = Number(override)
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      throw new Error(`--instances must be an integer 1..100, got "${override}"`)
    }
    return { instances: n, reason: `explicit --instances ${n}` }
  }
  const hourArg = getFlag('hour')
  const hour = hourArg !== undefined ? Number(hourArg) : new Date().getUTCHours()
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`--hour must be 0..23, got "${hourArg}"`)
  }
  return {
    instances: CURVE_BY_UTC_HOUR[hour],
    reason: `curve for ${String(hour).padStart(2, '0')}:00Z`,
  }
}

async function main() {
  const { instances, reason } = targetInstances()
  console.log(
    `[scale-web] target=${instances} (${reason}) service=${SERVICE_ID}`,
  )

  if (hasFlag('dry-run')) {
    console.log('[scale-web] --dry-run: not calling Render')
    return
  }
  if (!API_KEY) {
    // Match the sweep-workflow convention: absent secret is a soft no-op so the
    // scheduled job doesn't hard-fail in forks / unconfigured environments.
    console.log('[scale-web] RENDER_API_KEY not set — skipping (no-op).')
    return
  }

  const res = await fetch(
    `https://api.render.com/v1/services/${SERVICE_ID}/scale`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ numInstances: instances }),
      signal: AbortSignal.timeout(30_000),
    },
  )

  const body = await res.text()
  // 200/202 = accepted; 409 = already at that count (Render returns this when
  // there is nothing to change) — both are success for an idempotent scheduler.
  if (res.status === 200 || res.status === 202 || res.status === 409) {
    console.log(`[scale-web] ok (HTTP ${res.status}) → ${instances} instances`)
    return
  }
  throw new Error(`[scale-web] Render scale failed HTTP ${res.status}: ${body}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
