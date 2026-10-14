/**
 * Free-text sponsored procedures are retired (docs/freebuff-agentic-ads.md,
 * "Free text is retired"). Every procedure that serves is a rendered sponsored
 * skill (`skill: <id>@<version> sha256:<hash>` on its first line, see
 * `sponsoredSkillDirective`): the step driver checks each step and the run may
 * install only the skill's pinned packages. A free-text procedure ran
 * undriven and could install nothing, so it is never offered, never accepted,
 * and never saved as NEW text.
 *
 * An agentic campaign with no skill yet keeps its intent (targeting, goal,
 * success criteria) and no procedure: the campaign build makes its skill
 * (docs/agentic-ads-lab.md, "Campaign builds") and the switch sets the
 * procedure when the skill ships.
 */

import { sponsoredSkillDirective } from './sponsored-skill'

/** The refusal an authoring path answers for free text. Advertiser-facing. */
export const SPONSORED_PROCEDURE_NOT_SKILL_ERROR =
  'Agent instructions must be a Freebuff skill; free-text instructions are no longer accepted. Leave the instructions empty and submit the campaign for review: Freebuff builds a skill from your goal, website and intent criteria, and the campaign serves once that skill is approved.'

/** The refusal for text that names a skill no store renders to exactly it. */
export const SPONSORED_PROCEDURE_UNKNOWN_SKILL_ERROR =
  'These agent instructions name a skill Freebuff cannot find, or were edited after the skill rendered them. Paste the skill’s exact rendered text, or leave the instructions empty so Freebuff builds one.'

/**
 * Whether a procedure text names a skill on its first line. The cheap, sync
 * half of "is a skill": serving and authoring both also require the skill to
 * be resolvable and to render to exactly this text
 * (`findSponsoredSkillForProcedure` on the server).
 */
export function sponsoredProcedureNamesSkill(
  procedure: string | null | undefined,
): procedure is string {
  return sponsoredSkillDirective(procedure) !== null
}

/**
 * The authoring rule, given what is stored now: null (no procedure) is always
 * fine, and so is keeping the current text byte for byte (an advertiser
 * editing only intent criteria on a legacy campaign); NEW text must name a
 * skill. Returns the refusal, or null.
 */
export function sponsoredProcedureFreeTextError(
  next: string | null | undefined,
  current: string | null | undefined,
): string | null {
  if (next == null) return null
  if (sponsoredProcedureNamesSkill(next)) return null
  if (current != null && next === current) return null
  return SPONSORED_PROCEDURE_NOT_SKILL_ERROR
}
