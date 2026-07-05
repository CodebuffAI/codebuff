# Web service scaling (Render)

The `web` service is **not** defined as IaC in this repo — there is no
`render.yaml` blueprint. Its instance count, plan, env vars, build/start commands
(`next start`), and health check (`/api/healthz`) are configured in the **Render
dashboard**, and can be changed via the [Render API](https://api-docs.render.com).

- **Prod service id:** `srv-crm8estds78s73e7evd0` (derived from prod pod
  hostnames `srv-<id>-<replicaset>-<pod>` seen in Axiom `event_loop_lag.host`).
- **Current state:** a **flat 6 instances, 24/7** (Axiom: `dcount(host)` per hour
  is exactly 6 every hour; the only variation is deploy pod-overlap).

## The problem

Load swings ~2x on a predictable daily curve, but capacity is fixed. From the
2026-07 observability work (`event_loop_lag`, `chat_completion_concurrency`):

| | off-peak (02–07Z) | peak (12–17Z) |
| --- | --- | --- |
| event-loop `utilization` (avg / max) | ~0.40 / 0.62 | **0.73–0.76 / 0.93** |
| chat-completion `queueMs` p95 | ~1.4s | **6–6.8s** |
| max concurrent chat requests | ~43 | ~86 |

`queueMs` is ingress→handler wait (before any handler timer starts), and it
tracks utilization almost exactly — so the peak wait is genuine instance
backpressure, and the lever is to **scale out during the peak window**.

## Two strategies (mutually exclusive)

### A. Scheduled instance floor — recommended, and drafted here

Because the load is clock-predictable and the bottleneck (event-loop saturation →
ingress queue) **leads** container CPU, a time-based floor is more precise than
CPU-target autoscaling. Implemented as:

- `scripts/ops/scale-web.ts` — POSTs `numInstances` for the current UTC hour from
  a curve sized to hold peak per-instance utilization near ~0.4 (the healthy
  off-peak level).
- `.github/workflows/web-peak-scale.yml` — runs it hourly (idempotent;
  self-correcting). `workflow_dispatch` accepts an explicit `instances` override.
- `scripts/ops/derive-scale-curve.ts` — regenerates the curve from Axiom (util
  calibration × multi-day load shape, weekday/weekend split); paste its output
  back into `scale-web.ts`.

Curve (UTC hour → instances), re-derived over 14 days by
`scripts/ops/derive-scale-curve.ts`:

```
00–04: 6   05–07: 7   08: 8   09: 7   10: 8   11–14: 7
15–17: 8   18–21: 7   22: 7   23: 6
```

**How it was derived (and its caveats).** The utilization metric only went live
~2026-07-03 23Z, so there is exactly one full util-day, **Sat 2026-07-04 — which
ran ~65% above normal load.** Sizing straight off it over-fits that spike (it
peaks at 14). Instead: calibrate `util ≈ 0.115 + 5.2e-5·load` from 07-04, then
project onto the *normal* (spike-excluded) 14-day hourly load shape. A typical
day peaks at **7–8** instances.

- **Weekday vs weekend: negligible.** Total load is within ~2% (weekday 153k /
  weekend 157k daily), and the per-hour instance counts differ by **≤1** — load
  is diurnal by UTC hour, not by day of week. So a single curve (the per-hour max
  of the two) is used rather than separate weekday/weekend curves.
- **Trade-off — this sizes for NORMAL load.** On a normal day the flat-6 fleet
  already only reaches ~0.50 peak util / ~2.5s queue; the 6.8s crisis was the
  07-04 spike. Spike days will still see elevated queue at this floor. For
  spike-day protection, either raise the peak here or prefer **strategy B**
  (reactive autoscaling handles unpredictable spikes better than a fixed curve).
- Re-run `derive-scale-curve.ts` once ≥2 full weekdays of real utilization exist
  to replace the load-projection with measured weekday util.

**Setup:** add repo secret `RENDER_API_KEY` (Render key with access to the
service); optionally set repo variable `RENDER_WEB_SERVICE_ID`. Native
autoscaling must be **OFF** — the manual scale endpoint
(`POST /v1/services/{id}/scale`) is ignored when autoscaling is enabled.

Validate after rollout: re-run `bun scripts/logs/web-health.ts 24h` and confirm
peak `queueMs` p95 drops toward the off-peak ~1.4s and peak `utilization` avg
falls to ~0.4.

### B. Render native autoscaling — simpler ops, less precise

Dashboard → the service → Scaling: enable autoscaling, **min 6 / max 14**.
Render only scales on **CPU and/or memory %**. Our bottleneck leads CPU (a
single-threaded Node process can peg its event loop while multi-vCPU container
CPU still looks moderate), so set a **low CPU target (~50%)** so it scales out
*before* the queue builds; add a memory target (~70%) as a guard. Requires a Pro
plan. This reacts to load (handles unexpected spikes) but lags the ~6s queue that
builds before CPU crosses target — hence A is preferred for the known daily peak.

> Don't run A and B together: with autoscaling enabled, the scheduled `scale`
> calls are silently ignored.

## Related

- `docs/logging.md` — the Axiom dataset and `scripts/logs/` query scripts.
- The `freebuff-session-start-slowness-2026-07` investigation for the full
  saturation analysis and the other remediation levers.
