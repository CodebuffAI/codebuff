import SNAPSHOTS from './agentic-bench-v2-snapshots.json'

import type { BenchSnapshot, BenchSnapshots } from './agentic-bench-snapshot'

/**
 * The committed fit-file snapshots of every bench-v2 pool entry, written by
 * `bun scripts/agentic-ad-lab-bench-verify.ts --bench=v2 --snapshots`.
 */
export const BENCH_V2_SNAPSHOTS = SNAPSHOTS as BenchSnapshots

export function benchV2Snapshot(key: string): BenchSnapshot {
  const snapshot = BENCH_V2_SNAPSHOTS.entries[key.toLowerCase()]
  if (!snapshot) throw new Error(`No bench-v2 snapshot for ${key}.`)
  return snapshot
}
