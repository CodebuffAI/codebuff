import { describe, expect, test } from 'bun:test'

import {
  canFreebuffModelSpawnGeminiThinker,
  DEFAULT_FREEBUFF_MODEL_ID,
  DEFAULT_FREEBUFF_WEB_MODEL_ID,
  FALLBACK_FREEBUFF_MODEL_ID,
  FREEBUFF_WEB_DEEMPHASIZED_MODEL_IDS,
  FREEBUFF_CROF_GLM_V52_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_DESKTOP_SESSION_LIMITS,
  FREEBUFF_ENABLE_MIMO_MODELS_IN_UI,
  FREEBUFF_GLM_V52_MODEL_ID,
  FREEBUFF_GPT_5_6_LUNA_MAX_PRICE,
  FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  FREEBUFF_GPT_5_6_LUNA_PROVIDER_ROUTE,
  FREEBUFF_GPT_5_6_LUNA_REASONING_EFFORT,
  FREEBUFF_HY3_ATLAS_MODEL_ID,
  FREEBUFF_HY3_MODEL_ID,
  FREEBUFF_HY3_OPENROUTER_FREE_MODEL_ID,
  FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
  FREEBUFF_LING_3_FLASH_MODEL_ID,
  LIMITED_FREEBUFF_MODEL_ID,
  LIMITED_FREEBUFF_MODEL_IDS,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
  FREEBUFF_MODELS,
  FREEBUFF_POOLSIDE_LAGUNA_S_21_MODEL_ID,
  FREEBUFF_POOLSIDE_LAGUNA_S_21_OPENROUTER_MODEL_ID,
  FREEBUFF_WEB_GOD_ONLY_MODELS,
  FREEBUFF_WEB_ALL_MODELS,
  FREEBUFF_WEB_MODELS,
  FREEBUFF_WEB_RETIRED_PICKER_MODEL_IDS,
  FREEBUFF_WEB_STANDARD_MODEL_IDS,
  SUPPORTED_FREEBUFF_MODELS,
  getFreebuffDeploymentAvailabilityLabel,
  getFreebuffDesktopSessionBucket,
  getFreebuffModelImageSupport,
  getFreebuffWebModel,
  getFreebuffModelsForAccessTier,
  getRecommendedFreebuffModelId,
  getRecommendedFreebuffWebModelId,
  isFreebuffWebDeemphasizedModelId,
  isFreebuffCrofGlmV52ModelId,
  isFreebuffDeploymentHours,
  isFreebuffGlmV52ModelId,
  isFreebuffGpt56LunaModelId,
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
  resolveFreebuffWebModel,
  resolveFreebuffWebModelForLimitedTier,
  resolveFreebuffModelForAccessTier,
  resolveFreebuffSessionModelForAccessTier,
} from '../constants/freebuff-models'
import type { FreebuffModelOption } from '../constants/freebuff-models'
import { minimaxModels } from '../constants/model-config'

const MINIMAX_M3_MODEL_ID = minimaxModels.minimaxM3

