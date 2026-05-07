#!/usr/bin/env bun

/**
 * Fetch and render Fireworks deployment health + runtime stats.
 *
 * Data sources:
 *   - GET /v1/accounts/{account}/deployments                  (list / per-deployment state)
 *   - GET /v1/accounts/{account}/metrics                       (Prometheus text, all deployments)
 *
 * Usage:
 *   bun scripts/fireworks-deployment-stats.ts                  # all deployments in the account
 *   bun scripts/fireworks-deployment-stats.ts <deployment_id>  # filter to one deployment
 *
 * Env:
 *   FIREWORKS_API_KEY    (required) — auto-loaded from .env.local via bun
 *   FIREWORKS_ACCOUNT_ID (optional) — defaults to the account in fireworks-config.ts
 */

import { FIREWORKS_ACCOUNT_ID } from '../web/src/llm-api/fireworks-config'

const API_BASE = 'https://api.fireworks.ai/v1'

type Deployment = {
  name: string
  baseModel: string
  state: string
  status: { code: string; message: string }
  replicaCount: number
  desiredReplicaCount: number
  minReplicaCount: number
  maxReplicaCount: number
  replicaStats: {
    readyReplicaCount: number
    initializingReplicaCount: number
    pendingSchedulingReplicaCount: number
    downloadingModelReplicaCount: number
  }
  createTime: string
  updateTime: string
  deploymentShape: string
  autoscalingPolicy: {
    loadTargets: Record<string, number>
    scaleUpWindow: string
    scaleDownWindow: string
    scaleToZeroWindow: string
  }
}

type PromSample = { name: string; labels: Record<string, string>; value: number }

const HISTOGRAM_METRICS = [
  { key: 'latency_to_first_token_ms', label: 'TTFT (ms)' },
  { key: 'latency_prefill_ms', label: 'prefill (ms)' },
  { key: 'latency_prefill_queue_ms', label: 'prefill-queue (ms)' },
  { key: 'latency_generation_queue_ms', label: 'gen-queue (ms)' },
  { key: 'latency_generation_per_token_ms', label: 'inter-token (ms)' },
  { key: 'latency_overall_ms', label: 'overall (ms)' },
  { key: 'tokens_prompt_per_request', label: 'prompt toks/req' },
  { key: 'tokens_generated_per_request', label: 'gen toks/req' },
] as const

async function fetchDeployments(apiKey: string, accountId: string): Promise<Deployment[]> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/deployments`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`Deployments list ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { deployments: Deployment[] }
  return data.deployments ?? []
}

