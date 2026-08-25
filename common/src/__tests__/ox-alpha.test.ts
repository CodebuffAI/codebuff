/**
 * Ox Alpha is a Web/Cloud-only row served at a list price of zero by an
 * anonymous host, and every unusual thing about it is unusual on purpose. These
 * tests pin the three decisions that a later reader would otherwise correct
 * back to convention: it is metered by no pool, it warns without claiming a
 * training grant, and it names its own reasoning effort rather than taking the
 * provider's.
 */
import { describe, expect, it } from 'bun:test'

import {
  FREEBUFF_MODELS,
  FREEBUFF_SERVICE_ONLY_MODEL_IDS,
  FREEBUFF_WEB_GEO_EXEMPT_MODEL_IDS,
  FREEBUFF_WEB_LIMITED_MODEL_IDS,
  isFreebuffServiceOnlyModelId,
  isFreebuffSessionModelAllowedForAccessTier,
  isFreebuffWebModelAllowedForLimitedTier,
  LIMITED_FREEBUFF_MODEL_IDS,
  FREEBUFF_MODEL_CONTEXT_WINDOWS,
  FREEBUFF_OX_ALPHA_MAX_PRICE,
  FREEBUFF_OX_ALPHA_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_STANDARD_MODEL_IDS,
  FREEBUFF_TRACED_MODEL_IDS,
  FREEBUFF_WEB_ALL_MODELS,
  FREEBUFF_WEB_GOD_ONLY_MODEL_IDS,
  FREEBUFF_WEB_MODELS,
  FREEBUFF_WEB_PREMIUM_MODEL_IDS,
  getFreebuffModelReasoningEffort,
  isFreebuffOxAlphaModelId,
  isFreebuffWebModelId,
  SUPPORTED_FREEBUFF_MODELS,
} from '../constants/freebuff-models'
import {
  FREEBUFF_ROOT_AGENT_IDS,
  FREEBUFF_ROOT_AGENT_ID_BY_MODEL,
  FREEBUFF_WEB_BASE3_AGENT_ID_BY_MODEL,
  FREEBUFF_CLI_BASE3_AGENT_ID_BY_MODEL,
  FREE_MODE_AGENT_MODELS,
} from '../constants/free-agents'

const OX = FREEBUFF_OX_ALPHA_MODEL_ID
const row = FREEBUFF_WEB_MODELS.find((m) => m.id === OX)

describe('Ox Alpha is a Web/Cloud row', () => {
  it('is offered on the browser surfaces and to every user', () => {
    expect(row).toBeDefined()
    expect(isFreebuffWebModelId(OX)).toBe(true)
    // Not a god-only test row — this one is meant to carry real traffic.
    expect(FREEBUFF_WEB_GOD_ONLY_MODEL_IDS as readonly string[]).not.toContain(
      OX,
    )
  })

  /**
   * WIDENED 2026-08-24 to every surface. This test used to assert the opposite
   * ("stays off the CLI and Desktop"), and the reason it flipped is a decision
   * rather than drift: gate #2 in docs/freebuff-ox-alpha.md passed decisively
   * -- four days of real traffic at $0.0000, the zero-price fence never
   * engaged, and zero 429s across 32,185 records in 24h.
   *
   * What that trades away is honest: on CLI and Desktop the catalog ships
   * INSIDE a binary, so "withdraw in one deploy" no longer holds for the picker
   * row. The rollback lever is now FREEBUFF_PAUSED_FREE_MODEL_IDS, which stops
   * admissions on every surface including installed builds.
   */
  it('is on every surface, and carries its CLI root with it', () => {
    expect(FREEBUFF_MODELS.map((m) => m.id)).toContain(OX)
    expect(SUPPORTED_FREEBUFF_MODELS.map((m) => m.id)).toContain(OX)
    expect(FREEBUFF_CLI_BASE3_AGENT_ID_BY_MODEL[OX]).toBe('base3-free-ox-alpha')
    expect(FREEBUFF_WEB_ALL_MODELS.map((m) => m.id)).toContain(OX)
  })

  /**
   * The row is experimental and must SAY so, on every surface. That flag is the
   * only promise we can keep about a model an anonymous host can reprice,
   * rename or withdraw without notice -- and it mattered less when the row was
   * confined to one picker we control than it does now that it ships in CLI and
   * Desktop builds.
   */
  it('is flagged experimental so every picker can badge it', () => {
    const row = FREEBUFF_MODELS.find((m) => m.id === OX)
    expect(row?.experimental).toBe(true)
  })

  /** It must never become the row a new user lands on before they know the
   *  catalog exists. FREEBUFF_MODELS[0] is pinned to the default elsewhere;
   *  this states the intent for THIS row directly. */
  it('is not the default model', () => {
    expect(FREEBUFF_MODELS[0]?.id).not.toBe(OX)
  })

  it('matches dated builds of itself, so a variant cannot escape the fence', () => {
    expect(isFreebuffOxAlphaModelId(OX)).toBe(true)
    expect(isFreebuffOxAlphaModelId('stealth/ox-alpha-20260820')).toBe(true)
    expect(isFreebuffOxAlphaModelId('stealth/ox-beta')).toBe(false)
    expect(isFreebuffOxAlphaModelId(null)).toBe(false)
  })
})

