/**
 * The rollout's one question of the bench receipts (Track B,
 * `common/src/ads/sponsored-skills/receipts.ts`, being built separately):
 * may this registered version reach live campaigns?
 *
 * - `pass`: a full-mode receipt whose skill sha256 is this version's, with
 *   no regression against the previous version;
 * - `grandfathered`: a version that predates receipts, on Track B's
 *   grandfather list until it is seeded;
 * - `missing` / `failed`: the rollout skips it.
 *
 * Reads Track B's index (`sponsoredSkillBenchStanding`): `pass` is a full or
 * sweep receipt whose skill sha256 is the version's lock line, with a passing
 * verdict. The public export overlays `receipts.ts` with one that answers
 * `missing`, so a public build rolls nothing.
 */

import { sponsoredSkillBenchStanding } from './sponsored-skills/receipts'

import type { SponsoredSkill } from './sponsored-skill'

export type SponsoredSkillRolloutReceipt =
  | 'pass'
  | 'grandfathered'
  | 'missing'
  | 'failed'

export function sponsoredSkillRolloutReceipt(
  skill: SponsoredSkill,
): SponsoredSkillRolloutReceipt {
  return sponsoredSkillBenchStanding(skill)
}

/** Whether the receipt lets the rollout move a campaign to this version. */
export function rolloutReceiptAllows(
  receipt: SponsoredSkillRolloutReceipt,
): boolean {
  return receipt === 'pass' || receipt === 'grandfathered'
}
