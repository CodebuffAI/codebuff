import fs from 'node:fs'

import {
  aggregateCodingHarnessMetrics,
  type CodingHarnessRunMetrics,
} from './coding-harness-metrics'

const input = process.argv[2]
if (!input) {
  console.error('Usage: bun evals/buffbench/run-coding-harness-ablation.ts <runs.json>')
  process.exit(2)
}
const runs = JSON.parse(fs.readFileSync(input, 'utf8')) as CodingHarnessRunMetrics[]
const byVariant = new Map<string, CodingHarnessRunMetrics[]>()
for (const run of runs) {
  const group = byVariant.get(run.variant) ?? []
  group.push(run)
  byVariant.set(run.variant, group)
}
const report = Object.fromEntries(
  [...byVariant.entries()].map(([variant, variantRuns]) => [
    variant,
    aggregateCodingHarnessMetrics(variantRuns),
  ]),
)
console.log(JSON.stringify(report, null, 2))