describe('Ox Alpha is metered by no pool, and that rests on the price fence', () => {
  it('is standard rather than premium', () => {
    expect(row?.premium).toBe(false)
    expect(FREEBUFF_WEB_PREMIUM_MODEL_IDS as readonly string[]).not.toContain(
      OX,
    )
    expect(FREEBUFF_STANDARD_MODEL_IDS).toContain(OX)
  })

  it('fences the price at exactly zero', () => {
    // The two numbers are the whole justification for the assertion above. A
    // ceiling above zero admits a repriced endpoint, and this row has no pool
    // to bound what that would cost — so raising either of these without also
    // giving the model a quota is the mistake this test exists to stop.
    expect(FREEBUFF_OX_ALPHA_MAX_PRICE.prompt).toBe(0)
    expect(FREEBUFF_OX_ALPHA_MAX_PRICE.completion).toBe(0)
  })
})

describe('Ox Alpha discloses retention without claiming a training grant', () => {
  it('warns, while staying dataUse: service', () => {
    // The one row in the catalog where a warning does NOT imply
    // `dataUse: 'training'`. OpenRouter's stealth terms say the host retains
    // prompts and completions and does not train on them, so the warning is
    // owed and the training label is not. `dataUse` is machine-readable and
    // drives trace storage, which is why it may not be used as a stand-in for
    // "something to disclose".
    expect(row?.warning).toBeDefined()
    expect(row?.dataUse).toBe('service')
    expect(FREEBUFF_TRACED_MODEL_IDS as readonly string[]).not.toContain(OX)
  })
})

describe('Ox Alpha names its own reasoning effort', () => {
  it('sends high, not the provider default of max', () => {
    // Reasoning is MANDATORY on this model and the provider's default rung is
    // `max` — measured at ~4x the completion tokens and ~4x the latency of
    // `high`, with samples truncated mid-answer. An unset effort here is not a
    // neutral choice; it is that rung.
    expect(getFreebuffModelReasoningEffort(OX)).toBe('high')
    expect(row?.efforts).toEqual(['low', 'high', 'max'])
    expect(row?.defaultEffort).toBe('high')
  })

  it('carries a context window rather than falling back to the default', () => {
    // Absent, base-chat budgets a million-token model 131,072 and summarizes a
    // thread ~8x early, throwing away the prompt cache each time.
    expect(FREEBUFF_MODEL_CONTEXT_WINDOWS[OX]).toBe(1_000_000)
  })
})

describe('Ox Alpha is registered everywhere a root must be', () => {
  it('has a base2 and a base3 root, both allowlisted and both pinned', () => {
    expect(FREEBUFF_ROOT_AGENT_ID_BY_MODEL[OX]).toBe('base2-free-ox-alpha')
    expect(FREEBUFF_WEB_BASE3_AGENT_ID_BY_MODEL[OX]).toBe('base3-free-ox-alpha')
    for (const id of ['base2-free-ox-alpha', 'base3-free-ox-alpha']) {
      // Missing from this list, the root's own requests 403 with
      // free_mode_invalid_agent_hierarchy.
      expect(FREEBUFF_ROOT_AGENT_IDS as readonly string[]).toContain(id)
      // Pinned to exactly one model: a root that allows more than one is a
      // door onto everything else it allows.
      expect([...(FREE_MODE_AGENT_MODELS[id] ?? [])]).toEqual([OX])
    }
  })
})

