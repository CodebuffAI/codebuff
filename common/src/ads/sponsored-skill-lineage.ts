/**
 * Which skill versions are the "same offer" for an open card
 * (docs/freebuff-agentic-ads.md, "Skill versions: the merge is the review").
 *
 * A card freezes the procedure hash it was offered with. When the rollout
 * moves its campaign to a later version of the same skill, the card stays
 * acceptable if the move is not a major bump and the contract (advertiser,
 * goal, outcomes: what is billed) is unchanged. The Accept then binds the
 * campaign's CURRENT text; a client that previewed the older text gets the
 * existing 409 `procedure_changed` and re-consents once.
 */

import { sponsoredSkillForProcedureSha256 } from './sponsored-skills/registry'
import { sha256Hex } from '../util/hash'

import type { SponsoredSkill } from './sponsored-skill'

const major = (version: string): number =>
  Number(version.split('-')[0]!.split('.')[0])

const sameList = (a: readonly string[], b: readonly string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

/** Advertiser, goal and outcomes: what an Accept of this skill bills for. */
export function sameSkillContract(
  a: SponsoredSkill,
  b: SponsoredSkill,
): boolean {
  return (
    a.advertiser === b.advertiser &&
    a.goal === b.goal &&
    sameList(a.outcomes, b.outcomes)
  )
}

/**
 * True when `a` and `b` are both registered versions of one skill id with the
 * same major version and the same contract. Equal versions are trivially
 * true. The major is the version as numbered and reviewed in its PR, not a
 * recomputation by `requiredSkillBump`: the bump rules have tightened since
 * some shipped versions were numbered, and consent does not depend on it (the
 * Accept binds the current text and a stale preview re-consents). The caller
 * passes REGISTERED skills only (a Lab version is never in a lineage).
 */
export function sameSkillNonMajor(
  a: SponsoredSkill | null | undefined,
  b: SponsoredSkill | null | undefined,
): boolean {
  if (!a || !b || a.id !== b.id) return false
  if (major(a.version) !== major(b.version)) return false
  if (!Number.isFinite(major(a.version))) return false
  return sameSkillContract(a, b)
}

/**
 * Whether an open card offered with `offeredProcedureSha256` (raw or
 * `sha256:`-tagged hex of the trimmed text) may be accepted against the
 * campaign's current `procedure`: the same bytes, or two registered versions
 * that are `sameSkillNonMajor`. `'same'` when the hashes are equal,
 * `'lineage'` when only the lineage holds, null otherwise.
 */
export function sponsoredOfferProcedureMatch(
  offeredProcedureSha256: string | null | undefined,
  procedure: string,
): 'same' | 'lineage' | null {
  if (!offeredProcedureSha256) return null
  const offered = offeredProcedureSha256.replace(/^sha256:/, '').toLowerCase()
  const current = sha256Hex(procedure.trim())
  if (offered === current) return 'same'
  return sameSkillNonMajor(
    sponsoredSkillForProcedureSha256(offered),
    sponsoredSkillForProcedureSha256(current),
  )
    ? 'lineage'
    : null
}
