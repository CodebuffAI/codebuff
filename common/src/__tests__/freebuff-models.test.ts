import { describe, expect, test } from 'bun:test'

import { isFreeModeAllowedAgentModel } from '../constants/free-agents'
import {
  canFreebuffModelSpawnGeminiThinker,
  DEFAULT_FREEBUFF_MODEL_ID,
  DEFAULT_FREEBUFF_WEB_MODEL_ID,
  FALLBACK_FREEBUFF_MODEL_ID,
  FREEBUFF_WEB_DEEMPHASIZED_MODEL_IDS,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_DESKTOP_SESSION_LIMITS,
  FREEBUFF_FABLE_5_MODEL_ID,
  FREEBUFF_ENABLE_MIMO_MODELS_IN_UI,
  FREEBUFF_GLM_V52_MODEL_ID,
  FREEBUFF_GPT_5_6_LUNA_MAX_PRICE,
  FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  FREEBUFF_GPT_5_6_LUNA_PROVIDER_ROUTE,
  FREEBUFF_GPT_5_6_LUNA_REASONING_EFFORT,
  FREEBUFF_KIMI_K3_ECO_MODEL_ID,
  FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID,
  FREEBUFF_MUSE_SPARK_REASONING_EFFORT,
  getFreebuffModelReasoningEffort,
  MUSE_SPARK_12_CONTRIBUTOR_UPSTREAM_MODEL_ID,
  MUSE_SPARK_FALLBACK_AFTER_MS,
  MUSE_SPARK_FALLBACK_MODEL_ID,
  MUSE_SPARK_FALLBACK_NOTICE,
  isMuseSparkModelId,
  LIMITED_FREEBUFF_MODEL_ID,
  LIMITED_FREEBUFF_MODEL_IDS,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_MODELS,
  FREEBUFF_WEB_GOD_ONLY_MODELS,
  FREEBUFF_WEB_ALL_MODELS,
  FREEBUFF_WEB_MODELS,
  FREEBUFF_WEB_RETIRED_PICKER_MODEL_IDS,
  FREEBUFF_STANDARD_MODEL_IDS,
  SUPPORTED_FREEBUFF_MODELS,
  getFreebuffDeploymentAvailabilityLabel,
  getFreebuffDesktopSessionBucket,
  getFreebuffModel,
  getFreebuffModelImageSupport,
  getFreebuffWebModel,
  getFreebuffModelsForAccessTier,
  getRecommendedFreebuffModelId,
  getRecommendedFreebuffWebModelId,
  isFreebuffWebDeemphasizedModelId,
  isFreebuffDeploymentHours,
  isFreebuffGlmV52ModelId,
  isFreebuffGpt56LunaModelId,
  isFreebuffLimitedOfferModelId,
  getFreebuffPerModelSessionCap,
  freebuffWithdrawnModelMessage,
  isFreebuffPausedFreeModelId,
  isFreebuffSessionModelAllowedForAccessTier,
  isFreebuffSessionModelAvailable,
  isFreebuffTracedModelId,
  isFreebuffWebGeoExemptModelId,
  isFreebuffWebSelectableModelId,
  isFreebuffModelId,
  isFreebuffMultimodalModelId,
  isFreebuffModelAllowedForAccessTier,
  isFreebuffPremiumModelId,
  isFreebuffWebGodOnlyModelId,
  isFreebuffWebRememberableModelId,
  isFreebuffWebModelAllowedForLimitedTier,
  isFreebuffWebModelId,
  isFreebuffWebMultimodalModelId,
  isFreebuffWebPremiumModelId,
  resolveRememberedFreebuffWebModel,
  isSupportedFreebuffModelId,
  isFreebuffSessionModelId,
  resolveFreebuffWebModel,
  resolveFreebuffWebModelForLimitedTier,
  resolveFreebuffModelForAccessTier,
  resolveFreebuffSessionModelForAccessTier,
  getFreebuffModelSupersededBy,
  migrateSupersededFreebuffModelPreference,
} from '../constants/freebuff-models'
import type { FreebuffModelOption } from '../constants/freebuff-models'
import { minimaxModels } from '../constants/model-config'

const FREEBUFF_KIMI_MODEL_ID = 'moonshotai/kimi-k2.7-code'
// Both removed 2026-08-04. Held as literals, not imported constants, so these
// guards keep asserting on the WIRE ids even if a constant of the same name is
// ever reintroduced.
const FREEBUFF_MIMO_V25_PRO_MODEL_ID = 'mimo/mimo-v2.5-pro'
const FREEBUFF_CROF_GLM_V52_MODEL_ID = 'crof/glm-5.2'

const MINIMAX_M3_MODEL_ID = minimaxModels.minimaxM3