describe('Ox Alpha reaches limited-tier regions', () => {
  it('is offered and admitted at limited tier', () => {
    // Both halves, because they are enforced in different places and only one
    // of them is visible to a user: the picker list decides whether the row is
    // drawn, and the session gate decides whether their first send works. A row
    // that passes one and fails the other is the exact shape of the GLM/Desktop
    // bug freebuff-offer-invariants.ts was written for.
    expect(isFreebuffWebModelAllowedForLimitedTier(OX)).toBe(true)
    expect(isFreebuffSessionModelAllowedForAccessTier(OX, 'limited')).toBe(true)
    expect(FREEBUFF_WEB_LIMITED_MODEL_IDS).toContain(OX)
    expect(FREEBUFF_WEB_GEO_EXEMPT_MODEL_IDS as readonly string[]).toContain(OX)
  })

  /**
   * The two limited catalogs now AGREE for this row. They were deliberately
   * split while the model was browser-only: LIMITED_FREEBUFF_MODEL_IDS maps
   * over SUPPORTED_FREEBUFF_MODELS and feeds the CLI picker, the home FAQ and
   * the README, so listing a row there that CLI could not run would have
   * advertised it on surfaces that fail on send. Now that it IS in
   * SUPPORTED_FREEBUFF_MODELS, joining is required rather than merely allowed
   * -- omitting it would offer the row to limited users on Web while denying
   * the same users the same row on CLI.
   */
  it('joins the CLI/Desktop limited catalog now that CLI can run it', () => {
    expect(LIMITED_FREEBUFF_MODEL_IDS as readonly string[]).toContain(OX)
    expect(SUPPORTED_FREEBUFF_MODELS.map((m) => m.id)).toContain(OX)
  })

  it('still costs the limited pool nothing extra', () => {
    // The limited tier is metered by REGION, not by model: every limited
    // session draws on the same pool whichever row it picks. This widens what
    // those users may choose, never how much they get — so no quota list
    // mentions the model, and none should.
    expect(FREEBUFF_WEB_PREMIUM_MODEL_IDS as readonly string[]).not.toContain(
      OX,
    )
  })
})

describe('Ox Alpha is no longer service-account-only', () => {
  /**
   * The service-only gate was released on 2026-08-24 because it is
   * incompatible with shipping the row to CLI and Desktop: it means "served
   * only to the Freebuff Web service account", so keeping it would 403 every
   * CLI turn.
   *
   * State the cost rather than let it disappear into a deleted assertion. This
   * model is metered by NOTHING -- premium: false, no pool, price fenced at $0
   * -- which is exactly what made it the most attractive row in the catalog for
   * a reselling proxy. What still stands is narrower: the tool-schema check
   * downgrades third-party clients on every model, but not one that has
   * faithfully reproduced our toolset.
   */
  it('is served to ordinary callers, and the list is empty', () => {
    expect(isFreebuffServiceOnlyModelId(OX)).toBe(false)
    expect(FREEBUFF_SERVICE_ONLY_MODEL_IDS as readonly string[]).toEqual([])
  })

  /** The predicate itself is unchanged and still matches dated builds, so
   *  re-adding any id here keeps working the way it did. */
  it('still matches dated builds when a model IS on the list', () => {
    expect(isFreebuffServiceOnlyModelId(FREEBUFF_MIMO_V25_MODEL_ID)).toBe(false)
    expect(isFreebuffServiceOnlyModelId(null)).toBe(false)
  })

  /**
   * Replaces "is the only model on that list, and the reason is the missing
   * pool". The list is empty now, so the question is no longer which models are
   * on it -- it is that Ox Alpha remains the row a gate like this exists FOR,
   * and nothing else has quietly acquired the same shape.
   *
   * Muse Spark and Kimi K3 Eco are browser-only too and would have passed the
   * old gate, but both are premium-pooled: a third party reaching one spends a
   * quota that runs out by lunchtime. Ox Alpha is metered by nothing, so if it
   * ever needs re-fencing this is the property to check first.
   */
  it('is still the unmetered row, which is why re-fencing it is the lever', () => {
    expect(FREEBUFF_WEB_PREMIUM_MODEL_IDS as readonly string[]).not.toContain(
      OX,
    )
    expect(FREEBUFF_STANDARD_MODEL_IDS as readonly string[]).toContain(OX)
  })
})

describe('the data tag', () => {
  it('renders wherever the row does, on both tiers', () => {
    // `warning` is what the picker draws the compact "Data" label from, and the
    // row is reachable from the full-access standard group AND the limited
    // tier's list — so a warning that only existed on one of those would be a
    // disclosure a limited-region user never sees.
    expect(row?.warning).toBe('Anonymous provider retains prompts')
    expect(FREEBUFF_WEB_MODELS.find((m) => m.id === OX)?.warning).toBeDefined()
    expect(
      FREEBUFF_WEB_LIMITED_MODEL_IDS.includes(OX) && row?.warning !== undefined,
    ).toBe(true)
  })
})
