import { describe, expect, test } from 'bun:test'

import {
  canFreebuffModelSpawnGeminiThinker,
  DEFAULT_CODEBIRDS_MODEL_ID,
  FALLBACK_CODEBIRDS_MODEL_ID,
  CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
  CODEBIRDS_DATA_COLLECTION_WARNING,
  CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID,
  CODEBIRDS_ENABLE_MIMO_MODELS_IN_UI,
  CODEBIRDS_KIMI_MODEL_ID,
  LIMITED_CODEBIRDS_MODEL_ID,
  LIMITED_CODEBIRDS_MODEL_IDS,
  CODEBIRDS_MINIMAX_MODEL_ID,
  CODEBIRDS_MIMO_V25_MODEL_ID,
  CODEBIRDS_MIMO_V25_PRO_MODEL_ID,
  CODEBIRDS_MODELS,
  SUPPORTED_CODEBIRDS_MODELS,
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
} from '../constants/codebirds-models'
import type { FreebuffModelOption } from '../constants/codebirds-models'
import { minimaxModels } from '../constants/model-config'

const MINIMAX_M3_MODEL_ID = minimaxModels.minimaxM3

describe('codebirds model availability', () => {
  test('defaults to MiniMax M3, falls back to DeepSeek V4 Flash for new clients', () => {
    expect(DEFAULT_CODEBIRDS_MODEL_ID).toBe(MINIMAX_M3_MODEL_ID)
    expect(FALLBACK_CODEBIRDS_MODEL_ID).toBe(CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID)
  })

  test('DeepSeek Pro carries the data-collection warning so users see it before picking', () => {
    const deepseek = CODEBIRDS_MODELS.find(
      (m) => m.id === CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID,
    )
    expect((deepseek as { warning?: string } | undefined)?.warning).toBe(
      'Collects data for training',
    )
  })

  test('DeepSeek Flash carries the data-collection warning so users see it before picking', () => {
    const deepseek = CODEBIRDS_MODELS.find(
      (m) => m.id === CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect((deepseek as { warning?: string } | undefined)?.warning).toBe(
      'Collects data for training',
    )
  })

  test('only the DeepSeek family is trace-stored in free mode; M3 has no warning', () => {
    const m3 = CODEBIRDS_MODELS.find((m) => m.id === MINIMAX_M3_MODEL_ID)
    expect((m3 as { warning?: string } | undefined)?.warning).toBeUndefined()
    // The DeepSeek family discloses data collection and IS stored.
    expect(isFreebuffTracedModelId(CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID)).toBe(true)
    expect(isFreebuffTracedModelId(CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID)).toBe(
      true,
    )
    // Everything else (incl. M3 on Fireworks) is NOT stored.
    expect(isFreebuffTracedModelId(MINIMAX_M3_MODEL_ID)).toBe(false)
    expect(isFreebuffTracedModelId(CODEBIRDS_KIMI_MODEL_ID)).toBe(false)
    expect(isFreebuffTracedModelId(CODEBIRDS_MIMO_V25_MODEL_ID)).toBe(false)
    expect(isFreebuffTracedModelId(null)).toBe(false)
  })

  test('trace storage is one source of truth with the data-collection warning', () => {
    // A model is traced in free mode iff it shows the data-collection caveat.
    const models: readonly FreebuffModelOption[] = SUPPORTED_CODEBIRDS_MODELS
    for (const model of models) {
      expect(isFreebuffTracedModelId(model.id)).toBe(
        model.warning === CODEBIRDS_DATA_COLLECTION_WARNING,
      )
    }
  })

  test('DeepSeek V4 Flash is selectable and non-premium', () => {
    expect(CODEBIRDS_MODELS.map((model) => model.id)).toContain(
      CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect(isFreebuffModelId(CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID)).toBe(true)
    expect(isFreebuffPremiumModelId(CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID)).toBe(
      false,
    )
  })

  test('MiMo models remain supported and follow the UI rollout flag', () => {
    expect(SUPPORTED_CODEBIRDS_MODELS.map((model) => model.id)).toContain(
      CODEBIRDS_MIMO_V25_PRO_MODEL_ID,
    )
    expect(SUPPORTED_CODEBIRDS_MODELS.map((model) => model.id)).toContain(
      CODEBIRDS_MIMO_V25_MODEL_ID,
    )

    if (CODEBIRDS_ENABLE_MIMO_MODELS_IN_UI) {
      expect(CODEBIRDS_MODELS.map((model) => model.id)).toContain(
        CODEBIRDS_MIMO_V25_PRO_MODEL_ID,
      )
      expect(CODEBIRDS_MODELS.map((model) => model.id)).toContain(
        CODEBIRDS_MIMO_V25_MODEL_ID,
      )
    } else {
      expect(CODEBIRDS_MODELS.map((model) => model.id)).not.toContain(
        CODEBIRDS_MIMO_V25_PRO_MODEL_ID,
      )
      expect(CODEBIRDS_MODELS.map((model) => model.id)).not.toContain(
        CODEBIRDS_MIMO_V25_MODEL_ID,
      )
    }

    expect(isFreebuffPremiumModelId(CODEBIRDS_MIMO_V25_PRO_MODEL_ID)).toBe(true)
    expect(isFreebuffPremiumModelId(CODEBIRDS_MIMO_V25_MODEL_ID)).toBe(false)
  })

  test('Kimi is selectable in full mode', () => {
    expect(SUPPORTED_CODEBIRDS_MODELS.map((model) => model.id)).toContain(
      CODEBIRDS_KIMI_MODEL_ID,
    )
    expect(CODEBIRDS_MODELS.map((model) => model.id)).toContain(
      CODEBIRDS_KIMI_MODEL_ID,
    )
    expect(getFreebuffModelsForAccessTier('full').map((m) => m.id)).toContain(
      CODEBIRDS_KIMI_MODEL_ID,
    )
    expect(isFreebuffModelId(CODEBIRDS_KIMI_MODEL_ID)).toBe(true)
    expect(isSupportedFreebuffModelId(CODEBIRDS_KIMI_MODEL_ID)).toBe(true)
    expect(
      isFreebuffModelAllowedForAccessTier(CODEBIRDS_KIMI_MODEL_ID, 'full'),
    ).toBe(true)
  })

  test('MiniMax M2.7 is legacy: hidden from pickers but still served for old clients', () => {
    expect(SUPPORTED_CODEBIRDS_MODELS.map((model) => model.id)).toContain(
      CODEBIRDS_MINIMAX_MODEL_ID,
    )
    expect(CODEBIRDS_MODELS.map((model) => model.id)).not.toContain(
      CODEBIRDS_MINIMAX_MODEL_ID,
    )
    expect(
      getFreebuffModelsForAccessTier('full').map((m) => m.id),
    ).not.toContain(CODEBIRDS_MINIMAX_MODEL_ID)
    expect(isFreebuffModelId(CODEBIRDS_MINIMAX_MODEL_ID)).toBe(false)
    expect(isSupportedFreebuffModelId(CODEBIRDS_MINIMAX_MODEL_ID)).toBe(true)
    // Old clients with a saved M2.7 selection must still be admitted.
    expect(
      isFreebuffModelAllowedForAccessTier(CODEBIRDS_MINIMAX_MODEL_ID, 'full'),
    ).toBe(true)
    expect(
      resolveFreebuffModelForAccessTier(CODEBIRDS_MINIMAX_MODEL_ID, 'full'),
    ).toBe(CODEBIRDS_MINIMAX_MODEL_ID)
  })

  test('MiniMax M3 is a selectable unlimited model, last in the unlimited section', () => {
    expect(SUPPORTED_CODEBIRDS_MODELS.map((model) => model.id)).toContain(
      MINIMAX_M3_MODEL_ID,
    )
    expect(CODEBIRDS_MODELS.map((model) => model.id)).toContain(
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
    // Pickers split sections by the premium flag while preserving array order,
    // so "last unlimited entry" means last in CODEBIRDS_MODELS overall.
    expect(CODEBIRDS_MODELS[CODEBIRDS_MODELS.length - 1]!.id).toBe(
      MINIMAX_M3_MODEL_ID,
    )
  })

  test('limited access exposes DeepSeek V4 Flash and non-Pro MiMo 2.5', () => {
    expect(LIMITED_CODEBIRDS_MODEL_ID).toBe(CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID)
    expect(LIMITED_CODEBIRDS_MODEL_IDS).toEqual([
      CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
      CODEBIRDS_MIMO_V25_MODEL_ID,
    ])
    expect(getFreebuffModelsForAccessTier('limited').map((m) => m.id)).toEqual([
      CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
      CODEBIRDS_MIMO_V25_MODEL_ID,
    ])
    expect(
      isFreebuffModelAllowedForAccessTier(
        CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
        'limited',
      ),
    ).toBe(true)
    expect(
      isFreebuffModelAllowedForAccessTier(CODEBIRDS_MINIMAX_MODEL_ID, 'limited'),
    ).toBe(false)
    expect(
      isFreebuffModelAllowedForAccessTier(MINIMAX_M3_MODEL_ID, 'limited'),
    ).toBe(false)
    expect(
      isFreebuffModelAllowedForAccessTier(
        CODEBIRDS_MIMO_V25_MODEL_ID,
        'limited',
      ),
    ).toBe(true)
    expect(
      isFreebuffModelAllowedForAccessTier(
        CODEBIRDS_MIMO_V25_PRO_MODEL_ID,
        'limited',
      ),
    ).toBe(false)
    expect(
      resolveFreebuffModelForAccessTier(CODEBIRDS_MIMO_V25_MODEL_ID, 'limited'),
    ).toBe(CODEBIRDS_MIMO_V25_MODEL_ID)
    expect(
      resolveFreebuffModelForAccessTier(CODEBIRDS_MINIMAX_MODEL_ID, 'limited'),
    ).toBe(CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID)
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
      CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect(
      getFreebuffModelsForAccessTier('limited').some(
        (m) => m.id === getRecommendedFreebuffModelId('limited'),
      ),
    ).toBe(true)
  })

  test('full-access codebirds models can spawn the gemini-thinker subagent', () => {
    // Full-access models (non-limited, non-fastest) get the thinker.
    expect(canFreebuffModelSpawnGeminiThinker(CODEBIRDS_KIMI_MODEL_ID)).toBe(
      true,
    )
    expect(
      canFreebuffModelSpawnGeminiThinker(CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID),
    ).toBe(true)
    expect(
      canFreebuffModelSpawnGeminiThinker(CODEBIRDS_MIMO_V25_PRO_MODEL_ID),
    ).toBe(true)
    expect(canFreebuffModelSpawnGeminiThinker(MINIMAX_M3_MODEL_ID)).toBe(true)

    // Legacy "Fastest" MiniMax M2.7 skips it to preserve the fastest tier.
    expect(canFreebuffModelSpawnGeminiThinker(CODEBIRDS_MINIMAX_MODEL_ID)).toBe(
      false,
    )
    // Limited-tier models (DeepSeek V4 Flash, MiMo 2.5) skip it.
    expect(
      canFreebuffModelSpawnGeminiThinker(CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID),
    ).toBe(false)
    expect(canFreebuffModelSpawnGeminiThinker(CODEBIRDS_MIMO_V25_MODEL_ID)).toBe(
      false,
    )
  })

  test('does not support GLM 5.1 for codebirds sessions', () => {
    const glm = 'z-ai/glm-5.1'
    expect(CODEBIRDS_MODELS.map((model) => model.id)).not.toContain(glm)
    expect(SUPPORTED_CODEBIRDS_MODELS.map((model) => model.id)).not.toContain(
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