describe('freebuff model availability', () => {
  test('defaults to V4 Pro and falls back to V4 Flash for new clients', () => {
    // The two constants answer different questions and name different models:
    // the default is what we RECOMMEND, the fallback is what is always joinable
    // when the premium pool is spent. Flash holds the first and MiMo the second
    // since Flash became premium (2026-08-18).
    expect(DEFAULT_FREEBUFF_MODEL_ID).toBe(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
    expect(FALLBACK_FREEBUFF_MODEL_ID).toBe(FREEBUFF_MIMO_V25_MODEL_ID)
    // The default may be premium — it steps down when the pool is spent — but
    // it must NOT be on the one-a-day ceiling, which would cap the recommended
    // model at a single hour. That ceiling is V4 Pro's alone for exactly this
    // reason; Flash is metered by the ordinary premium pool.
    expect(
      Boolean(getFreebuffPerModelSessionCap(DEFAULT_FREEBUFF_MODEL_ID)),
    ).toBe(false)
    expect(isFreebuffPremiumModelId(DEFAULT_FREEBUFF_MODEL_ID)).toBe(true)
    expect(
      Boolean(getFreebuffPerModelSessionCap(FALLBACK_FREEBUFF_MODEL_ID)),
    ).toBe(false)
    // The default is premium, so every surface that offers it has to know the
    // live quota — that is the whole reason the fallback exists separately.
    //
    // The fallback being NON-premium is the load-bearing half: it is where every
    // surface steps down when the pool is spent, so a premium value here would
    // step users onto a model that fails admission for exactly the users it was
    // meant to rescue.
    expect(isFreebuffPremiumModelId(DEFAULT_FREEBUFF_MODEL_ID)).toBe(true)
    expect(isFreebuffPremiumModelId(FALLBACK_FREEBUFF_MODEL_ID)).toBe(false)
  })

  test('desktop concurrency splits full access into 1 premium and 3 unlimited sessions', () => {
    // Flash moved from the unlimited bucket to the premium one when it became
    // premium — a real concurrency change for desktop users (3 tabs to 1), and
    // an automatic one, since the bucket list is a superset of the premium ids.
    expect(
      getFreebuffDesktopSessionBucket(
        FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
        'full',
      ),
    ).toBe('premium')
    expect(
      getFreebuffDesktopSessionBucket(FREEBUFF_MIMO_V25_MODEL_ID, 'full'),
    ).toBe('unlimited')
    expect(FREEBUFF_DESKTOP_SESSION_LIMITS).toEqual({
      premium: 1,
      unlimited: 3,
    })
    expect(
      getFreebuffDesktopSessionBucket(
        FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
        'limited',
      ),
    ).toBe('premium')
  })

  test('DeepSeek Pro keeps its AI-training warning while paused', () => {
    // Not in FREEBUFF_MODELS any more — paused models stay in SUPPORTED so the
    // server can recognise and coerce them, and a row support can still look up
    // has to keep its disclosure.
    const deepseek = SUPPORTED_FREEBUFF_MODELS.find(
      (m) => m.id === FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    )
    expect((deepseek as { warning?: string } | undefined)?.warning).toBe(
      'May use data for AI training',
    )
  })

  test('DeepSeek Flash carries the AI-training warning before selection', () => {
    const deepseek = FREEBUFF_MODELS.find(
      (m) => m.id === FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect((deepseek as { warning?: string } | undefined)?.warning).toBe(
      'May use data for AI training',
    )
  })

  test('only the DeepSeek family is trace-stored in free mode', () => {
    // MiMo is the non-training row still in the picker; M3 was withdrawn on
    // 2026-08-20 and is no longer there to check.
    const mimo = FREEBUFF_MODELS.find(
      (m) => m.id === FREEBUFF_MIMO_V25_MODEL_ID,
    )
    expect((mimo as { warning?: string } | undefined)?.warning).toBeUndefined()
    // The DeepSeek family discloses AI training and IS stored.
    expect(isFreebuffTracedModelId(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID)).toBe(
      true,
    )
    expect(isFreebuffTracedModelId(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)).toBe(
      true,
    )
    // Everything else (incl. M3 on Fireworks) is NOT stored.
    expect(isFreebuffTracedModelId(MINIMAX_M3_MODEL_ID)).toBe(false)
    expect(isFreebuffTracedModelId(FREEBUFF_KIMI_MODEL_ID)).toBe(false)
    expect(isFreebuffTracedModelId(FREEBUFF_MIMO_V25_MODEL_ID)).toBe(false)
    expect(isFreebuffTracedModelId(null)).toBe(false)
  })

  test('trace storage follows machine-readable data-use metadata', () => {
    const models: readonly FreebuffModelOption[] = SUPPORTED_FREEBUFF_MODELS
    for (const model of models) {
      expect(isFreebuffTracedModelId(model.id)).toBe(
        model.dataUse === 'training',
      )
      expect(model.warning !== undefined).toBe(model.dataUse === 'training')
    }
  })

  test('DeepSeek V4 Flash is selectable and premium', () => {
    expect(FREEBUFF_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect(isFreebuffModelId(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)).toBe(true)
    // TEMPORARY (2026-08-18). Flash was the unlimited row every account could
    // run without touching the daily pool; it is metered by that pool now.
    expect(isFreebuffPremiumModelId(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)).toBe(
      true,
    )
    // The catalog must never be all-premium: something has to be left for an
    // account whose pool is spent, and MiMo 2.5 is the only unlimited row while
    // this holds.
    expect(FREEBUFF_MODELS.some((model) => !model.premium)).toBe(true)
  })

  test('V4 Pro is selectable, premium, and recommended by nothing', () => {
    // Pro was pulled from the catalog on 2026-08-18 and put back on 08-19:
    // monitoring its cost and routing its provider both need it to serve
    // traffic. What replaced the removal is de-recommendation, and these are
    // the four places that has to hold.
    expect(FREEBUFF_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    )
    expect(isFreebuffPremiumModelId(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID)).toBe(
      true,
    )
    expect(isFreebuffPausedFreeModelId(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID)).toBe(
      false,
    )

    // Not a default on any surface...
    expect(DEFAULT_FREEBUFF_MODEL_ID).not.toBe(
      FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    )
    expect(DEFAULT_FREEBUFF_WEB_MODEL_ID).not.toBe(
      FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    )
    expect(getRecommendedFreebuffModelId('full')).not.toBe(
      FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    )
    // ...and nothing steers a user TOWARD it, which is the failure mode that
    // would quietly undo the rest: a supersedes notice is a one-click switch
    // and migrateSupersededFreebuffModelPreference rewrites stored picks.
    const all = FREEBUFF_MODELS.map((model) => model.id)
    for (const id of all) {
      const superseded = getFreebuffModelSupersededBy(id, all)
      if (!superseded) continue
      expect(superseded.modelId).not.toBe(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID)
    }
    // It steers the other way instead.
    expect(
      getFreebuffModelSupersededBy(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID, all)
        ?.modelId,
    ).toBe(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
    // Sorted last rather than muted — see the note on FREEBUFF_MODELS.
    expect(all[all.length - 1]).toBe(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID)
  })

  test('MiMo 2.5 remains supported and follows the UI rollout flag', () => {
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_MIMO_V25_MODEL_ID,
    )

    if (FREEBUFF_ENABLE_MIMO_MODELS_IN_UI) {
      expect(FREEBUFF_MODELS.map((model) => model.id)).toContain(
        FREEBUFF_MIMO_V25_MODEL_ID,
      )
    } else {
      expect(FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
        FREEBUFF_MIMO_V25_MODEL_ID,
      )
    }

    expect(isFreebuffPremiumModelId(FREEBUFF_MIMO_V25_MODEL_ID)).toBe(false)
    expect(getFreebuffModelImageSupport(FREEBUFF_MIMO_V25_MODEL_ID)).toBe(true)
  })

  test('MiMo 2.5 Pro is fully removed from Freebuff', () => {
    // Retired from the client pickers 2026-07-31, server half removed
    // 2026-08-04 once the tail had decayed from ~170 to ~33 daily users. Same
    // two-stage shape Kimi K2.7 Code went through. Paid/BYOK MiMo Pro is
    // unaffected; it never resolves through these helpers.
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_MIMO_V25_PRO_MODEL_ID,
    )
    expect(FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_MIMO_V25_PRO_MODEL_ID,
    )
    expect(FREEBUFF_WEB_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_MIMO_V25_PRO_MODEL_ID,
    )
    expect(isFreebuffModelId(FREEBUFF_MIMO_V25_PRO_MODEL_ID)).toBe(false)
    expect(isSupportedFreebuffModelId(FREEBUFF_MIMO_V25_PRO_MODEL_ID)).toBe(
      false,
    )
    expect(isFreebuffSessionModelId(FREEBUFF_MIMO_V25_PRO_MODEL_ID)).toBe(false)
    expect(isFreebuffPremiumModelId(FREEBUFF_MIMO_V25_PRO_MODEL_ID)).toBe(false)
    // The non-Pro model must not be caught by the removal: the ids share a
    // prefix, and freebuffModelIdMatches only tolerates dated suffixes.
    expect(isFreebuffSessionModelId(FREEBUFF_MIMO_V25_MODEL_ID)).toBe(true)
  })

  test('reports image support only for known Freebuff models', () => {
    expect(
      getFreebuffModelImageSupport(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID),
    ).toBe(false)
    expect(getFreebuffModelImageSupport(MINIMAX_M3_MODEL_ID)).toBe(true)
    expect(
      getFreebuffModelImageSupport('vendor/new-vision-model'),
    ).toBeUndefined()

    for (const model of SUPPORTED_FREEBUFF_MODELS) {
      expect(isFreebuffMultimodalModelId(model.id)).toBe(model.multimodal)
    }
    for (const model of FREEBUFF_WEB_ALL_MODELS) {
      expect(isFreebuffWebMultimodalModelId(model.id)).toBe(model.multimodal)
    }
  })

  test('Kimi K2.7 Code is fully removed from Freebuff', () => {
    // Removed 2026-07-31 (client pickers went first, on 2026-07-30). The server
    // half is gone too, so a stale client selection is no longer admitted —
    // that tail was still spending ~$[redacted]/day. Paid/BYOK Kimi is unaffected;
    // it never resolves through these helpers.
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_KIMI_MODEL_ID,
    )
    expect(FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_KIMI_MODEL_ID,
    )
    expect(
      getFreebuffModelsForAccessTier('full').map((m) => m.id),
    ).not.toContain(FREEBUFF_KIMI_MODEL_ID)
    expect(isFreebuffModelId(FREEBUFF_KIMI_MODEL_ID)).toBe(false)
    expect(isSupportedFreebuffModelId(FREEBUFF_KIMI_MODEL_ID)).toBe(false)
    expect(getFreebuffWebModel(FREEBUFF_KIMI_MODEL_ID).id).toBe(
      FALLBACK_FREEBUFF_MODEL_ID,
    )
    expect(isFreebuffPremiumModelId(FREEBUFF_KIMI_MODEL_ID)).toBe(false)
    expect(
      isFreebuffModelAllowedForAccessTier(FREEBUFF_KIMI_MODEL_ID, 'full'),
    ).toBe(false)
    expect(
      resolveFreebuffModelForAccessTier(FREEBUFF_KIMI_MODEL_ID, 'full'),
    ).toBe(FALLBACK_FREEBUFF_MODEL_ID)
    // Session admission no longer accepts it either, so live stale sessions
    // resolve to the fallback instead of continuing on Kimi.
    expect(
      isFreebuffSessionModelAllowedForAccessTier(
        FREEBUFF_KIMI_MODEL_ID,
        'full',
      ),
    ).toBe(false)
    expect(
      resolveFreebuffSessionModelForAccessTier(FREEBUFF_KIMI_MODEL_ID, 'full', {
        includeGodOnly: false,
      }),
    ).toBe(FALLBACK_FREEBUFF_MODEL_ID)
    // Retired K2.6 is no longer a freebuff model; stale saved selections must
    // fall back rather than be admitted.
    expect(isSupportedFreebuffModelId('moonshotai/kimi-k2.6')).toBe(false)
    expect(
      isFreebuffModelAllowedForAccessTier('moonshotai/kimi-k2.6', 'full'),
    ).toBe(false)
    expect(
      resolveFreebuffModelForAccessTier('moonshotai/kimi-k2.6', 'full'),
    ).not.toBe('moonshotai/kimi-k2.6')
  })

  test('both HY3 routes are fully removed from Freebuff', () => {
    // HY3 was withdrawn from the Web picker during the initial rollout and left
    // in FREEBUFF_WEB_RETIRED_PICKER_MODEL_IDS, which is a client-side filter
    // and therefore not a gate at all — the same mistake that let the CrofAI
    // GLM route be farmed. Removed outright 2026-08-04, along with the
    // god-only paid OpenRouter route.
    //
    // As of 2026-08-07 the wire-id CONSTANTS are gone too: hy3-fallback.ts and
    // the Atlas Cloud adapter that was its paid lane have been deleted, so
    // nothing routes `tencent/hy3` on any path, paid or free. The slugs are
    // spelled out literally here precisely because no constant remains to
    // import — that is the point of the test.
    for (const hy3Id of ['tencent/hy3:free', 'tencent/hy3']) {
      expect(FREEBUFF_MODELS.map((model) => model.id)).not.toContain(hy3Id)
      expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
        hy3Id,
      )
      expect(FREEBUFF_WEB_MODELS.map((model) => model.id)).not.toContain(hy3Id)
      expect(
        FREEBUFF_WEB_GOD_ONLY_MODELS.map((model) => model.id),
      ).not.toContain(hy3Id)
      expect(FREEBUFF_WEB_ALL_MODELS.map((model) => model.id)).not.toContain(
        hy3Id,
      )

      expect(isFreebuffModelId(hy3Id)).toBe(false)
      expect(isSupportedFreebuffModelId(hy3Id)).toBe(false)
      expect(isFreebuffWebModelId(hy3Id, { includeGodOnly: true })).toBe(false)
      expect(isFreebuffWebGodOnlyModelId(hy3Id)).toBe(false)
      expect(isFreebuffSessionModelId(hy3Id)).toBe(false)
      // No pool may meter it, in either direction: premium would hand it out
      // free, and standard would leave it unlimited.
      expect(isFreebuffWebPremiumModelId(hy3Id)).toBe(false)
      expect(isFreebuffPremiumModelId(hy3Id)).toBe(false)
      expect(FREEBUFF_STANDARD_MODEL_IDS).not.toContain(hy3Id)
      // A stale saved selection downgrades rather than resolving to itself.
      expect(resolveFreebuffWebModel(hy3Id, { includeGodOnly: true })).toBe(
        FALLBACK_FREEBUFF_MODEL_ID,
      )
      expect(getFreebuffWebModel(hy3Id).id).toBe(FALLBACK_FREEBUFF_MODEL_ID)
    }
  })

  test('the picker-retirement list is empty, and that is deliberate', () => {
    // Both former occupants (HY3, CrofAI GLM 5.2) were farmed or left publicly
    // advertised precisely because a picker-only retirement is a UI change, not
    // a gate. If this fails, something was parked here instead of removed —
    // check that the id being reachable by a direct API caller is actually
    // harmless before accepting it.
    expect(FREEBUFF_WEB_RETIRED_PICKER_MODEL_IDS).toEqual([])
    for (const model of FREEBUFF_WEB_ALL_MODELS) {
      expect(isFreebuffWebSelectableModelId(model.id)).toBe(true)
    }
  })

  test('GLM 5.2 is referral-only and reachable by exactly one model id', () => {
    // The earned route stays selectable — removing the other GLM route must
    // never take this one down with it.
    expect(isFreebuffWebSelectableModelId(FREEBUFF_GLM_V52_MODEL_ID)).toBe(true)
    // Every other web model is unaffected.
    expect(
      isFreebuffWebSelectableModelId(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID),
    ).toBe(true)
  })

  test('CLI access-tier resolver preserves GLM at every tier', () => {
    expect(
      resolveFreebuffModelForAccessTier(FREEBUFF_GLM_V52_MODEL_ID, 'full'),
    ).toBe(FREEBUFF_GLM_V52_MODEL_ID)
    // Since bounties (2026-08-03), GLM survives the limited-tier coercion: a
    // bounty-earned session is redeemable in every region. The entitlement
    // gate moved DOWN into the GLM quota pool, which at limited tier counts
    // ONLY grants minted redeemable_at_limited_tier — referral GLM still buys
    // a limited-tier user nothing. Coercing here instead would rewrite a
    // deliberate pick to DeepSeek and strand the session they earned.
    expect(
      resolveFreebuffModelForAccessTier(FREEBUFF_GLM_V52_MODEL_ID, 'limited'),
    ).toBe(FREEBUFF_GLM_V52_MODEL_ID)
    // Everything else still collapses to the limited model.
    expect(
      resolveFreebuffModelForAccessTier(FREEBUFF_KIMI_MODEL_ID, 'limited'),
    ).toBe(LIMITED_FREEBUFF_MODEL_ID)
  })

  test('the CrofAI GLM 5.2 wire id is fully removed', () => {
    // Retired from the pickers 2026-07-30 and deleted 2026-08-04. The picker
    // retirement was client-side only, so hand-written API callers kept
    // admitting sessions on this id and drawing GLM 5.2 from the free daily
    // PREMIUM pool instead of the earned GLM pool — 12-49 distinct accounts a
    // day, five days after it was supposedly unreachable. No shipped client
    // ever bundled it, so deleting it breaks nothing.
    //
    // The invariant this guards: GLM 5.2 must have exactly ONE wire id. The
    // quota pool is chosen by model id, so a second id is a second entitlement.
    expect(FREEBUFF_WEB_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_CROF_GLM_V52_MODEL_ID,
    )
    expect(FREEBUFF_WEB_ALL_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_CROF_GLM_V52_MODEL_ID,
    )
    expect(isFreebuffWebModelId(FREEBUFF_CROF_GLM_V52_MODEL_ID)).toBe(false)
    expect(isFreebuffSessionModelId(FREEBUFF_CROF_GLM_V52_MODEL_ID)).toBe(false)
    // Critically: it must not be metered by the free daily premium pool, which
    // is the door this whole removal closes.
    expect(isFreebuffWebPremiumModelId(FREEBUFF_CROF_GLM_V52_MODEL_ID)).toBe(
      false,
    )
    expect(FREEBUFF_STANDARD_MODEL_IDS).not.toContain(
      FREEBUFF_CROF_GLM_V52_MODEL_ID,
    )
    // A stale saved selection downgrades to the always-available fallback.
    expect(resolveFreebuffWebModel(FREEBUFF_CROF_GLM_V52_MODEL_ID)).toBe(
      FALLBACK_FREEBUFF_MODEL_ID,
    )
    // The earned route is untouched.
    expect(isFreebuffGlmV52ModelId(FREEBUFF_GLM_V52_MODEL_ID)).toBe(true)
    expect(isFreebuffSessionModelId(FREEBUFF_GLM_V52_MODEL_ID)).toBe(true)
  })

  test('GLM 5.2 is never remembered as the default model', () => {
    // GLM runs out long before the rest of the picker, so remembering it would
    // strand a new thread / app / page load on a model that fails admission.
    expect(isFreebuffWebRememberableModelId(FREEBUFF_GLM_V52_MODEL_ID)).toBe(
      false,
    )
    expect(resolveRememberedFreebuffWebModel(FREEBUFF_GLM_V52_MODEL_ID)).toBe(
      DEFAULT_FREEBUFF_WEB_MODEL_ID,
    )
    // Pro resolves to itself again — it is a real catalog row, just not one
    // anything recommends. (It self-healed to the fallback for one day while it
    // was paused.)
    expect(
      resolveRememberedFreebuffWebModel(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID),
    ).toBe(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID)
    expect(resolveRememberedFreebuffWebModel(FREEBUFF_KIMI_MODEL_ID)).toBe(
      FALLBACK_FREEBUFF_MODEL_ID,
    )
    expect(
      resolveRememberedFreebuffWebModel(FREEBUFF_KIMI_K3_ECO_MODEL_ID, {
        includeGodOnly: true,
      }),
    ).toBe(FREEBUFF_KIMI_K3_ECO_MODEL_ID)
    // A retired/unknown saved id keeps the pre-existing resolution: the
    // always-available fallback, not the premium default.
    expect(resolveRememberedFreebuffWebModel('some/retired-model')).toBe(
      FALLBACK_FREEBUFF_MODEL_ID,
    )
  })

  test('every Web picker model falls into exactly one quota group', () => {
    // The Web/Cloud picker groups rows by these two predicates (referral GLM,
    // premium) and treats the remainder as Standard. Each group is metered by a
    // different pool, so a model matching both — or a premium model matching
    // neither and silently landing in the free Standard group — is a quota bug,
    // not a cosmetic one.
    for (const model of FREEBUFF_WEB_MODELS) {
      const groups = [
        isFreebuffGlmV52ModelId(model.id),
        isFreebuffWebPremiumModelId(model.id),
      ].filter(Boolean)
      expect({ id: model.id, groups: groups.length }).toEqual({
        id: model.id,
        // Zero groups means the Standard pool, which is only correct for a
        // model that is not marked premium.
        groups: model.premium ? 1 : 0,
      })
    }
  })

  test('the removed CrofAI GLM 5.2 id is admitted at no access tier', () => {
    for (const tier of ['limited', 'full'] as const) {
      expect(
        isFreebuffSessionModelAllowedForAccessTier(
          FREEBUFF_CROF_GLM_V52_MODEL_ID,
          tier,
        ),
      ).toBe(false)
    }
    expect(
      isFreebuffWebModelAllowedForLimitedTier(FREEBUFF_CROF_GLM_V52_MODEL_ID),
    ).toBe(false)
    expect(isFreebuffWebGeoExemptModelId(FREEBUFF_CROF_GLM_V52_MODEL_ID)).toBe(
      false,
    )
    expect(
      resolveFreebuffWebModelForLimitedTier(FREEBUFF_CROF_GLM_V52_MODEL_ID),
    ).toBe(LIMITED_FREEBUFF_MODEL_ID)
  })

  test('bounty GLM 5.2 survives the Web limited-tier coercion', () => {
    // Regression: this coercion ran BEFORE the quota pool got a say, so a
    // limited-region user who had earned a bounty session had their pick
    // rewritten to the flash model and could never spend the reward. The
    // entitlement gate is the GLM pool (bounty grants only) — not this
    // allowlist, which is purely about what the picker may display.
    expect(
      isFreebuffWebModelAllowedForLimitedTier(FREEBUFF_GLM_V52_MODEL_ID),
    ).toBe(true)
    expect(
      resolveFreebuffWebModelForLimitedTier(FREEBUFF_GLM_V52_MODEL_ID),
    ).toBe(FREEBUFF_GLM_V52_MODEL_ID)

    // The CrofAI GLM route is a paid premium model, NOT the earned one, and
    // must stay coerced away — the two ids are easy to confuse.
    expect(
      isFreebuffWebModelAllowedForLimitedTier(FREEBUFF_CROF_GLM_V52_MODEL_ID),
    ).toBe(false)
  })

  test('Kimi K3 is a god-only Freebuff Web/Cloud test model', () => {
    // The wire id must keep the `crof/` prefix and the `-eco` build suffix:
    // isCrofModel keys off the exact id, and CrofAI also serves a full
    // `kimi-k3` at twice the price. See kimi-k3-god-only.test.ts.
    expect(FREEBUFF_KIMI_K3_ECO_MODEL_ID).toBe('crof/kimi-k3-eco')

    expect(FREEBUFF_WEB_GOD_ONLY_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_KIMI_K3_ECO_MODEL_ID,
    )
    expect(FREEBUFF_WEB_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_KIMI_K3_ECO_MODEL_ID,
    )
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_KIMI_K3_ECO_MODEL_ID,
    )

    expect(isFreebuffWebModelId(FREEBUFF_KIMI_K3_ECO_MODEL_ID)).toBe(false)
    expect(
      isFreebuffWebModelId(FREEBUFF_KIMI_K3_ECO_MODEL_ID, {
        includeGodOnly: true,
      }),
    ).toBe(true)
    expect(isFreebuffWebGodOnlyModelId(FREEBUFF_KIMI_K3_ECO_MODEL_ID)).toBe(
      true,
    )
    expect(isFreebuffWebPremiumModelId(FREEBUFF_KIMI_K3_ECO_MODEL_ID)).toBe(
      true,
    )
    // Never reachable from the CLI/Desktop picker or a limited-tier browser.
    expect(isFreebuffPremiumModelId(FREEBUFF_KIMI_K3_ECO_MODEL_ID)).toBe(false)
    expect(isFreebuffModelId(FREEBUFF_KIMI_K3_ECO_MODEL_ID)).toBe(false)
    expect(
      isFreebuffWebModelAllowedForLimitedTier(FREEBUFF_KIMI_K3_ECO_MODEL_ID),
    ).toBe(false)

    expect(resolveFreebuffWebModel(FREEBUFF_KIMI_K3_ECO_MODEL_ID)).toBe(
      FALLBACK_FREEBUFF_MODEL_ID,
    )
    expect(
      resolveFreebuffWebModel(FREEBUFF_KIMI_K3_ECO_MODEL_ID, {
        includeGodOnly: true,
      }),
    ).toBe(FREEBUFF_KIMI_K3_ECO_MODEL_ID)

    const model = getFreebuffWebModel(FREEBUFF_KIMI_K3_ECO_MODEL_ID)
    // 'Kimi K3', not 'Kimi K3 Eco' — deliberate, see kimi-k3-god-only.test.ts.
    expect(model.displayName).toBe('Kimi K3')
    expect(model.tagline).toBe('Via CrofAI')
    expect(model.experimental).toBe(true)
    expect(model.multimodal).toBe(false)
    expect(getFreebuffModelImageSupport(FREEBUFF_KIMI_K3_ECO_MODEL_ID)).toBe(
      false,
    )
  })

  test('Ling 3.0 Flash and Greg 2 are fully removed from Freebuff', () => {
    // All three were god-only test rows, removed 2026-08-07. Spelled literally
    // because no constant remains to import.
    for (const removedId of [
      'inclusionai/ling-3.0-flash:free',
      'crof/greg-2-ultra',
      'crof/greg-2-super',
    ]) {
      expect(FREEBUFF_WEB_ALL_MODELS.map((model) => model.id)).not.toContain(
        removedId,
      )
      expect(
        FREEBUFF_WEB_GOD_ONLY_MODELS.map((model) => model.id),
      ).not.toContain(removedId)
      expect(isFreebuffWebModelId(removedId, { includeGodOnly: true })).toBe(
        false,
      )
      expect(isFreebuffWebGodOnlyModelId(removedId)).toBe(false)
      expect(isFreebuffSessionModelId(removedId)).toBe(false)
      // No pool may still meter them, in either direction.
      expect(isFreebuffWebPremiumModelId(removedId)).toBe(false)
      expect(FREEBUFF_STANDARD_MODEL_IDS).not.toContain(removedId)
      expect(resolveFreebuffWebModel(removedId, { includeGodOnly: true })).toBe(
        FALLBACK_FREEBUFF_MODEL_ID,
      )
    }
  })

  test('KAT Coder Pro V2 is fully retired from Freebuff Web and Cloud', () => {
    const retiredKatModelId = 'kwaipilot/kat-coder-pro-v2'
    expect(FREEBUFF_WEB_MODELS.map((model) => model.id)).not.toContain(
      retiredKatModelId,
    )
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      retiredKatModelId,
    )
    expect(isFreebuffWebModelId(retiredKatModelId)).toBe(false)
    expect(isFreebuffWebPremiumModelId(retiredKatModelId)).toBe(false)
    expect(resolveFreebuffWebModel(retiredKatModelId)).toBe(
      FALLBACK_FREEBUFF_MODEL_ID,
    )
  })

  test('MiniMax M2.7 support is fully removed', () => {
    const legacyMinimaxM27 = 'minimax/minimax-m2.7'
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      legacyMinimaxM27,
    )
    expect(isFreebuffModelId(legacyMinimaxM27)).toBe(false)
    expect(isSupportedFreebuffModelId(legacyMinimaxM27)).toBe(false)
    expect(isFreebuffModelAllowedForAccessTier(legacyMinimaxM27, 'full')).toBe(
      false,
    )
    // Old clients with a saved M2.7 selection resolve to the fallback model.
    expect(resolveFreebuffModelForAccessTier(legacyMinimaxM27, 'full')).toBe(
      FALLBACK_FREEBUFF_MODEL_ID,
    )
  })

  test('MiniMax M3 is withdrawn: recognised, refused, served to nobody', () => {
    // Withdrawn from free mode entirely on 2026-08-20 after reaching $[redacted]/hr.
    // Out of every picker and pool...
    expect(FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      MINIMAX_M3_MODEL_ID,
    )
    expect(isFreebuffModelId(MINIMAX_M3_MODEL_ID)).toBe(false)
    expect(isFreebuffPremiumModelId(MINIMAX_M3_MODEL_ID)).toBe(false)
    expect(
      isFreebuffSessionModelAllowedForAccessTier(MINIMAX_M3_MODEL_ID, 'full'),
    ).toBe(false)

    // ...but still RECOGNISED, which is what separates withdrawing a model from
    // breaking the clients that still ask for it. Released binaries keep this id
    // in their compiled-in catalog; an unrecognised id can only be refused, and
    // that refusal is the #1801 retry loop.
    expect(isFreebuffSessionModelId(MINIMAX_M3_MODEL_ID)).toBe(true)
    expect(isFreebuffPausedFreeModelId(MINIMAX_M3_MODEL_ID)).toBe(true)
    // It is REFUSED, not silently substituted — the user asked for a specific
    // model and is told it is gone, with what to use instead. The refusal is
    // not session-ending, so the client shows it rather than re-admitting.
    expect(freebuffWithdrawnModelMessage(MINIMAX_M3_MODEL_ID)).toContain(
      'no longer available in Freebuff',
    )
    expect(freebuffWithdrawnModelMessage(MINIMAX_M3_MODEL_ID)).toContain(
      'DeepSeek V4 Flash',
    )

    // The AGENT door stays open, and that is not an oversight. Withdrawal is
    // enforced at admission, so no NEW session can name the model. Sessions
    // admitted before the deploy are still live and hit this allowlist on
    // every turn; dropping the row would fail them mid-turn with
    // free_mode_invalid_agent_model — the same wedge withdrawal exists to
    // avoid. They drain against a door that is already shut in front of them.
    expect(
      isFreeModeAllowedAgentModel('base2-free-minimax-m3', MINIMAX_M3_MODEL_ID),
    ).toBe(true)
  })

  test('the recommended default leads FREEBUFF_MODELS, and the fallback is in it', () => {
    // FREEBUFF_MODELS order IS the picker row order, and it went stale once
    // when the default flipped without reordering — the rows led with Flash
    // while the recommendation already named Pro. Pin the lead position to the
    // constant that drives the recommendation, so a future default change
    // can't silently leave this list behind.
    expect(FREEBUFF_MODELS[0]!.id).toBe(DEFAULT_FREEBUFF_MODEL_ID)
    // And the model every surface steps DOWN to has to be a row the picker
    // actually offers, or the step-down lands on something the user cannot see
    // or re-select afterwards.
    expect(FREEBUFF_MODELS.map((model) => model.id)).toContain(
      FALLBACK_FREEBUFF_MODEL_ID,
    )
  })

  test('GPT-5.6 Luna is a premium model on every full-access surface', () => {
    // The wire id must stay OpenRouter's own slug: getChatCompletionsProvider
    // has no Luna branch, so it only reaches OpenRouter by falling through to
    // the default route with the slug intact.
    expect(FREEBUFF_GPT_5_6_LUNA_MODEL_ID).toBe('openai/gpt-5.6-luna')

    // CLI/Desktop picker, Web/Cloud picker, and the session/chat layers.
    expect(FREEBUFF_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
    )
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
    )
    expect(FREEBUFF_WEB_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
    )
    expect(getFreebuffModelsForAccessTier('full').map((m) => m.id)).toContain(
      FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
    )
    // Everyone on the tier can pick it — it is not god-only and not retired.
    expect(isFreebuffWebGodOnlyModelId(FREEBUFF_GPT_5_6_LUNA_MODEL_ID)).toBe(
      false,
    )
    expect(isFreebuffWebSelectableModelId(FREEBUFF_GPT_5_6_LUNA_MODEL_ID)).toBe(
      true,
    )

    // Metered by the SHARED daily premium pool on every surface, not a pool of
    // its own and never the free standard browser pool.
    expect(isFreebuffPremiumModelId(FREEBUFF_GPT_5_6_LUNA_MODEL_ID)).toBe(true)
    expect(isFreebuffWebPremiumModelId(FREEBUFF_GPT_5_6_LUNA_MODEL_ID)).toBe(
      true,
    )
    expect(FREEBUFF_STANDARD_MODEL_IDS).not.toContain(
      FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
    )
    expect(isFreebuffGlmV52ModelId(FREEBUFF_GPT_5_6_LUNA_MODEL_ID)).toBe(false)
    // Dated snapshots can't dodge the premium quota or the pinned routing.
    expect(
      isFreebuffPremiumModelId(`${FREEBUFF_GPT_5_6_LUNA_MODEL_ID}-20260709`),
    ).toBe(true)
    expect(
      isFreebuffGpt56LunaModelId(`${FREEBUFF_GPT_5_6_LUNA_MODEL_ID}-20260709`),
    ).toBe(true)
    expect(isFreebuffGpt56LunaModelId(FREEBUFF_MIMO_V25_MODEL_ID)).toBe(false)

    const model = getFreebuffWebModel(FREEBUFF_GPT_5_6_LUNA_MODEL_ID)
    expect(model.displayName).toBe('GPT-5.6 Luna')
    // OpenAI's API does not train on request data, so no warning and no
    // trace storage — and it accepts images.
    expect(model.dataUse).toBe('service')
    expect(model.warning).toBeUndefined()
    expect(isFreebuffTracedModelId(FREEBUFF_GPT_5_6_LUNA_MODEL_ID)).toBe(false)
    expect(getFreebuffModelImageSupport(FREEBUFF_GPT_5_6_LUNA_MODEL_ID)).toBe(
      true,
    )
    // Cheap per token, so it is not one of the muted "costly premium" rows.
    expect(
      isFreebuffWebDeemphasizedModelId(FREEBUFF_GPT_5_6_LUNA_MODEL_ID),
    ).toBe(false)

    // Limited regions stay geo-gated to the two limited-tier models.
    expect(
      isFreebuffWebModelAllowedForLimitedTier(FREEBUFF_GPT_5_6_LUNA_MODEL_ID),
    ).toBe(false)
    expect(
      isFreebuffModelAllowedForAccessTier(
        FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
        'limited',
      ),
    ).toBe(false)
  })

  test('GPT-5.6 Luna carries its pinned OpenAI route, price ceiling, and effort', () => {
    // These three constants are the contract web/src/llm-api/openrouter.ts
    // enforces on every Luna request.
    expect(FREEBUFF_GPT_5_6_LUNA_PROVIDER_ROUTE).toBe('openai')
    expect(FREEBUFF_GPT_5_6_LUNA_REASONING_EFFORT).toBe('high')

    // The ceiling is a cost fence, and both bounds are load-bearing. OpenRouter
    // compares strictly, so a ceiling AT OpenAI's $0.10/$0.60 list price 404s
    // every request ("No endpoints found that satisfy the max price") — that
    // shipped on 2026-07-30 and took Luna down until it was raised. It must
    // also stay well under the $1.00/$6.00 Azure/Bedrock charge, which is the
    // 10x route the fence exists to block.
    const { prompt, completion } = FREEBUFF_GPT_5_6_LUNA_MAX_PRICE
    expect(prompt).toBeGreaterThan(0.1)
    expect(completion).toBeGreaterThan(0.6)
    expect(prompt).toBeLessThan(1.0)
    expect(completion).toBeLessThan(6.0)
  })

  test('limited access exposes non-Pro MiMo 2.5, and not the paused Flash', () => {
    expect(LIMITED_FREEBUFF_MODEL_ID).toBe(FREEBUFF_MIMO_V25_MODEL_ID)
    expect(LIMITED_FREEBUFF_MODEL_IDS).toEqual([FREEBUFF_MIMO_V25_MODEL_ID])
    expect(getFreebuffModelsForAccessTier('limited').map((m) => m.id)).toEqual([
      FREEBUFF_MIMO_V25_MODEL_ID,
    ])
    expect(
      isFreebuffModelAllowedForAccessTier(
        FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
        'limited',
      ),
    ).toBe(false)
    expect(
      isFreebuffModelAllowedForAccessTier(MINIMAX_M3_MODEL_ID, 'limited'),
    ).toBe(false)
    expect(
      isFreebuffModelAllowedForAccessTier(
        FREEBUFF_MIMO_V25_MODEL_ID,
        'limited',
      ),
    ).toBe(true)
    expect(
      isFreebuffModelAllowedForAccessTier(
        FREEBUFF_MIMO_V25_PRO_MODEL_ID,
        'limited',
      ),
    ).toBe(false)
    expect(
      resolveFreebuffModelForAccessTier(FREEBUFF_MIMO_V25_MODEL_ID, 'limited'),
    ).toBe(FREEBUFF_MIMO_V25_MODEL_ID)
    expect(
      resolveFreebuffModelForAccessTier(MINIMAX_M3_MODEL_ID, 'limited'),
    ).toBe(FREEBUFF_MIMO_V25_MODEL_ID)
    // A Flash pick saved before the pause is coerced rather than refused, so a
    // returning limited user lands on a model instead of a failed admission.
    expect(
      resolveFreebuffModelForAccessTier(
        FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
        'limited',
      ),
    ).toBe(FREEBUFF_MIMO_V25_MODEL_ID)
    // MiMo is superseded BY the paused Flash and is the tier's only row, so no
    // picker may offer that switch — it would coerce straight back.
    expect(
      getFreebuffModelSupersededBy(FREEBUFF_MIMO_V25_MODEL_ID, [
        ...LIMITED_FREEBUFF_MODEL_IDS,
      ]),
    ).toBeUndefined()
  })

  test('recommends a joinable, in-tier model for the picker hero', () => {
    // Full access → DeepSeek V4 Flash 07/31 (the recommended default since
    // 2026-08-18). It is premium NOW, which it was not the last time it led, so
    // the hero HAS to flip once the daily pool runs dry — the assertions below
    // are what keep the CLI/Desktop hero joinable at every point in a user's
    // day, and they became load-bearing for this model on that date.
    expect(getRecommendedFreebuffModelId('full')).toBe(
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect(getRecommendedFreebuffModelId(undefined)).toBe(
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect(
      getRecommendedFreebuffModelId('full', { premiumExhausted: true }),
    ).toBe(FALLBACK_FREEBUFF_MODEL_ID)
    expect(
      isFreebuffPremiumModelId(
        getRecommendedFreebuffModelId('full', { premiumExhausted: true }),
      ),
    ).toBe(false)
    // Limited access → MiMo 2.5. The membership assertion below is the
    // load-bearing one: the hero is the row Enter lands on, so a hero outside
    // the tier's own set is a first keypress that fails admission.
    expect(getRecommendedFreebuffModelId('limited')).toBe(
      FREEBUFF_MIMO_V25_MODEL_ID,
    )
    expect(
      getFreebuffModelsForAccessTier('limited').some(
        (m) => m.id === getRecommendedFreebuffModelId('limited'),
      ),
    ).toBe(true)
    // Still true with the premium pool spent: that flag steps the FULL-access
    // hero down to Flash, and must not drag the limited hero onto it.
    expect(
      getRecommendedFreebuffModelId('limited', { premiumExhausted: true }),
    ).toBe(FREEBUFF_MIMO_V25_MODEL_ID)
  })

  test('every surface recommends DeepSeek V4 Flash, on two separate constants', () => {
    // Both constants named Pro from 2026-08-12 until it was paused on
    // 2026-08-18, and both fell back to Flash together. They stay TWO constants
    // because they have diverged before and may again.
    expect(DEFAULT_FREEBUFF_WEB_MODEL_ID).toBe(
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect(DEFAULT_FREEBUFF_MODEL_ID).toBe(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
    expect(getRecommendedFreebuffWebModelId('full')).toBe(
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect(getRecommendedFreebuffWebModelId(undefined)).toBe(
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    // Neither default may be a paused model — that is the pairing that would
    // put every new user on a row the server refuses.
    expect(isFreebuffPausedFreeModelId(DEFAULT_FREEBUFF_MODEL_ID)).toBe(false)
    expect(isFreebuffPausedFreeModelId(DEFAULT_FREEBUFF_WEB_MODEL_ID)).toBe(
      false,
    )
    // The recommendation must never be a model the picker also argues against.
    expect(
      getFreebuffModelSupersededBy(
        DEFAULT_FREEBUFF_WEB_MODEL_ID,
        FREEBUFF_WEB_MODELS.map((model) => model.id),
      ),
    ).toBeUndefined()
    // Pro is premium, so the pool CAN run dry — the recommended pick has to
    // stay joinable, and limited tier can't name it at all. Asserted through
    // the tier constant so the hero and the catalog cannot part company.
    expect(getRecommendedFreebuffWebModelId('limited')).toBe(
      LIMITED_FREEBUFF_MODEL_ID,
    )
    // Steps down to the fallback, which is MiMo 2.5 now that Flash is itself
    // premium — the whole point of the two constants being separate.
    expect(
      getRecommendedFreebuffWebModelId('full', { premiumExhausted: true }),
    ).toBe(FALLBACK_FREEBUFF_MODEL_ID)
    expect(
      isFreebuffPremiumModelId(
        getRecommendedFreebuffWebModelId('full', { premiumExhausted: true }),
      ),
    ).toBe(false)
    // The web default must be a real, selectable web model.
    expect(isFreebuffWebModelId(DEFAULT_FREEBUFF_WEB_MODEL_ID)).toBe(true)
    // …and one the limited tier is coerced OFF of, since it is premium.
    expect(
      isFreebuffWebModelAllowedForLimitedTier(DEFAULT_FREEBUFF_WEB_MODEL_ID),
    ).toBe(false)
  })

  test('de-emphasizes nothing, and never the default', () => {
    // The list is empty as of 2026-08-12. MiniMax M3 was the last entry and
    // left when it became the ONLY muted row: the compact treatment folds the
    // tagline onto the name line, which among full-size rows reads as a broken
    // row rather than a quiet one. M3 keeps its supersededBy notice, so the
    // steering survives — see the test below.
    expect(FREEBUFF_WEB_DEEMPHASIZED_MODEL_IDS).toEqual([])
    expect(isFreebuffWebDeemphasizedModelId(MINIMAX_M3_MODEL_ID)).toBe(false)
    expect(
      isFreebuffWebDeemphasizedModelId(`${FREEBUFF_KIMI_MODEL_ID}-20260301`),
    ).toBe(false)
    expect(
      isFreebuffWebDeemphasizedModelId(DEFAULT_FREEBUFF_WEB_MODEL_ID),
    ).toBe(false)
    expect(
      isFreebuffWebDeemphasizedModelId(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID),
    ).toBe(false)
    expect(isFreebuffWebDeemphasizedModelId(null)).toBe(false)
    // V4 Pro left the list on 2026-08-12 too: its 08/13 GA build wins the
    // quality half of the de-emphasis test again, and price alone is not
    // grounds.
    expect(
      isFreebuffWebDeemphasizedModelId(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID),
    ).toBe(false)
    // De-emphasis is presentation only: anything added back stays selectable.
    for (const id of FREEBUFF_WEB_DEEMPHASIZED_MODEL_IDS) {
      expect(isFreebuffWebModelId(id)).toBe(true)
      expect(isFreebuffModelAllowedForAccessTier(id, 'full')).toBe(true)
    }
  })

  test('a withdrawn model is not offered as anyone else’s switch target', () => {
    // M3 carried a "switch to V4 Flash" nudge until it was withdrawn on
    // 2026-08-20. Now the check runs the other way: the picker offers a
    // one-click switch for whatever a notice names, so naming a withdrawn model
    // would hand users a row the server refuses.
    const all = FREEBUFF_MODELS.map((model) => model.id)
    expect(all).not.toContain(MINIMAX_M3_MODEL_ID)
    for (const id of all) {
      const superseded = getFreebuffModelSupersededBy(id, all)
      if (!superseded) continue
      expect(superseded.modelId).not.toBe(MINIMAX_M3_MODEL_ID)
      expect(all).toContain(superseded.modelId)
    }
    // The recommended default is never itself marked superseded.
    expect(
      getFreebuffModelSupersededBy(DEFAULT_FREEBUFF_MODEL_ID, all),
    ).toBeUndefined()
  })

  test('does not steer users off GPT-5.6 Luna, which is now the recommendation', () => {
    // Luna pointed at Flash until 2026-08-19. It cannot any more: a model
    // cannot both BE the recommended default and carry a one-click switch away
    // from itself, and migrateSupersededFreebuffModelPreference would have
    // rewritten every saved Luna pick onto a DeepSeek row metered one a day.
    const all = FREEBUFF_MODELS.map((model) => model.id)
    expect(
      getFreebuffModelSupersededBy(FREEBUFF_GPT_5_6_LUNA_MODEL_ID, all),
    ).toBeUndefined()
    expect(
      migrateSupersededFreebuffModelPreference(
        FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
        all,
      ),
    ).toBeNull()
    expect(all).toContain(FREEBUFF_GPT_5_6_LUNA_MODEL_ID)
    expect(
      isFreebuffWebDeemphasizedModelId(FREEBUFF_GPT_5_6_LUNA_MODEL_ID),
    ).toBe(false)
  })

  test('never steers a saved pick toward a paused model', () => {
    // The picker offers a one-click switch for whatever a supersedes notice
    // names, and migrateSupersededFreebuffModelPreference moves stored picks
    // there without asking. Either pointing at a paused model would hand users
    // a row the server refuses, so no live row may name one.
    const all = FREEBUFF_MODELS.map((model) => model.id)
    for (const id of all) {
      const superseded = getFreebuffModelSupersededBy(id, all)
      if (!superseded) continue
      expect(isFreebuffPausedFreeModelId(superseded.modelId)).toBe(false)
      expect(all).toContain(superseded.modelId)
    }
  })

  test('marks both new DeepSeek builds as NEW and dates their names', () => {
    // The wire ids are undated and auto-update, so the display has to carry the
    // signal that this is a different model than the one users already judged.
    // Pro left this list when it was paused on 2026-08-18 — it is no longer in
    // FREEBUFF_MODELS at all, and its row keeps its dated name in SUPPORTED for
    // whenever it returns.
    const dated = [[FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID, '07/31']] as const
    // Widened to the interface: the const-asserted tuple's union type only
    // exposes optional fields set on EVERY member, so `isNew` is unreachable
    // through it unless the find() narrows to a single literal id.
    const catalog: readonly FreebuffModelOption[] = FREEBUFF_MODELS
    for (const [id, date] of dated) {
      const model = catalog.find((candidate) => candidate.id === id)!
      expect(model.isNew).toBe(true)
      expect(model.displayName).toContain(date)
    }
    // Nothing else claims to be new, or the badge stops meaning anything.
    expect(catalog.filter((model) => model.isNew)).toHaveLength(dated.length)
  })

  test('steers saved picks off every superseded model', () => {
    const all = FREEBUFF_MODELS.map((model) => model.id)
    // Every model Flash overtook migrates to it...
    expect(
      migrateSupersededFreebuffModelPreference(MINIMAX_M3_MODEL_ID, all),
    ).toBe(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
    // ...and a current pick is left alone (null = keep it).
    for (const current of [
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
      // MiMo 2.5 stopped being superseded on 2026-08-18. This migration
      // REWRITES a stored pick on every load, so while MiMo is the only
      // unlimited row the old pointer moved users who deliberately chose it
      // onto the premium model, silently, at each launch.
      FREEBUFF_MIMO_V25_MODEL_ID,
    ]) {
      expect(migrateSupersededFreebuffModelPreference(current, all)).toBeNull()
    }
    // The unlimited fallback must NEVER be migrated away from: it is where
    // every surface steps a spent user down to.
    expect(
      migrateSupersededFreebuffModelPreference(FALLBACK_FREEBUFF_MODEL_ID, all),
    ).toBeNull()
    expect(migrateSupersededFreebuffModelPreference(undefined, all)).toBeNull()
    // Never migrates onto a model this surface cannot select.
    expect(
      migrateSupersededFreebuffModelPreference(MINIMAX_M3_MODEL_ID, [
        MINIMAX_M3_MODEL_ID,
      ]),
    ).toBeNull()
  })

  test('never de-emphasizes a model we still recommend', () => {
    // Muting + sorting-last is how the Premium group steers to the
    // replacement, so anything muted must be superseded. NOT the converse:
    // MiMo 2.5 is superseded on quality but costs the same as Flash, and
    // de-emphasis is defined as a cost signal — muting it would make the list
    // say something untrue about its price.
    const all = FREEBUFF_MODELS.map((model) => model.id)
    for (const model of FREEBUFF_MODELS) {
      if (isFreebuffWebDeemphasizedModelId(model.id)) {
        expect(getFreebuffModelSupersededBy(model.id, all)).toBeDefined()
      }
    }
    // The recommended default is never muted or superseded.
    expect(isFreebuffWebDeemphasizedModelId(DEFAULT_FREEBUFF_MODEL_ID)).toBe(
      false,
    )
    expect(
      getFreebuffModelSupersededBy(DEFAULT_FREEBUFF_MODEL_ID, all),
    ).toBeUndefined()
  })

  test('never offers a switch to a model the surface cannot select', () => {
    // A picker that lacks the replacement must show no switch at all, rather
    // than a button that resolves to nothing.
    expect(
      getFreebuffModelSupersededBy(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID, [
        FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
      ]),
    ).toBeUndefined()
    expect(getFreebuffModelSupersededBy(undefined, [])).toBeUndefined()
    expect(getFreebuffModelSupersededBy('vendor/unknown', [])).toBeUndefined()
  })

  test('full-access freebuff models can spawn the gemini-thinker subagent', () => {
    // Full-access models (non-limited, non-fastest) get the thinker. Kimi is
    // gone from Freebuff entirely, so it no longer qualifies.
    expect(canFreebuffModelSpawnGeminiThinker(FREEBUFF_KIMI_MODEL_ID)).toBe(
      false,
    )
    expect(
      canFreebuffModelSpawnGeminiThinker(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID),
    ).toBe(true)
    // MiMo 2.5 Pro is gone from Freebuff, so it no longer qualifies either.
    expect(
      canFreebuffModelSpawnGeminiThinker(FREEBUFF_MIMO_V25_PRO_MODEL_ID),
    ).toBe(false)
    expect(canFreebuffModelSpawnGeminiThinker(MINIMAX_M3_MODEL_ID)).toBe(true)
    expect(
      canFreebuffModelSpawnGeminiThinker(FREEBUFF_GPT_5_6_LUNA_MODEL_ID),
    ).toBe(true)

    // Limited-tier models (DeepSeek V4 Flash, MiMo 2.5) skip it.
    expect(
      canFreebuffModelSpawnGeminiThinker(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID),
    ).toBe(false)
    expect(canFreebuffModelSpawnGeminiThinker(FREEBUFF_MIMO_V25_MODEL_ID)).toBe(
      false,
    )
  })

  test('does not support GLM 5.1 for freebuff sessions', () => {
    const glm = 'z-ai/glm-5.1'
    expect(FREEBUFF_MODELS.map((model) => model.id)).not.toContain(glm)
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      glm,
    )
    expect(isFreebuffModelId(glm)).toBe(false)
    expect(isSupportedFreebuffModelId(glm)).toBe(false)
  })

  test('surfaces referral-gated GLM 5.2 only in the Web and Cloud picker', () => {
    expect(FREEBUFF_WEB_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_GLM_V52_MODEL_ID,
    )
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_GLM_V52_MODEL_ID,
    )
    expect(FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_GLM_V52_MODEL_ID,
    )
    expect(isFreebuffWebPremiumModelId(FREEBUFF_GLM_V52_MODEL_ID)).toBe(false)
  })

  test('formats the close time in the user local timezone while deployment is open', () => {
    expect(
      getFreebuffDeploymentAvailabilityLabel(new Date('2026-01-05T18:00:00Z'), {
        locale: 'en-US',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe('until 5:00 PM')
  })

  test('formats the next open time in the user local timezone while deployment is closed', () => {
    expect(
      getFreebuffDeploymentAvailabilityLabel(new Date('2026-01-05T12:00:00Z'), {
        locale: 'en-US',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe('opens 6:00 AM')
  })

  test('includes the weekday when the next opening is on a later local day', () => {
    expect(
      getFreebuffDeploymentAvailabilityLabel(new Date('2026-01-11T03:00:00Z'), {
        locale: 'en-US',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe('opens Sun 6:00 AM')
  })

  test('tracks deployment hours correctly across the open and close boundaries', () => {
    expect(isFreebuffDeploymentHours(new Date('2026-01-05T13:59:00Z'))).toBe(
      false,
    )
    expect(isFreebuffDeploymentHours(new Date('2026-01-05T14:00:00Z'))).toBe(
      true,
    )
    expect(isFreebuffDeploymentHours(new Date('2026-01-06T00:59:00Z'))).toBe(
      true,
    )
    expect(isFreebuffDeploymentHours(new Date('2026-01-06T01:00:00Z'))).toBe(
      false,
    )
    expect(isFreebuffDeploymentHours(new Date('2026-01-10T20:00:00Z'))).toBe(
      true,
    )
  })
})

describe('limited-offer models (Claude Fable 5)', () => {
  test('is deliberately absent from every client picker catalog', () => {
    // The whole mechanism rests on this: no client may render Fable from its
    // own catalog, because only the server knows whether the wave still has
    // sessions. A client that has never been told about the offer must look
    // exactly like it does today.
    expect(FREEBUFF_MODELS.map((m) => m.id)).not.toContain(
      FREEBUFF_FABLE_5_MODEL_ID,
    )
    expect(isFreebuffModelId(FREEBUFF_FABLE_5_MODEL_ID)).toBe(false)
    expect(FREEBUFF_WEB_ALL_MODELS.map((m) => m.id)).not.toContain(
      FREEBUFF_FABLE_5_MODEL_ID,
    )
    expect(
      getFreebuffModelsForAccessTier('full').map((m) => m.id),
    ).not.toContain(FREEBUFF_FABLE_5_MODEL_ID)
  })

  test('is still a model the session and chat layers accept', () => {
    // Same shape as referral GLM: out of the picker catalog, in the supported
    // catalog, so admission, the chat gate and the display-name lookup all
    // resolve it.
    expect(isSupportedFreebuffModelId(FREEBUFF_FABLE_5_MODEL_ID)).toBe(true)
    expect(
      isFreebuffSessionModelAllowedForAccessTier(
        FREEBUFF_FABLE_5_MODEL_ID,
        'full',
      ),
    ).toBe(true)
    expect(getFreebuffModel(FREEBUFF_FABLE_5_MODEL_ID).displayName).toBe(
      'Claude Fable 5',
    )
  })

  test('an explicit pick survives resolution instead of silently downgrading', () => {
    // resolveFreebuffModelForAccessTier runs on every explicit CLI pick. Before
    // the offer models were passed through, pressing Enter on the Fable row
    // would have started a DeepSeek session with no explanation.
    expect(
      resolveFreebuffModelForAccessTier(FREEBUFF_FABLE_5_MODEL_ID, 'full'),
    ).toBe(FREEBUFF_FABLE_5_MODEL_ID)
  })

  test('limited-region users cannot reach it', () => {
    expect(
      isFreebuffSessionModelAllowedForAccessTier(
        FREEBUFF_FABLE_5_MODEL_ID,
        'limited',
      ),
    ).toBe(false)
    expect(
      resolveFreebuffSessionModelForAccessTier(
        FREEBUFF_FABLE_5_MODEL_ID,
        'limited',
      ),
    ).toBe(LIMITED_FREEBUFF_MODEL_ID)
  })

  test('traces are collected, which is the point of running the wave at all', () => {
    expect(isFreebuffTracedModelId(FREEBUFF_FABLE_5_MODEL_ID)).toBe(true)
    const fable = SUPPORTED_FREEBUFF_MODELS.find(
      (m) => m.id === FREEBUFF_FABLE_5_MODEL_ID,
    )
    expect((fable as { warning?: string } | undefined)?.warning).toBe(
      'May use data for AI training',
    )
  })

  test('is metered by its own pool, never the shared daily premium one', () => {
    // It is marked `premium: true` for styling and to keep it out of the free
    // Standard pool, but joining FREEBUFF_PREMIUM_MODEL_IDS would put trial
    // sessions on the quota M3 and DeepSeek Pro share.
    expect(isFreebuffPremiumModelId(FREEBUFF_FABLE_5_MODEL_ID)).toBe(false)
    expect(isFreebuffWebPremiumModelId(FREEBUFF_FABLE_5_MODEL_ID)).toBe(false)
    expect(FREEBUFF_STANDARD_MODEL_IDS).not.toContain(FREEBUFF_FABLE_5_MODEL_ID)
    expect(isFreebuffLimitedOfferModelId(FREEBUFF_FABLE_5_MODEL_ID)).toBe(true)
  })

  test('the offer predicate tolerates dated provider snapshots', () => {
    expect(
      isFreebuffLimitedOfferModelId(`${FREEBUFF_FABLE_5_MODEL_ID}-20260815`),
    ).toBe(true)
    expect(
      isFreebuffLimitedOfferModelId(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID),
    ).toBe(false)
    expect(isFreebuffLimitedOfferModelId(null)).toBe(false)
  })
})

describe('Meta Muse Spark 1.2 Contributor', () => {
  test('is a Freebuff Web model and reachable from no other surface', () => {
    // Web-only is enforced by ABSENCE from the CLI/Desktop catalogs, which is
    // also what makes the session layer refuse it there
    // (isFreebuffSessionModelId reads SUPPORTED_FREEBUFF_MODELS). The reason is
    // the queue, not the price: the browser can render a rate-limit wait with
    // an ETA and the CLI cannot, so on the CLI a 60-RPM team-wide ceiling would
    // just be unexplained 429s.
    expect(FREEBUFF_WEB_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID,
    )
    expect(FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID,
    )
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID,
    )
    // Absence from SUPPORTED_ is the Desktop gate, not just tidiness:
    // isModelForHarness('codebuff', …) validates against exactly this set, so a
    // Desktop client asking for Muse Spark is refused before session admission
    // ever sees it.
    expect(
      isSupportedFreebuffModelId(FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID),
    ).toBe(false)
    // Session admission DOES accept it — it must, or no Web session could run
    // on it. The shared gate is the union of the CLI and Web catalogs, so
    // "Web-only" is enforced by the catalogs above plus the free-mode agent
    // allowlist (only base2-free-muse-spark may run this model, and only the
    // Web bundle ships that root), never by this predicate.
    expect(
      isFreebuffSessionModelId(FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID),
    ).toBe(true)

    // Visible to every full-access Web user, not god-gated and not retired.
    expect(
      isFreebuffWebModelId(FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID),
    ).toBe(true)
    expect(
      isFreebuffWebGodOnlyModelId(FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID),
    ).toBe(false)
    expect(
      isFreebuffWebSelectableModelId(
        FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID,
      ),
    ).toBe(true)
  })

  test('is metered by the Web premium pool and no other', () => {
    // Premium here bounds how many users are inside the 60 RPM ceiling at once
    // — it is NOT a price signal, since Contributor is cheaper per token than
    // the standard-pool models. Being in some pool is mandatory:
    // FREEBUFF_STANDARD_MODEL_IDS is derived by filtering `!premium`, so a
    // premium model missing from the premium list is metered by nothing.
    expect(
      isFreebuffWebPremiumModelId(FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID),
    ).toBe(true)
    expect(FREEBUFF_STANDARD_MODEL_IDS).not.toContain(
      FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID,
    )
    expect(
      isFreebuffGlmV52ModelId(FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID),
    ).toBe(false)
    // The CLI's own premium pool must not learn about a model the CLI cannot
    // select.
    expect(
      isFreebuffPremiumModelId(FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID),
    ).toBe(false)
  })

  test('carries a reasoning effort that the server can actually resolve', () => {
    // Two halves, and the second is the one that used to silently fail.
    // getFreebuffModelReasoningEffort read SUPPORTED_FREEBUFF_MODELS alone —
    // the CLI/Desktop catalog — which Muse Spark is deliberately absent from
    // (that absence IS the Desktop gate). So the field could be set on the row
    // and resolve to null anyway, with nothing to indicate why.
    const model = getFreebuffWebModel(
      FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID,
    )
    expect(model.reasoningEffort).toBe(FREEBUFF_MUSE_SPARK_REASONING_EFFORT)
    expect(
      getFreebuffModelReasoningEffort(
        FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID,
      ),
    ).toBe(FREEBUFF_MUSE_SPARK_REASONING_EFFORT)

    // Never 'none': Muse Spark answers that with a hard 400 (verified live),
    // and a 400 is neither retried nor queued, so it kills the turn outright.
    expect(FREEBUFF_MUSE_SPARK_REASONING_EFFORT).not.toBe('none')
    // Meta's ladder, from its own 400 on an unknown value. `xhigh` and
    // `minimal` exist here and nowhere else in this repo, which is why the
    // shared agent-definition enum deliberately does not carry them.
    expect(['minimal', 'low', 'medium', 'high', 'xhigh']).toContain(
      FREEBUFF_MUSE_SPARK_REASONING_EFFORT,
    )

    // Suffix-tolerant like every other id helper, so a dated provider snapshot
    // does not silently drop back to Meta's default effort.
    expect(
      getFreebuffModelReasoningEffort(
        `${FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID}-20260901`,
      ),
    ).toBe(FREEBUFF_MUSE_SPARK_REASONING_EFFORT)

    // Widening the lookup to the Web catalog must not invent an effort for
    // models that declare none.
    expect(
      getFreebuffModelReasoningEffort(FREEBUFF_KIMI_K3_ECO_MODEL_ID),
    ).toBeNull()
  })

  test('discloses the Contributor tier training terms', () => {
    // The discount IS the training grant, so the warning is the disclosure that
    // makes the row legitimate rather than decoration.
    const model = getFreebuffWebModel(
      FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID,
    )
    expect(model.displayName).toBe('Muse Spark 1.2')
    expect(model.dataUse).toBe('training')
    expect(model.warning).toBe('May use data for AI training')
  })

  test('has exactly one wire id, and the predicate tolerates dated snapshots', () => {
    // The queue, the premium pool and the free-mode agent allowlist all key off
    // this id. A second id reaching the same upstream is how `crof/glm-5.2`
    // handed out a metered model for free; do not add one.
    expect(FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID).toBe(
      'meta/muse-spark-1.2-contributor',
    )
    // Meta's own id is what the provider receives, never a wire id a caller
    // may send. Widened to string[] on purpose: the union type already proves
    // this at compile time, and the runtime check is what survives someone
    // later adding the bare id to a catalog.
    expect(
      FREEBUFF_WEB_ALL_MODELS.map((model): string => model.id),
    ).not.toContain(MUSE_SPARK_12_CONTRIBUTOR_UPSTREAM_MODEL_ID)

    expect(
      isMuseSparkModelId(FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID),
    ).toBe(true)
    // A dated provider snapshot must not slip past the rate-limit queue.
    expect(
      isMuseSparkModelId(
        `${FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID}-20260901`,
      ),
    ).toBe(true)
    expect(isMuseSparkModelId('meta/muse-spark-1.2')).toBe(false)
    expect(isMuseSparkModelId(null)).toBe(false)
  })
})

describe('Muse Spark rate-limit fallback', () => {
  test('reroutes only to a model the caller is already entitled to', () => {
    // THE invariant. A fallback outside the shared daily premium pool would
    // turn "Muse Spark is busy" into a way to reach a model the user had not
    // earned — the same shape as the retired crof/glm-5.2 route, which handed
    // out a referral-earned model for nothing. The fallback sits in the same
    // pool, so a rerouted request spends exactly the entitlement the original
    // would.
    expect(isFreebuffWebPremiumModelId(MUSE_SPARK_FALLBACK_MODEL_ID)).toBe(true)
    expect(
      isFreebuffWebPremiumModelId(FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID),
    ).toBe(true)
    // Never the earned-GLM pool, and never the free standard pool.
    expect(isFreebuffGlmV52ModelId(MUSE_SPARK_FALLBACK_MODEL_ID)).toBe(false)
    expect(FREEBUFF_STANDARD_MODEL_IDS).not.toContain(
      MUSE_SPARK_FALLBACK_MODEL_ID,
    )
    // And it must be a real, selectable Web model rather than a dangling id.
    expect(isFreebuffWebModelId(MUSE_SPARK_FALLBACK_MODEL_ID)).toBe(true)
    expect(MUSE_SPARK_FALLBACK_MODEL_ID).not.toBe(
      FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID,
    )
  })

  test('the picker promises exactly what the server does', () => {
    // The tooltip is a promise about behavior; drift between the two is how a
    // UI starts lying. Both read the same constant, and the threshold the copy
    // implies ("too long") is the one the server actually applies.
    const model = getFreebuffWebModel(
      FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID,
    )
    expect(model.tagline).toBe('Queue')
    expect(model.taglineTooltip).toBe(MUSE_SPARK_FALLBACK_NOTICE)
    // The copy must NAME the model the server actually reroutes to — pinning it
    // to the catalog rather than to a literal is what catches a fallback that
    // moves (as it did on 2026-08-12, Luna → V4 Pro) while its tooltip does not.
    // Matched undated: this tooltip promises a behavior rather than pointing at
    // a picker row, so it does not carry a build date the way the supersedes
    // notices do.
    expect(MUSE_SPARK_FALLBACK_NOTICE).toContain(
      getFreebuffWebModel(MUSE_SPARK_FALLBACK_MODEL_ID).displayName.replace(
        /\s+\d{2}\/\d{2}$/,
        '',
      ),
    )
    // The row no longer advertises itself as new.
    expect(model.isNew).toBeUndefined()
    // A wait worth explaining, not one worth hiding — and the same number the
    // provider uses for its silent window, so the two cannot disagree about
    // what "too long" means.
    expect(MUSE_SPARK_FALLBACK_AFTER_MS).toBe(10_000)
  })
})
