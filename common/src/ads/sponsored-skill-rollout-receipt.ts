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
 * STUB until Track B lands: every version answers `missing`, so the rollout
 * moves nothing on its own (only an operator pin, which bypasses this check,
 * does). Track B replaces the body with a lookup in its receipts index; the
 * signature is the contract.
 */

import type { SponsoredSkill } from './sponsored-skill'

export type SponsoredSkillRolloutReceipt =
  | 'pass'
  | 'grandfathered'
  | 'missing'
  | 'failed'

export function sponsoredSkillRolloutReceipt(
  _skill: SponsoredSkill,
): SponsoredSkillRolloutReceipt {
  return 'missing'
}

/** Whether the receipt lets the rollout move a campaign to this version. */
export function rolloutReceiptAllows(
  receipt: SponsoredSkillRolloutReceipt,
): boolean {
  return receipt === 'pass' || receipt === 'grandfathered'
}
