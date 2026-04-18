/**
 * One-off: scrape Fireworks metrics for each configured deployment and print
 * the same health summary the admission gate would see.
 *
 * Usage:
 *   bun run web/scripts/scrape-check.ts
 */

import { env } from '@codebuff/internal/env'

import { computeSnapshot, DEFAULT_HEALTH_THRESHOLDS } from '@/server/fireworks-monitor/compute-health'
import { scrapeFireworksMetrics } from '@/server/fireworks-monitor/monitor'
import { FIREWORKS_ACCOUNT_ID, FIREWORKS_DEPLOYMENT_MAP } from '@/llm-api/fireworks-config'

async function main() {
  const deployments = Object.values(FIREWORKS_DEPLOYMENT_MAP)
  const metrics = await scrapeFireworksMetrics({
    apiKey: env.FIREWORKS_API_KEY,
    accountId: FIREWORKS_ACCOUNT_ID,
  })
  const snapshot = computeSnapshot({
    metrics,
    deployments,
    thresholds: DEFAULT_HEALTH_THRESHOLDS,
  })

  console.log(`scrapedAt: ${new Date(snapshot.scrapedAt ?? 0).toISOString()}`)
  console.log(`overall:   ${snapshot.overall}\n`)

  for (const [deployment, health] of Object.entries(snapshot.deployments)) {
    console.log(`── ${deployment} (${health.baseModel ?? 'unknown'})`)
    console.log(`   status:   ${health.status}`)
    console.log(`   replicas: ${health.metrics.replicas}`)
    console.log(`   req/s:    ${health.metrics.requestRate.toFixed(2)}`)
    console.log(`   errors:   ${(health.metrics.errorFraction * 100).toFixed(2)}%`)
    console.log(`   kvBlocks: ${(health.metrics.kvBlocksFraction * 100).toFixed(1)}%`)
    console.log(`   kvSlots:  ${(health.metrics.kvSlotsFraction * 100).toFixed(1)}%`)
    console.log(`   concurrent: ${health.metrics.concurrentRequests.toFixed(1)}`)
    const q = health.metrics.p50GenerationQueueMs
    const t = health.metrics.p50TimeToFirstTokenMs
    console.log(`   p50 queue: ${q === null ? 'n/a' : `${Math.round(q)}ms`}`)
    console.log(`   p50 TTFT:  ${t === null ? 'n/a' : `${Math.round(t)}ms`}`)
    if (health.reasons.length > 0) {
      console.log(`   reasons:`)
      for (const r of health.reasons) console.log(`     - ${r}`)
    }
    console.log()
  }
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
