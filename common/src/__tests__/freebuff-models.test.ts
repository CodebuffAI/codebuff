import { describe, expect, test } from 'bun:test'

import {
  canFreebuffModelSpawnGeminiThinker,
  DEFAULT_FREEBUFF_MODEL_ID,
  FALLBACK_FREEBUFF_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DATA_COLLECTION_WARNING,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_ENABLE_MIMO_MODELS_IN_UI,
  FREEBUFF_KIMI_MODEL_ID,
  LIMITED_FREEBUFF_MODEL_ID,
  LIMITED_FREEBUFF_MODEL_IDS,
  FREEBUFF_MINIMAX_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
  FREEBUFF_MODELS,
  SUPPORTED_FREEBUFF_MODELS,
  getFreebuffDeploymentAvailabilityLabel,
  getFreebuffModelsForAccessTier,
  getRecommendedFreebuffModelId,
  isFreebuffDeploymentHours,
  isFreebuffTracedModelId,
  isFreebuffModelId,
  isFreebuffModelAllowedForAccessTier,
  isFreebuffPremiumModelId,
  isSupportedFreebuffModelId,
  resolveFreebuffModelForAccessTier,
} from '../constants/freebuff-models'
import type { FreebuffModelOption } from '../constants/freebuff-models'
import { minimaxModels } from '../constants/model-config'

const MINIMAX_M3_MODEL_ID = minimaxModels.minimaxM3

describe('freebuff model availability', () => {
  test('defaults to MiniMax M3, falls back to DeepSeek V4 Flash for new clients', () => {
    expect(DEFAULT_FREEBUFF_MODEL_ID).toBe(MINIMAX_M3_MODEL_ID)
    expect(FALLBACK_FREEBUFF_MODEL_ID).toBe(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
  })

  test('DeepSeek Pro carries the data-collection warning so users see it before picking', () => {
    const deepseek = FREEBUFF_MODELS.find(
      (m) => m.id === FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    )
    expect((deepseek as { warning?: string } | undefined)?.warning).toBe(
      'Collects data for training',
    )
  })

  test('DeepSeek Flash carries the data-collection warning so users see it before picking', () => {
    const deepseek = FREEBUFF_MODELS.find(
      (m) => m.id === FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect((deepseek as { warning?: string } | undefined)?.warning).toBe(
      'Collects data for training',
    )
  })

  test('only the DeepSeek family is trace-stored in free mode; M3 has no warning', () => {
    const m3 = FREEBUFF_MODELS.find((m) => m.id === MINIMAX_M3_MODEL_ID)
    expect((m3 as { warning?: string } | undefined)?.warning).toBeUndefined()
    // The DeepSeek family discloses data collection and IS stored.
    expect(isFreebuffTracedModelId(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID)).toBe(true)
    expect(isFreebuffTracedModelId(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)).toBe(
      true,
    )
    // Everything else (incl. M3 on Fireworks) is NOT stored.
    expect(isFreebuffTracedModelId(MINIMAX_M3_MODEL_ID)).toBe(false)
    expect(isFreebuffTracedModelId(FREEBUFF_KIMI_MODEL_ID)).toBe(false)
    expect(isFreebuffTracedModelId(FREEBUFF_MIMO_V25_MODEL_ID)).toBe(false)
    expect(isFreebuffTracedModelId(null)).toBe(false)
  })

  test('trace storage is one source of truth with the data-collection warning', () => {
    // A model is traced in free mode iff it shows the data-collection caveat.
    const models: readonly FreebuffModelOption[] = SUPPORTED_FREEBUFF_MODELS
    for (const model of models) {
      expect(isFreebuffTracedModelId(model.id)).toBe(
        model.warning === FREEBUFF_DATA_COLLECTION_WARNING,
      )
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
  })

  test('Kimi is selectable in full mode', () => {
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_KIMI_MODEL_ID,
    )
    expect(FREEBUFF_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_KIMI_MODEL_ID,
    )
    expect(getFreebuffModelsForAccessTier('full').map((m) => m.id)).toContain(
      FREEBUFF_KIMI_MODEL_ID,
    )
    expect(isFreebuffModelId(FREEBUFF_KIMI_MODEL_ID)).toBe(true)
    expect(isSupportedFreebuffModelId(FREEBUFF_KIMI_MODEL_ID)).toBe(true)
    expect(
      isFreebuffModelAllowedForAccessTier(FREEBUFF_KIMI_MODEL_ID, 'full'),
    ).toBe(true)
  })

  test('MiniMax M2.7 is legacy: hidden from pickers but still served for old clients', () => {
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_MINIMAX_MODEL_ID,
    )
    expect(FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_MINIMAX_MODEL_ID,
    )
    expect(
      getFreebuffModelsForAccessTier('full').map((m) => m.id),
    ).not.toContain(FREEBUFF_MINIMAX_MODEL_ID)
    expect(isFreebuffModelId(FREEBUFF_MINIMAX_MODEL_ID)).toBe(false)
    expect(isSupportedFreebuffModelId(FREEBUFF_MINIMAX_MODEL_ID)).toBe(true)
    // Old clients with a saved M2.7 selection must still be admitted.
    expect(
      isFreebuffModelAllowedForAccessTier(FREEBUFF_MINIMAX_MODEL_ID, 'full'),
    ).toBe(true)
    expect(
      resolveFreebuffModelForAccessTier(FREEBUFF_MINIMAX_MODEL_ID, 'full'),
    ).toBe(FREEBUFF_MINIMAX_MODEL_ID)
  })

  test('MiniMax M3 is a selectable unlimited model, last in the unlimited section', () => {
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).toContain(
      MINIMAX_M3_MODEL_ID,
    )
    expect(FREEBUFF_MODELS.map((model) => model.id)).toContain(
      MINIMAX_M3_MODEL_ID,
    )
    expect(
      getFreebuffModelsForAccessTier('full').map((m) => m.id),
    ).toContain(MINIMAX_M3_MODEL_ID)
    expect(isFreebuffModelId(MINIMAX_M3_MODEL_ID)).toBe(true)
    expect(isSupportedFreebuffModelId(MINIMAX_M3_MODEL_ID)).toBe(true)
    expect(isFreebuffPremiumModelId(MINIMAX_M3_MODEL_ID)).toBe(false)
    expect(
      isFreebuffModelAllowedForAccessTier(MINIMAX_M3_MODEL_ID, 'full'),
    ).toBe(true)
    // MiniMax M3 is the recommended default, so it leads the picker list.
    expect(FREEBUFF_MODELS[0]!.id).toBe(MINIMAX_M3_MODEL_ID)
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
      isFreebuffModelAllowedForAccessTier(FREEBUFF_MINIMAX_MODEL_ID, 'limited'),
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
      resolveFreebuffModelForAccessTier(FREEBUFF_MINIMAX_MODEL_ID, 'limited'),
    ).toBe(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
  })

  test('recommends an unlimited, in-tier model for the picker hero', () => {
    // Full access → MiniMax M3 (the unlimited default), so the one-Enter
    // start never burns a premium session.
    expect(getRecommendedFreebuffModelId('full')).toBe(MINIMAX_M3_MODEL_ID)
    expect(getRecommendedFreebuffModelId(undefined)).toBe(MINIMAX_M3_MODEL_ID)
    expect(isFreebuffPremiumModelId(getRecommendedFreebuffModelId('full'))).toBe(
      false,
    )
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

    // Legacy "Fastest" MiniMax M2.7 skips it to preserve the fastest tier.
    expect(canFreebuffModelSpawnGeminiThinker(FREEBUFF_MINIMAX_MODEL_ID)).toBe(
      false,
    )
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
