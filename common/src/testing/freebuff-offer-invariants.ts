/**
 * One rule, checked the same way on every surface: **if a picker can OFFER a
 * freebuff model row, every gate that row then passes through must accept it.**
 *
 * Freebuff model ids fan out across several hand-kept lists — the per-tier
 * picker catalogs, the session-admission sets, the free-mode agent allowlist,
 * and each surface's own request validator. They are separate on purpose (a
 * model can be retired from a picker while live sessions keep running on it),
 * so nothing stops one from moving without the others. When they drift in the
 * offer→gate direction the user sees a row they cannot use: Freebuff Desktop
 * shipped the earned GLM 5.2 row while its `/api/thread/:id/agent` route still
 * validated against `FREEBUFF_MODELS` (which excludes GLM by design), so every
 * user who earned the reward got 400 "invalid model" when they picked it.
 *
 * Drift the OTHER way is fine and deliberate — an id that is acceptable but not
 * offered is exactly how a staged retirement works — so this only ever checks
 * offered ⊆ accepted.
 *
 * Each surface owns its offer set (they live in the desktop/cli/web packages,
 * which `common` cannot import), so each calls `freebuffOfferViolations` from
 * its own test with its own rows. Keeping the CHECKS here is what makes a new
 * gate apply to every surface at once.
 */

import {
  FREE_MODE_AGENT_MODELS,
  FREEBUFF_ROOT_AGENT_IDS,
} from '../constants/free-agents'
import {
  getFreebuffModel,
  getFreebuffWebModel,
  isFreebuffSessionModelAllowedForAccessTier,
  isFreebuffSessionModelId,
  resolveFreebuffSessionModelForAccessTier,
} from '../constants/freebuff-models'

import type { FreebuffAccessTier } from '../constants/freebuff-models'

/** Which catalog the surface reads a row's name/tagline/badges out of. A
 *  surface that renders through the wrong one shows a fallback model's label on
 *  the row (both getters degrade to DeepSeek Flash rather than throwing). */
export type FreebuffCatalogSource = 'supported' | 'web'

export interface FreebuffOfferSurface {
  /** Names the surface in failure messages, e.g. 'freebuff-desktop picker (full)'. */
  surface: string
  /** The tier whose rows `offered` describes — gates are tier-sensitive. */
  accessTier: FreebuffAccessTier
  /** Every model id this surface can put in front of a user on that tier,
   *  INCLUDING earned/unlocked rows like the GLM referral reward. */
  offered: readonly string[]
  /** The surface's own request validator, if it has one (the desktop route's
   *  `isModelForHarness`, the web picker's selectable filter, …). */
  accepts?: (model: string) => boolean
  /** The free-mode root agent(s) this surface's turns run under. One id, or
   *  several when the surface has per-execution-mode roots. */
  rootAgentIdFor?: (model: string) => string | readonly string[]
  /** Catalog the surface renders from. Omit to skip the label check. */
  catalog?: FreebuffCatalogSource
}

function rootAgentIds(
  surface: FreebuffOfferSurface,
  model: string,
): readonly string[] {
  if (!surface.rootAgentIdFor) return []
  const ids = surface.rootAgentIdFor(model)
  return typeof ids === 'string' ? [ids] : ids
}

/**
 * Every way `model` is offerable-but-unusable on this surface, as sentences a
 * failing test can print verbatim. Empty array means the row is good.
 */
function violationsForModel(
  surface: FreebuffOfferSurface,
  model: string,
): string[] {
  const where = `${surface.surface}: ${model}`
  const out: string[] = []

  // 1. the session layer has to know the id at all, on any tier
  if (!isFreebuffSessionModelId(model)) {
    // everything below is derived from the same catalogs, so one unknown id
    // would otherwise produce five near-identical lines
    return [`${where} is offered but is not a freebuff session model id`]
  }

  // 2. …and admit it for THIS tier, or admission answers model_not_allowed
  if (!isFreebuffSessionModelAllowedForAccessTier(model, surface.accessTier)) {
    out.push(
      `${where} is offered to the ${surface.accessTier} tier, which session admission does not allow it on`,
    )
  }

  // 3. a resolver that silently swaps the pick is as bad as a refusal: the user
  //    picks GLM, the turn runs on DeepSeek, and nothing says why
  const resolved = resolveFreebuffSessionModelForAccessTier(
    model,
    surface.accessTier,
  )
  if (resolved !== model) {
    out.push(
      `${where} is offered but resolveFreebuffSessionModelForAccessTier coerces it to ${resolved}`,
    )
  }

  // 4. the surface's own validator — the check the GLM 400 needed
  if (surface.accepts && !surface.accepts(model)) {
    out.push(`${where} is offered but the surface's own validator rejects it`)
  }

  // 5. free mode charges/403s per (agent, model) pair, so the root this
  //    surface runs turns under must allow the model, and must itself be a
  //    registered root or its subagents 403 with free_mode_invalid_agent_hierarchy
  const roots = rootAgentIds(surface, model)
  if (surface.rootAgentIdFor && roots.length === 0) {
    // a resolver that answers "no root" for an offered model is a wiring error, and
    // silently running no root checks is exactly how this whole class of bug hides
    out.push(`${where} is offered but resolves to no free-mode root agent`)
  }
  for (const rootId of roots) {
    const allowed = FREE_MODE_AGENT_MODELS[rootId]
    if (!allowed) {
      out.push(
        `${where} runs under free-mode root ${rootId}, which is not in FREE_MODE_AGENT_MODELS`,
      )
      continue
    }
    if (!allowed.has(model)) {
      out.push(
        `${where} runs under free-mode root ${rootId}, whose allowlist does not include it (free_mode_invalid_agent_model)`,
      )
    }
    if (!FREEBUFF_ROOT_AGENT_IDS.some((id) => id === rootId)) {
      out.push(
        `${where} runs under free-mode root ${rootId}, which is missing from FREEBUFF_ROOT_AGENT_IDS (its subagents would 403)`,
      )
    }
  }

  // 6. the row has to render as itself rather than as the fallback's label
  if (surface.catalog) {
    const row =
      surface.catalog === 'web'
        ? getFreebuffWebModel(model)
        : getFreebuffModel(model)
    if (row.id !== model) {
      out.push(
        `${where} is offered but the ${surface.catalog} catalog has no row for it, so it renders as ${row.id}`,
      )
    }
  }

  return out
}

/** Every offer→gate violation on a surface. Assert `toEqual([])`: the strings
 *  are the failure message. */
export function freebuffOfferViolations(
  surface: FreebuffOfferSurface,
): string[] {
  // an empty offer set passes every check below while meaning the test wired
  // itself to the wrong list, which is the one failure mode a green run hides
  if (surface.offered.length === 0) {
    return [`${surface.surface}: offers no models at all — check the test wiring`]
  }
  return surface.offered.flatMap((model) => violationsForModel(surface, model))
}