describe('freebuff model availability', () => {
  test('defaults to DeepSeek V4 Pro, falls back to DeepSeek V4 Flash for new clients', () => {
    expect(DEFAULT_FREEBUFF_MODEL_ID).toBe(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID)
    expect(FALLBACK_FREEBUFF_MODEL_ID).toBe(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
  })

  test('desktop concurrency splits full access into 1 premium and 3 unlimited sessions', () => {
    expect(
      getFreebuffDesktopSessionBucket(
        FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
        'full',
      ),
    ).toBe('premium')
    expect(
      getFreebuffDesktopSessionBucket(
        FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
        'full',
      ),
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

  test('DeepSeek Pro carries the AI-training warning before selection', () => {
    const deepseek = FREEBUFF_MODELS.find(
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

  test('only the DeepSeek family is trace-stored in free mode; M3 has no warning', () => {
    const m3 = FREEBUFF_MODELS.find((m) => m.id === MINIMAX_M3_MODEL_ID)
    expect((m3 as { warning?: string } | undefined)?.warning).toBeUndefined()
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

  test('DeepSeek V4 Flash is selectable and non-premium', () => {
    expect(FREEBUFF_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect(isFreebuffModelId(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)).toBe(true)
    expect(isFreebuffPremiumModelId(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)).toBe(
      false,
    )
  })

  test('MiMo models remain supported and follow the UI rollout flag', () => {
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_MIMO_V25_PRO_MODEL_ID,
    )
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_MIMO_V25_MODEL_ID,
    )

    if (FREEBUFF_ENABLE_MIMO_MODELS_IN_UI) {
      expect(FREEBUFF_MODELS.map((model) => model.id)).toContain(
        FREEBUFF_MIMO_V25_PRO_MODEL_ID,
      )
      expect(FREEBUFF_MODELS.map((model) => model.id)).toContain(
        FREEBUFF_MIMO_V25_MODEL_ID,
      )
    } else {
      expect(FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
        FREEBUFF_MIMO_V25_PRO_MODEL_ID,
      )
      expect(FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
        FREEBUFF_MIMO_V25_MODEL_ID,
      )
    }

    expect(isFreebuffPremiumModelId(FREEBUFF_MIMO_V25_PRO_MODEL_ID)).toBe(true)
    expect(isFreebuffPremiumModelId(FREEBUFF_MIMO_V25_MODEL_ID)).toBe(false)
    expect(getFreebuffModelImageSupport(FREEBUFF_MIMO_V25_MODEL_ID)).toBe(true)
    expect(getFreebuffModelImageSupport(FREEBUFF_MIMO_V25_PRO_MODEL_ID)).toBe(
      false,
    )
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

  test('Kimi K2.7 Code is retired from clients but remains server-supported during rollout', () => {
    expect(FREEBUFF_KIMI_MODEL_ID).toBe('moonshotai/kimi-k2.7-code')
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_KIMI_MODEL_ID,
    )
    expect(FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_KIMI_MODEL_ID,
    )
    expect(
      getFreebuffModelsForAccessTier('full').map((m) => m.id),
    ).not.toContain(FREEBUFF_KIMI_MODEL_ID)
    expect(isFreebuffModelId(FREEBUFF_KIMI_MODEL_ID)).toBe(false)
    expect(isSupportedFreebuffModelId(FREEBUFF_KIMI_MODEL_ID)).toBe(true)
    expect(getFreebuffModelImageSupport(FREEBUFF_KIMI_MODEL_ID)).toBe(true)
    expect(isFreebuffSessionModelAvailable(FREEBUFF_KIMI_MODEL_ID)).toBe(true)
    expect(getFreebuffWebModel(FREEBUFF_KIMI_MODEL_ID).id).toBe(
      FALLBACK_FREEBUFF_MODEL_ID,
    )
    expect(isFreebuffPremiumModelId(FREEBUFF_KIMI_MODEL_ID)).toBe(true)
    expect(
      isFreebuffModelAllowedForAccessTier(FREEBUFF_KIMI_MODEL_ID, 'full'),
    ).toBe(false)
    expect(
      resolveFreebuffModelForAccessTier(FREEBUFF_KIMI_MODEL_ID, 'full'),
    ).toBe(FALLBACK_FREEBUFF_MODEL_ID)
    expect(
      isFreebuffSessionModelAllowedForAccessTier(
        FREEBUFF_KIMI_MODEL_ID,
        'full',
      ),
    ).toBe(true)
    expect(
      resolveFreebuffSessionModelForAccessTier(FREEBUFF_KIMI_MODEL_ID, 'full', {
        includeGodOnly: false,
      }),
    ).toBe(FREEBUFF_KIMI_MODEL_ID)
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

  test('HY3 OpenRouter trial is available only as a Freebuff Web premium model for now', () => {
    expect(FREEBUFF_HY3_MODEL_ID).toBe(FREEBUFF_HY3_OPENROUTER_FREE_MODEL_ID)
    // The old Atlas id remains a wire-compatible alias for saved selections.
    expect(FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID).toBe(
      FREEBUFF_HY3_ATLAS_MODEL_ID,
    )
    expect(FREEBUFF_WEB_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_HY3_MODEL_ID,
    )
    expect(FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_HY3_MODEL_ID,
    )
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_HY3_MODEL_ID,
    )

    expect(isFreebuffWebModelId(FREEBUFF_HY3_MODEL_ID)).toBe(true)
    expect(isFreebuffWebPremiumModelId(FREEBUFF_HY3_MODEL_ID)).toBe(true)
    expect(isFreebuffPremiumModelId(FREEBUFF_HY3_MODEL_ID)).toBe(false)
    expect(isFreebuffModelId(FREEBUFF_HY3_MODEL_ID)).toBe(false)
    expect(isSupportedFreebuffModelId(FREEBUFF_HY3_MODEL_ID)).toBe(false)
    expect(resolveFreebuffWebModel(FREEBUFF_HY3_MODEL_ID)).toBe(
      FREEBUFF_HY3_MODEL_ID,
    )
    expect(getFreebuffWebModel(FREEBUFF_HY3_MODEL_ID).displayName).toBe('HY3')
    expect(getFreebuffWebModel(FREEBUFF_HY3_MODEL_ID).tagline).toBe(
      'Trialing its performance',
    )
  })

  test('HY3 paid OpenRouter is a god-only Freebuff Web premium model', () => {
    expect(FREEBUFF_WEB_GOD_ONLY_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID,
    )
    expect(FREEBUFF_WEB_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID,
    )
    expect(isFreebuffWebModelId(FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID)).toBe(
      false,
    )
    expect(
      isFreebuffWebModelId(FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID, {
        includeGodOnly: true,
      }),
    ).toBe(true)
    expect(
      isFreebuffWebGodOnlyModelId(FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID),
    ).toBe(true)
    expect(
      isFreebuffWebPremiumModelId(FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID),
    ).toBe(true)
    expect(resolveFreebuffWebModel(FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID)).toBe(
      FALLBACK_FREEBUFF_MODEL_ID,
    )
    expect(
      resolveFreebuffWebModel(FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID, {
        includeGodOnly: true,
      }),
    ).toBe(FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID)
    expect(
      resolveFreebuffSessionModelForAccessTier(
        FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID,
        'full',
        { includeGodOnly: false },
      ),
    ).toBe(FALLBACK_FREEBUFF_MODEL_ID)
    expect(
      getFreebuffWebModel(FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID).displayName,
    ).toBe('HY3 (OpenRouter)')
    expect(
      getFreebuffWebModel(FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID).tagline,
    ).toBe('Paid via OpenRouter')
  })

  test('GLM 5.2 is referral-only: the premium CrofAI route is unselectable', () => {
    // The whole point of retiring it (2026-07-30): no Web/Cloud user can pick
    // GLM 5.2 as a premium model, so the referral route is the only way in.
    expect(isFreebuffWebSelectableModelId(FREEBUFF_CROF_GLM_V52_MODEL_ID)).toBe(
      false,
    )
    expect(FREEBUFF_WEB_RETIRED_PICKER_MODEL_IDS).toContain(
      FREEBUFF_CROF_GLM_V52_MODEL_ID,
    )
    // ...while the REFERRAL route stays selectable — retiring one GLM route
    // must never take the earned one down with it.
    expect(isFreebuffWebSelectableModelId(FREEBUFF_GLM_V52_MODEL_ID)).toBe(true)
    // Every other web model is unaffected.
    expect(isFreebuffWebSelectableModelId(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID))
      .toBe(true)
  })

  test('the retired CrofAI GLM 5.2 route still admits and meters live sessions', () => {
    // Retirement is picker-only. Dropping the id from the catalog would fail
    // admission mid-session; dropping it from the premium pool would leave
    // those sessions metered by no pool at all (= unlimited paid GLM).
    expect(FREEBUFF_WEB_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_CROF_GLM_V52_MODEL_ID,
    )
    expect(FREEBUFF_WEB_GOD_ONLY_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_CROF_GLM_V52_MODEL_ID,
    )
    expect(isFreebuffWebModelId(FREEBUFF_CROF_GLM_V52_MODEL_ID)).toBe(true)
    expect(isFreebuffWebGodOnlyModelId(FREEBUFF_CROF_GLM_V52_MODEL_ID)).toBe(
      false,
    )
    // A live session's model must resolve to itself, not silently downgrade.
    expect(resolveFreebuffWebModel(FREEBUFF_CROF_GLM_V52_MODEL_ID)).toBe(
      FREEBUFF_CROF_GLM_V52_MODEL_ID,
    )
    expect(
      getFreebuffWebModel(FREEBUFF_CROF_GLM_V52_MODEL_ID).displayName,
    ).toBe('GLM 5.2')
    expect(getFreebuffWebModel(FREEBUFF_CROF_GLM_V52_MODEL_ID).premium).toBe(
      true,
    )
    expect(isFreebuffWebPremiumModelId(FREEBUFF_CROF_GLM_V52_MODEL_ID)).toBe(
      true,
    )
    expect(isFreebuffCrofGlmV52ModelId(FREEBUFF_CROF_GLM_V52_MODEL_ID)).toBe(
      true,
    )
    // Only the REFERRAL GLM route keeps a pool of its own, and neither GLM
    // route may fall into the free standard browser pool.
    expect(isFreebuffGlmV52ModelId(FREEBUFF_CROF_GLM_V52_MODEL_ID)).toBe(false)
    expect(FREEBUFF_WEB_STANDARD_MODEL_IDS).not.toContain(
      FREEBUFF_CROF_GLM_V52_MODEL_ID,
    )
  })

  test('neither GLM 5.2 route is ever remembered as the default model', () => {
    // GLM runs out long before the rest of the picker, so remembering it would
    // strand a new thread / app / page load on a model that fails admission.
    for (const glmId of [
      FREEBUFF_GLM_V52_MODEL_ID,
      FREEBUFF_CROF_GLM_V52_MODEL_ID,
    ]) {
      expect(isFreebuffWebRememberableModelId(glmId)).toBe(false)
      expect(resolveRememberedFreebuffWebModel(glmId)).toBe(
        DEFAULT_FREEBUFF_WEB_MODEL_ID,
      )
    }
    // Retired picker models self-heal to the always-available fallback, while
    // god-only models remain rememberable when the caller opts in.
    expect(
      resolveRememberedFreebuffWebModel(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID),
    ).toBe(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID)
    expect(resolveRememberedFreebuffWebModel(FREEBUFF_KIMI_MODEL_ID)).toBe(
      FALLBACK_FREEBUFF_MODEL_ID,
    )
    expect(
      resolveRememberedFreebuffWebModel(FREEBUFF_LING_3_FLASH_MODEL_ID, {
        includeGodOnly: true,
      }),
    ).toBe(FREEBUFF_LING_3_FLASH_MODEL_ID)
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

  test('CrofAI GLM 5.2 is unavailable to limited-region users', () => {
    expect(
      isFreebuffWebModelAllowedForLimitedTier(FREEBUFF_CROF_GLM_V52_MODEL_ID),
    ).toBe(false)
    expect(isFreebuffWebGeoExemptModelId(FREEBUFF_CROF_GLM_V52_MODEL_ID)).toBe(
      false,
    )
    expect(
      resolveFreebuffWebModelForLimitedTier(FREEBUFF_CROF_GLM_V52_MODEL_ID),
    ).toBe(LIMITED_FREEBUFF_MODEL_ID)
    expect(
      isFreebuffSessionModelAllowedForAccessTier(
        FREEBUFF_CROF_GLM_V52_MODEL_ID,
        'limited',
      ),
    ).toBe(false)
    expect(
      isFreebuffSessionModelAllowedForAccessTier(
        FREEBUFF_CROF_GLM_V52_MODEL_ID,
        'full',
      ),
    ).toBe(true)
  })

  test('Poolside Laguna S 2.1 routes are god-only Freebuff Web test models', () => {
    expect(FREEBUFF_WEB_GOD_ONLY_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_POOLSIDE_LAGUNA_S_21_MODEL_ID,
    )
    expect(FREEBUFF_WEB_GOD_ONLY_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_POOLSIDE_LAGUNA_S_21_OPENROUTER_MODEL_ID,
    )
    expect(FREEBUFF_WEB_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_POOLSIDE_LAGUNA_S_21_MODEL_ID,
    )
    expect(FREEBUFF_WEB_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_POOLSIDE_LAGUNA_S_21_OPENROUTER_MODEL_ID,
    )
    expect(isFreebuffWebModelId(FREEBUFF_POOLSIDE_LAGUNA_S_21_MODEL_ID)).toBe(
      false,
    )
    expect(
      isFreebuffWebModelId(FREEBUFF_POOLSIDE_LAGUNA_S_21_OPENROUTER_MODEL_ID),
    ).toBe(false)
    expect(
      isFreebuffWebModelId(FREEBUFF_POOLSIDE_LAGUNA_S_21_MODEL_ID, {
        includeGodOnly: true,
      }),
    ).toBe(true)
    expect(
      isFreebuffWebModelId(FREEBUFF_POOLSIDE_LAGUNA_S_21_OPENROUTER_MODEL_ID, {
        includeGodOnly: true,
      }),
    ).toBe(true)
    expect(
      isFreebuffWebGodOnlyModelId(FREEBUFF_POOLSIDE_LAGUNA_S_21_MODEL_ID),
    ).toBe(true)
    expect(
      isFreebuffWebGodOnlyModelId(
        FREEBUFF_POOLSIDE_LAGUNA_S_21_OPENROUTER_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreebuffWebPremiumModelId(FREEBUFF_POOLSIDE_LAGUNA_S_21_MODEL_ID),
    ).toBe(true)
    expect(
      isFreebuffWebPremiumModelId(
        FREEBUFF_POOLSIDE_LAGUNA_S_21_OPENROUTER_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      getFreebuffWebModel(FREEBUFF_POOLSIDE_LAGUNA_S_21_MODEL_ID).displayName,
    ).toBe('Laguna S 2.1 (Poolside)')
    expect(
      getFreebuffWebModel(FREEBUFF_POOLSIDE_LAGUNA_S_21_OPENROUTER_MODEL_ID)
        .displayName,
    ).toBe('Laguna S 2.1 (OpenRouter)')
  })

  test('Ling 3.0 Flash is a god-only Freebuff Web/Cloud test model', () => {
    // The wire id must stay OpenRouter's own slug: getChatCompletionsProvider
    // has no Ling-specific branch, so it only reaches OpenRouter by falling
    // through to the default route with the slug intact.
    expect(FREEBUFF_LING_3_FLASH_MODEL_ID).toBe(
      'inclusionai/ling-3.0-flash:free',
    )

    expect(FREEBUFF_WEB_GOD_ONLY_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_LING_3_FLASH_MODEL_ID,
    )
    expect(FREEBUFF_WEB_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_LING_3_FLASH_MODEL_ID,
    )
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_LING_3_FLASH_MODEL_ID,
    )

    expect(isFreebuffWebModelId(FREEBUFF_LING_3_FLASH_MODEL_ID)).toBe(false)
    expect(
      isFreebuffWebModelId(FREEBUFF_LING_3_FLASH_MODEL_ID, {
        includeGodOnly: true,
      }),
    ).toBe(true)
    expect(isFreebuffWebGodOnlyModelId(FREEBUFF_LING_3_FLASH_MODEL_ID)).toBe(
      true,
    )
    expect(isFreebuffWebPremiumModelId(FREEBUFF_LING_3_FLASH_MODEL_ID)).toBe(
      true,
    )
    // Never reachable from the CLI/Desktop picker or a limited-tier browser.
    expect(isFreebuffPremiumModelId(FREEBUFF_LING_3_FLASH_MODEL_ID)).toBe(false)
    expect(isFreebuffModelId(FREEBUFF_LING_3_FLASH_MODEL_ID)).toBe(false)
    expect(
      isFreebuffWebModelAllowedForLimitedTier(FREEBUFF_LING_3_FLASH_MODEL_ID),
    ).toBe(false)

    expect(resolveFreebuffWebModel(FREEBUFF_LING_3_FLASH_MODEL_ID)).toBe(
      FALLBACK_FREEBUFF_MODEL_ID,
    )
    expect(
      resolveFreebuffWebModel(FREEBUFF_LING_3_FLASH_MODEL_ID, {
        includeGodOnly: true,
      }),
    ).toBe(FREEBUFF_LING_3_FLASH_MODEL_ID)

    const model = getFreebuffWebModel(FREEBUFF_LING_3_FLASH_MODEL_ID)
    expect(model.displayName).toBe('Ling 3.0 Flash')
    expect(model.tagline).toBe('Free via OpenRouter')
    expect(model.experimental).toBe(true)
    expect(model.multimodal).toBe(false)
    expect(getFreebuffModelImageSupport(FREEBUFF_LING_3_FLASH_MODEL_ID)).toBe(
      false,
    )
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

  test('MiniMax M3 is a selectable premium model on the standard daily pool', () => {
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).toContain(
      MINIMAX_M3_MODEL_ID,
    )
    expect(FREEBUFF_MODELS.map((model) => model.id)).toContain(
      MINIMAX_M3_MODEL_ID,
    )
    expect(getFreebuffModelsForAccessTier('full').map((m) => m.id)).toContain(
      MINIMAX_M3_MODEL_ID,
    )
    expect(isFreebuffModelId(MINIMAX_M3_MODEL_ID)).toBe(true)
    expect(isSupportedFreebuffModelId(MINIMAX_M3_MODEL_ID)).toBe(true)
    expect(isFreebuffPremiumModelId(MINIMAX_M3_MODEL_ID)).toBe(true)
    expect(isFreebuffWebPremiumModelId(MINIMAX_M3_MODEL_ID)).toBe(true)
    expect(
      isFreebuffModelAllowedForAccessTier(MINIMAX_M3_MODEL_ID, 'full'),
    ).toBe(true)
    // DeepSeek V4 Pro is the recommended default, so it leads the picker list
    // and M3 sits directly behind it.
    expect(FREEBUFF_MODELS[0]!.id).toBe(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID)
    expect(FREEBUFF_MODELS[1]!.id).toBe(MINIMAX_M3_MODEL_ID)
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
    expect(FREEBUFF_WEB_STANDARD_MODEL_IDS).not.toContain(
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
    // enforces on every Luna request; the price ceiling is OpenAI's list price
    // ($0.10/$0.60 per M), well under Azure/Bedrock's $1.00/$6.00.
    expect(FREEBUFF_GPT_5_6_LUNA_PROVIDER_ROUTE).toBe('openai')
    expect(FREEBUFF_GPT_5_6_LUNA_MAX_PRICE).toEqual({
      prompt: 0.1,
      completion: 0.6,
    })
    expect(FREEBUFF_GPT_5_6_LUNA_REASONING_EFFORT).toBe('high')
  })

  test('limited access exposes DeepSeek V4 Flash and non-Pro MiMo 2.5', () => {
    expect(LIMITED_FREEBUFF_MODEL_ID).toBe(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
    expect(LIMITED_FREEBUFF_MODEL_IDS).toEqual([
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
      FREEBUFF_MIMO_V25_MODEL_ID,
    ])
    expect(getFreebuffModelsForAccessTier('limited').map((m) => m.id)).toEqual([
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
      FREEBUFF_MIMO_V25_MODEL_ID,
    ])
    expect(
      isFreebuffModelAllowedForAccessTier(
        FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
        'limited',
      ),
    ).toBe(true)
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
    ).toBe(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
  })

  test('recommends a joinable, in-tier model for the picker hero', () => {
    // Full access → DeepSeek V4 Pro (the smartest default, drawn from the
    // shared premium pool) while the pool has sessions left.
    expect(getRecommendedFreebuffModelId('full')).toBe(
      FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    )
    expect(getRecommendedFreebuffModelId(undefined)).toBe(
      FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    )
    // Once the premium pool is exhausted the hero flips to the unlimited
    // DeepSeek V4 Flash so the one-Enter start is always joinable.
    expect(
      getRecommendedFreebuffModelId('full', { premiumExhausted: true }),
    ).toBe(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
    expect(
      isFreebuffPremiumModelId(
        getRecommendedFreebuffModelId('full', { premiumExhausted: true }),
      ),
    ).toBe(false)
    // Limited access → DeepSeek V4 Flash, which is in the limited model set.
    expect(getRecommendedFreebuffModelId('limited')).toBe(
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect(
      getFreebuffModelsForAccessTier('limited').some(
        (m) => m.id === getRecommendedFreebuffModelId('limited'),
      ),
    ).toBe(true)
  })

  test('web/cloud recommend the cheaper DeepSeek V4 Pro, like CLI/Desktop', () => {
    expect(DEFAULT_FREEBUFF_WEB_MODEL_ID).toBe(
      FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    )
    expect(getRecommendedFreebuffWebModelId('full')).toBe(
      FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    )
    expect(getRecommendedFreebuffWebModelId(undefined)).toBe(
      FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    )
    // The two defaults stay separate constants, but CLI/Desktop has since
    // moved to the same model, so they resolve alike.
    expect(DEFAULT_FREEBUFF_MODEL_ID).toBe(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID)
    // Limited tier and an exhausted premium pool still resolve to a joinable
    // model, exactly like the CLI helper.
    expect(getRecommendedFreebuffWebModelId('limited')).toBe(
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect(
      getRecommendedFreebuffWebModelId('full', { premiumExhausted: true }),
    ).toBe(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
    // The web default must be a real, selectable web model.
    expect(isFreebuffWebModelId(DEFAULT_FREEBUFF_WEB_MODEL_ID)).toBe(true)
  })

  test('de-emphasizes the remaining costly premium model, and never the default', () => {
    expect(isFreebuffWebDeemphasizedModelId(MINIMAX_M3_MODEL_ID)).toBe(true)
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
    // De-emphasis is presentation only: both models stay fully selectable.
    for (const id of FREEBUFF_WEB_DEEMPHASIZED_MODEL_IDS) {
      expect(isFreebuffWebModelId(id)).toBe(true)
      expect(isFreebuffModelAllowedForAccessTier(id, 'full')).toBe(true)
    }
  })

  test('full-access freebuff models can spawn the gemini-thinker subagent', () => {
    // Full-access models (non-limited, non-fastest) get the thinker.
    expect(canFreebuffModelSpawnGeminiThinker(FREEBUFF_KIMI_MODEL_ID)).toBe(
      true,
    )
    expect(
      canFreebuffModelSpawnGeminiThinker(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID),
    ).toBe(true)
    expect(
      canFreebuffModelSpawnGeminiThinker(FREEBUFF_MIMO_V25_PRO_MODEL_ID),
    ).toBe(true)
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
