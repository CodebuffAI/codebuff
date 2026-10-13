/**
 * Skills are delivered by the server, not compiled into a client.
 *
 * A client used to drive a sponsored skill (the step driver and its checks)
 * only when that exact version was in its own bundled registry
 * (`sponsoredProcedureSkill`), so a version merged after a Desktop release ran
 * as free text with no checks. freebuff.com deploys in minutes, so it hands the
 * skill to the client instead:
 *
 * - The Accept preview (`GET /api/v1/ads/proposal/{id}/accept`) and the funded
 *   Accept (`POST`) carry an optional `skill`: the raw skill JSON, present only
 *   when the response's `procedure` names a skill AND the server found that
 *   skill and its rendering is exactly the procedure
 *   (`sponsoredSkillMatchesProcedure`). The procedure, its hash and the consent
 *   are unchanged; the skill is extra data bound to them by the directive line.
 * - `GET /api/v1/ads/sponsored-skills/{id}/{version}[?sha256=sha256:<hex>]`
 *   answers `{ skill }` or 404, for a client resuming a run after a restart.
 *
 * A client must still hold what it receives to the procedure it consented to
 * ({@link deliveredSponsoredSkillForProcedure}) or to the reference its run
 * recorded ({@link deliveredSponsoredSkillForRef}); never run an unmatched one.
 * Doc: `docs/freebuff-sponsored-local-execution.md`, "Skills are delivered by
 * the server".
 */

import {
  parseSponsoredSkill,
  sponsoredSkillMatchesProcedure,
  sponsoredSkillSha256,
  type SponsoredSkill,
} from './sponsored-skill'

/** The server's skill read; the id and version follow as path segments. */
export const SPONSORED_SKILL_DELIVERY_PATH = '/api/v1/ads/sponsored-skills'

/** `GET /api/v1/ads/sponsored-skills/{id}/{version}` on 200. */
export type SponsoredSkillDeliveryResponse = { skill: SponsoredSkill }

/** The optional field on both Accept responses (preview and funded). */
export type SponsoredAcceptDeliveredSkill = {
  /** Present only when it renders to exactly the response's `procedure`. */
  skill?: SponsoredSkill
}

/** The path (and query) that re-fetches one skill version. */
export function sponsoredSkillDeliveryPath(ref: {
  id: string
  version: string
  sha256?: string
}): string {
  const path = `${SPONSORED_SKILL_DELIVERY_PATH}/${encodeURIComponent(ref.id)}/${encodeURIComponent(ref.version)}`
  return ref.sha256
    ? `${path}?sha256=${encodeURIComponent(ref.sha256)}`
    : path
}

/**
 * A delivered skill, kept only when it is valid and renders to exactly the
 * procedure the user consented to. Null otherwise: run the procedure as text.
 */
export function deliveredSponsoredSkillForProcedure(
  value: unknown,
  procedure: string | null | undefined,
): SponsoredSkill | null {
  if (value == null || !procedure) return null
  const parsed = parseSponsoredSkill(value)
  return parsed.ok && sponsoredSkillMatchesProcedure(parsed.skill, procedure)
    ? parsed.skill
    : null
}

/**
 * A re-fetched skill, kept only when it is valid and is the version and hash a
 * run recorded at Accept. Null otherwise.
 */
export function deliveredSponsoredSkillForRef(
  value: unknown,
  ref: { id: string; version: string; sha256: string },
): SponsoredSkill | null {
  if (value == null) return null
  const parsed = parseSponsoredSkill(value)
  return parsed.ok &&
    parsed.skill.id === ref.id &&
    parsed.skill.version === ref.version &&
    sponsoredSkillSha256(parsed.skill) === ref.sha256
    ? parsed.skill
    : null
}
