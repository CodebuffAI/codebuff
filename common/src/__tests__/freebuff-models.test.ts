import { describe, expect, test } from 'bun:test'

import {
  canFreebuffModelSpawnGeminiThinker,
  DEFAULT_FREEBUFF_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
  LIMITED_FREEBUFF_MODEL_ID,
  FREEBUFF_MINIMAX_MODEL_ID,
  FREEBUFF_MODELS,
  SUPPORTED_FREEBUFF_MODELS,
  getFreebuffDeploymentAvailabilityLabel,
  getFreebuffModelsForAccessTier,
  isFreebuffDeploymentHours,
  isFreebuffModelId,
  isFreebuffModelAllowedForAccessTier,
  isFreebuffPremiumModelId,
  isSupportedFreebuffModelId,
  resolveFreebuffModelForAccessTier,
} from '../constants/freebuff-models'

describe('freebuff model availability', () => {
  test('defaults to MiniMax M2.7 for base2-free', () => {
    expect(DEFAULT_FREEBUFF_MODEL_ID).toBe(FREEBUFF_MINIMAX_MODEL_ID)
  })

  test('DeepSeek Pro carries the data-collection warning so users see it before picking', () => {
    const deepseek = FREEBUFF_MODELS.find(
      (m) => m.id === FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    )
    expect(deepseek?.warning).toBe('Collects data for training')
  })

  test('DeepSeek Flash carries the data-collection warning so users see it before picking', () => {
    const deepseek = FREEBUFF_MODELS.find(
      (m) => m.id === FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect(deepseek?.warning).toBe('Collects data for training')
  })

  test('DeepSeek V4 Flash is selectable and unlimited', () => {
    expect(FREEBUFF_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect(isFreebuffModelId(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)).toBe(true)
    expect(isFreebuffPremiumModelId(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)).toBe(
      false,
    )
  })

  test('limited access exposes only DeepSeek V4 Flash', () => {
    expect(LIMITED_FREEBUFF_MODEL_ID).toBe(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
    expect(getFreebuffModelsForAccessTier('limited').map((m) => m.id)).toEqual([
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
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
      resolveFreebuffModelForAccessTier(FREEBUFF_MINIMAX_MODEL_ID, 'limited'),
    ).toBe(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
  })

  test('only smart freebuff models can spawn the gemini-thinker subagent', () => {
    expect(canFreebuffModelSpawnGeminiThinker(FREEBUFF_KIMI_MODEL_ID)).toBe(
      true,
    )
    expect(
      canFreebuffModelSpawnGeminiThinker(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID),
    ).toBe(true)
    expect(canFreebuffModelSpawnGeminiThinker(FREEBUFF_MINIMAX_MODEL_ID)).toBe(
      false,
    )
    expect(
      canFreebuffModelSpawnGeminiThinker(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID),
    ).toBe(false)
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