async function fetchPrometheusMetrics(apiKey: string, accountId: string): Promise<PromSample[]> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/metrics`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`Metrics ${res.status}: ${await res.text()}`)
  const text = await res.text()
  return parsePrometheus(text)
}

function parsePrometheus(text: string): PromSample[] {
  const samples: PromSample[] = []
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const braceStart = line.indexOf('{')
    const braceEnd = line.indexOf('}')
    let name: string
    let labelStr = ''
    let rest: string
    if (braceStart === -1) {
      const parts = line.split(/\s+/)
      name = parts[0]
      rest = parts.slice(1).join(' ')
    } else {
      name = line.slice(0, braceStart)
      labelStr = line.slice(braceStart + 1, braceEnd)
      rest = line.slice(braceEnd + 1).trim()
    }
    const valueToken = rest.split(/\s+/)[0]
    const value = Number(valueToken)
    if (!Number.isFinite(value)) continue
    const labels: Record<string, string> = {}
    if (labelStr) {
      const re = /(\w+)="((?:[^"\\]|\\.)*)"/g
      let m: RegExpExecArray | null
      while ((m = re.exec(labelStr)) !== null) labels[m[1]] = m[2]
    }
    samples.push({ name, labels, value })
  }
  return samples
}

function scalarFor(samples: PromSample[], name: string, deploymentId: string): number | undefined {
  return samples.find((s) => s.name === name && s.labels.deployment_id === deploymentId)?.value
}

function bucketPercentiles(
  samples: PromSample[],
  metricKey: string,
  deploymentId: string,
  percentiles: number[] = [50, 90, 95, 99],
): { total: number; values: Record<number, number> } | null {
  const buckets = samples
    .filter(
      (s) => s.name === `${metricKey}_bucket:sum_by_deployment` && s.labels.deployment_id === deploymentId,
    )
    .map((s) => ({
      le: s.labels.le === '+Inf' ? Number.POSITIVE_INFINITY : Number(s.labels.le),
      cum: s.value,
    }))
    .sort((a, b) => a.le - b.le)

  if (buckets.length === 0) return null
  const total = buckets[buckets.length - 1].cum
  if (total === 0) return { total, values: Object.fromEntries(percentiles.map((p) => [p, 0])) }

  const values: Record<number, number> = {}
  for (const p of percentiles) {
    const target = total * (p / 100)
    let prevLe = 0
    let prevCum = 0
    let picked = Number.POSITIVE_INFINITY
    for (const { le, cum } of buckets) {
      if (cum >= target) {
        if (!Number.isFinite(le)) {
          picked = prevLe
        } else if (cum === prevCum) {
          picked = le
        } else {
          const frac = (target - prevCum) / (cum - prevCum)
          picked = prevLe + frac * (le - prevLe)
        }
        break
      }
      prevLe = le
      prevCum = cum
    }
    values[p] = picked
  }
  return { total, values }
}

function fmt(n: number | undefined, digits = 0): string {
  if (n === undefined || !Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1000) return n.toFixed(0)
  return n.toFixed(digits)
}

function fmtPct(n: number | undefined): string {
  return n === undefined ? '—' : `${(n * 100).toFixed(1)}%`
}

function parseDuration(d: string): string {
  const match = /^([\d.]+)s$/.exec(d)
  if (!match) return d
  const secs = Number(match[1])
  if (secs >= 60) return `${(secs / 60).toFixed(0)}m`
  return `${secs}s`
}

function renderDeployment(d: Deployment, samples: PromSample[]): void {
  const deploymentId = d.name.split('/').pop()!
  const shape = d.deploymentShape.split('/').slice(-3, -2)[0] ?? d.deploymentShape

  const stateIcon = d.state === 'READY' ? '✅' : d.state === 'UPDATING' ? '🔄' : '⚠️'

  console.log('━'.repeat(80))
  console.log(`${stateIcon}  ${d.name}`)
  console.log(`    model=${d.baseModel}  shape=${shape}`)
  console.log(
    `    state=${d.state} (${d.status.code})  replicas ready=${d.replicaStats.readyReplicaCount}/${d.replicaCount} ` +
      `min=${d.minReplicaCount} max=${d.maxReplicaCount}`,
  )
  const p = d.autoscalingPolicy
  console.log(
    `    autoscale target=${p.loadTargets.default}  up=${parseDuration(p.scaleUpWindow)}  ` +
      `down=${parseDuration(p.scaleDownWindow)}  to-zero=${parseDuration(p.scaleToZeroWindow)}`,
  )
  console.log(`    updated=${d.updateTime}`)

  const kvBlocks = scalarFor(samples, 'generator_kv_blocks_fraction:avg_by_deployment', deploymentId)
  const kvSlots = scalarFor(samples, 'generator_kv_slots_fraction:avg_by_deployment', deploymentId)
  const active = scalarFor(samples, 'generator_num_active_fraction:avg_by_deployment', deploymentId)
  const fwdTime = scalarFor(samples, 'generator_model_forward_time:avg_by_deployment', deploymentId)

  const reqRate = scalarFor(samples, 'request_counter_total:sum_by_deployment', deploymentId)
  const promptTokRate = scalarFor(samples, 'tokens_prompt_total:sum_by_deployment', deploymentId)
  const cachedPromptRate = scalarFor(samples, 'tokens_cached_prompt_total:sum_by_deployment', deploymentId)
  const genTokGauge = scalarFor(samples, 'tokens_generated_gauge:sum_by_deployment', deploymentId)
  const err400 = samples.find(
    (s) =>
      s.name === 'requests_error_total:sum_by_deployment' &&
      s.labels.deployment_id === deploymentId &&
      s.labels.code === '400',
  )?.value
  const err500 = samples.find(
    (s) =>
      s.name === 'requests_error_total:sum_by_deployment' &&
      s.labels.deployment_id === deploymentId &&
      s.labels.code === '500',
  )?.value

  const cacheHitRate =
    promptTokRate && promptTokRate > 0 && cachedPromptRate !== undefined
      ? cachedPromptRate / promptTokRate
      : undefined
  const errRate400 =
    reqRate && reqRate > 0 && err400 !== undefined ? err400 / reqRate : undefined

  console.log('\n  GPU / capacity')
  console.log(
    `    kv_blocks=${fmtPct(kvBlocks)}  kv_slots=${fmtPct(kvSlots)}  ` +
      `active_generators=${fmt(active, 2)}  fwd_time=${fmt((fwdTime ?? 0) * 1000, 1)}ms`,
  )

  console.log('\n  Throughput (per-sec rates)')
  console.log(
    `    requests=${fmt(reqRate, 2)}/s  prompt_tokens=${fmt(promptTokRate)}/s  ` +
      `cached_prompt=${fmt(cachedPromptRate)}/s  cache_hit=${fmtPct(cacheHitRate)}  ` +
      `generated_gauge=${fmt(genTokGauge, 1)}`,
  )

  console.log('\n  Errors (per-sec)')
  console.log(
    `    400=${fmt(err400 ?? 0, 3)}/s (${fmtPct(errRate400)})  500=${fmt(err500 ?? 0, 3)}/s`,
  )

  console.log('\n  Latency & size percentiles')
  console.log(
    `    ${'metric'.padEnd(22)}  ${'events'.padStart(9)}  ${'p50'.padStart(9)}  ${'p90'.padStart(9)}  ${'p95'.padStart(9)}  ${'p99'.padStart(9)}`,
  )
  for (const h of HISTOGRAM_METRICS) {
    const pct = bucketPercentiles(samples, h.key, deploymentId)
    if (!pct) {
      console.log(`    ${h.label.padEnd(22)}  ${'—'.padStart(9)}`)
      continue
    }
    console.log(
      `    ${h.label.padEnd(22)}  ${fmt(pct.total, 2).padStart(9)}  ` +
        `${fmt(pct.values[50]).padStart(9)}  ${fmt(pct.values[90]).padStart(9)}  ` +
        `${fmt(pct.values[95]).padStart(9)}  ${fmt(pct.values[99]).padStart(9)}`,
    )
  }
  console.log()
}

async function main() {
  const apiKey = process.env.FIREWORKS_API_KEY
  if (!apiKey || apiKey === 'dummy_fireworks_key') {
    console.error('FIREWORKS_API_KEY not set (check .env.local)')
    process.exit(1)
  }
  const accountId = process.env.FIREWORKS_ACCOUNT_ID ?? FIREWORKS_ACCOUNT_ID
  const filter = process.argv[2]

  const [deployments, samples] = await Promise.all([
    fetchDeployments(apiKey, accountId),
    fetchPrometheusMetrics(apiKey, accountId),
  ])

  const filtered = filter
    ? deployments.filter((d) => d.name.endsWith(`/${filter}`) || d.name === filter)
    : deployments

  if (filtered.length === 0) {
    console.error(`No deployments matched${filter ? ` "${filter}"` : ''} in account ${accountId}`)
    process.exit(1)
  }

  console.log(`Fireworks account: ${accountId}  •  ${filtered.length} deployment(s)`)
  console.log(`Rates below are per-second (Prometheus recording rules; ~30s update cadence).`)
  console.log()

  for (const d of filtered) renderDeployment(d, samples)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
