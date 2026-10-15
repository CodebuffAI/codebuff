import type { BenchReceipt } from '../agentic-bench-receipt'
import type { SponsoredSkill } from '../sponsored-skill'

/**
 * The public export's stand-in for the private bench receipts: they name
 * advertisers' skill versions, which are not published.
 */
export const SPONSORED_SKILL_BENCH_RECEIPTS: readonly BenchReceipt[] = []

export function sponsoredSkillBenchReceipt(
  _skill: Pick<SponsoredSkill, 'id' | 'version'>,
  _receipts: readonly BenchReceipt[] = SPONSORED_SKILL_BENCH_RECEIPTS,
): BenchReceipt | null {
  return null
}
