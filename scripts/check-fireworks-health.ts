#!/usr/bin/env bun

/**
 * Scrape Fireworks metrics once and print the health snapshot the
 * web server's monitor would produce. Useful for ad-hoc verification.
 *
 * Usage:
 *   bun scripts/check-fireworks-health.ts
 *   bun scripts/check-fireworks-health.ts --raw      # also print raw metrics count
 *   bun scripts/check-fireworks-health.ts --json     # machine-readable output
 *
 * Reads FIREWORKS_API_KEY from env (.env.local is loaded automatically by bun).
 */

import { computeSnapshot, DEFAULT_HEALTH_THRESHOLDS } from '../web/src/server/fireworks-monitor/compute-health'
import { parsePrometheusText } from '../web/src/server/fireworks-monitor/parse-prometheus'
import {
  FIREWORKS_ACCOUNT_ID,
  FIREWORKS_DEPLOYMENT_MAP,
} from '../web/src/llm-api/fireworks-config'

import type { DeploymentHealthStatus } from '../web/src/server/fireworks-monitor/types'

const METRICS_URL = (accountId: string) =>
  `https://api.fireworks.ai/v1/accounts/${accountId}/metrics`

async function scrapeFireworksMetrics(params: { apiKey: string; accountId: string }) {
  const response = await fetch(METRICS_URL(params.accountId), {
    headers: { Authorization: `Bearer ${params.apiKey}` },
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Fireworks metrics scrape failed: ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 300)}` : ''}`,
    )
  }
  const text = await response.text()
  return parsePrometheusText(text)
}

const STATUS_COLORS: Record<DeploymentHealthStatus, string> = {
  healthy: '\x1b[32m',
  degraded: '\x1b[33m',
  unhealthy: '\x1b[31m',
  unknown: '\x1b[90m',
}
const RESET = '\x1b[0m'

function formatMs(value: number | null): string {
  if (value === null) return 'n/a'
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`
  return `${Math.round(value)}ms`
}

function formatPct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`
}

async function main() {
  const args = process.argv.slice(2)
  const jsonMode = args.includes('--json')
  const showRaw = args.includes('--raw')

  const apiKey = process.env.FIREWORKS_API_KEY
  if (!apiKey) {
    console.error('❌ FIREWORKS_API_KEY is not set. Add it to .env.local or export it.')
    process.exit(1)
  }

  const accountId = process.env.FIREWORKS_ACCOUNT_ID ?? FIREWORKS_ACCOUNT_ID
  const deployments = Object.values(FIREWORKS_DEPLOYMENT_MAP)

  const scrapeStart = Date.now()
  let metrics
  try {
    metrics = await scrapeFireworksMetrics({ apiKey, accountId })
  } catch (error) {
    console.error('❌ Scrape failed:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
  const scrapeElapsedMs = Date.now() - scrapeStart

  const snapshot = computeSnapshot({
    metrics,
    deployments,
    thresholds: DEFAULT_HEALTH_THRESHOLDS,
  })

  if (jsonMode) {
    console.log(JSON.stringify({ scrapeElapsedMs, sampleCount: metrics.samples.length, snapshot }, null, 2))
    return
  }

  console.log('🔥 Fireworks Deployment Health')
  console.log('='.repeat(78))
  console.log(`Account:       accounts/${accountId}`)
  console.log(`Scraped in:    ${scrapeElapsedMs}ms`)
  console.log(`Samples:       ${metrics.samples.length}`)
  console.log(`Overall:       ${STATUS_COLORS[snapshot.overall]}${snapshot.overall.toUpperCase()}${RESET}`)
  if (snapshot.lastError) console.log(`Last error:    ${snapshot.lastError}`)
  console.log()

  const modelByDeployment = Object.fromEntries(
    Object.entries(FIREWORKS_DEPLOYMENT_MAP).map(([model, dep]) => [dep, model]),
  )

  for (const [deployment, health] of Object.entries(snapshot.deployments)) {
    const model = modelByDeployment[deployment] ?? '(unknown model)'
    const color = STATUS_COLORS[health.status]
    console.log(`── ${color}${health.status.toUpperCase().padEnd(9)}${RESET} ${model}`)
    console.log(`   deployment:            ${deployment}`)
    console.log(`   base model:            ${health.baseModel ?? 'n/a'}`)
    console.log(`   request rate:          ${health.metrics.requestRate.toFixed(3)} req/s`)
    console.log(`   error rate:            ${health.metrics.errorRate.toFixed(3)} err/s (${formatPct(health.metrics.errorFraction)})`)
    console.log(`   concurrent requests:   ${health.metrics.concurrentRequests.toFixed(2)}`)
    console.log(`   KV blocks utilization: ${formatPct(health.metrics.kvBlocksFraction, 0)}`)
    console.log(`   KV slots utilization:  ${formatPct(health.metrics.kvSlotsFraction, 0)}`)
    console.log(`   p50 queue wait:        ${formatMs(health.metrics.p50GenerationQueueMs)}`)
    console.log(`   p50 TTFT:              ${formatMs(health.metrics.p50TimeToFirstTokenMs)}`)
    if (health.reasons.length > 0) {
      console.log(`   reasons:               ${health.reasons.join('; ')}`)
    }
    console.log()
  }

  if (showRaw) {
    console.log('── Metric name breakdown ─────────────────────────────')
    const counts = new Map<string, number>()
    for (const s of metrics.samples) {
      counts.set(s.name, (counts.get(s.name) ?? 0) + 1)
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
    for (const [name, count] of sorted) {
      console.log(`   ${String(count).padStart(4)}  ${name}`)
    }
  }

  process.exit(snapshot.overall === 'unhealthy' ? 2 : 0)
}

main()
