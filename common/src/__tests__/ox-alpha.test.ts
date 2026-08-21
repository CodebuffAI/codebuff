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

  it('stays off the CLI and Desktop', () => {
    // The absence from these two lists IS the surface gate: FREEBUFF_MODELS is
    // the CLI/Desktop catalog and SUPPORTED_FREEBUFF_MODELS is what
    // isFreebuffSessionModelId admits there. Adding it to either ships the
    // model to surfaces whose capacity we have not agreed to spend yet.
    expect(FREEBUFF_MODELS.map((m) => m.id)).not.toContain(OX)
    expect(SUPPORTED_FREEBUFF_MODELS.map((m) => m.id)).not.toContain(OX)
    expect(FREEBUFF_CLI_BASE3_AGENT_ID_BY_MODEL[OX]).toBeUndefined()
    expect(FREEBUFF_WEB_ALL_MODELS.map((m) => m.id)).toContain(OX)
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

  it('reaches limited regions WITHOUT joining the CLI/Desktop limited catalog', () => {
    // The split is the whole trick. LIMITED_FREEBUFF_MODEL_IDS maps over
    // SUPPORTED_FREEBUFF_MODELS and feeds the CLI picker, the home FAQ and the
    // README, so adding a Web/Cloud-only row there would advertise it on
    // surfaces that cannot run it — and `LIMITED_FREEBUFF_MODELS` would carry an
    // `undefined!` where the row should be.
    expect(LIMITED_FREEBUFF_MODEL_IDS as readonly string[]).not.toContain(OX)
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

describe('Ox Alpha is unreachable from anything but our own runner', () => {
  it('is service-account-only', () => {
    // The one gate here that an attacker cannot restate. Everything else that
    // keeps this model off a surface is a client-side fact — absent from the
    // CLI catalog means no shipped build renders it, which stops our users and
    // nobody else. A hand-written caller names the agent id and model directly
    // and passes every allowlist, because that pair IS valid; what it cannot
    // produce is the runner's API key.
    expect(isFreebuffServiceOnlyModelId(OX)).toBe(true)
    expect(FREEBUFF_SERVICE_ONLY_MODEL_IDS as readonly string[]).toContain(OX)
  })

  it('covers dated builds and nothing else', () => {
    expect(isFreebuffServiceOnlyModelId('stealth/ox-alpha-20260820')).toBe(true)
    expect(isFreebuffServiceOnlyModelId(FREEBUFF_MIMO_V25_MODEL_ID)).toBe(false)
    expect(isFreebuffServiceOnlyModelId(null)).toBe(false)
  })

  it('is the only model on that list, and the reason is the missing pool', () => {
    // Muse Spark and Kimi K3 Eco are browser-only too, and would pass this gate
    // in normal operation — but both are premium-pooled, so a third party
    // reaching one spends a quota that runs out. Ox Alpha is metered by
    // nothing, which is what makes it worth a gate of its own. If that ever
    // stops being the distinction, add them here; do not delete this test.
    expect([...FREEBUFF_SERVICE_ONLY_MODEL_IDS]).toEqual([OX])
    expect(FREEBUFF_STANDARD_MODEL_IDS).toContain(OX)
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
