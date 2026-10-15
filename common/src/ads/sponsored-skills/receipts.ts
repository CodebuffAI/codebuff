import type { BenchReceipt } from '../agentic-bench-receipt'
import type { SponsoredSkill } from '../sponsored-skill'

/**
 * The public export's stand-in for the private bench receipts: they name
 * advertisers' skill versions, which are not published.
 */
export const SPONSORED_SKILL_BENCH_RECEIPTS: readonly BenchReceipt[] = []

export const BENCH_RECEIPT_GRANDFATHERED: readonly string[] = []

export function sponsoredSkillBenchReceipt(
  _skill: Pick<SponsoredSkill, 'id' | 'version'>,
  _receipts: readonly BenchReceipt[] = SPONSORED_SKILL_BENCH_RECEIPTS,
): BenchReceipt | null {
  return null
}

export function sponsoredSkillBenchStanding(
  _skill: Pick<SponsoredSkill, 'id' | 'version'>,
  _receipts: readonly BenchReceipt[] = SPONSORED_SKILL_BENCH_RECEIPTS,
): 'pass' | 'grandfathered' | 'missing' | 'failed' {
  return 'missing'
}
