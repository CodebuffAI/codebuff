import { describe, expect, test } from 'bun:test'

import {
  contextPrunerBudgetForModel,
  ephemeralTrailingMessageBreaksCache,
  isExplicitlyDefinedModel,
  models,
  supportsAssistantPrefill,
} from '../constants/model-config'

describe('isExplicitlyDefinedModel', () => {
  test('distinguishes configured models from unknown model IDs', () => {
    expect(isExplicitlyDefinedModel(models.openrouter_gpt5)).toBe(true)
    expect(isExplicitlyDefinedModel('custom/unknown-model')).toBe(false)
  })
})

describe('supportsAssistantPrefill', () => {
  test('rejects prefill for Claude 4.6+', () => {
    expect(supportsAssistantPrefill('anthropic/claude-opus-4.6')).toBe(false)
    expect(supportsAssistantPrefill('anthropic/claude-opus-4.7')).toBe(false)
    expect(supportsAssistantPrefill('anthropic/claude-sonnet-4.6')).toBe(false)
    expect(supportsAssistantPrefill('anthropic/claude-fable-5')).toBe(false)
  })

  test('allows prefill for Claude before 4.6', () => {
    expect(supportsAssistantPrefill('anthropic/claude-sonnet-4.5')).toBe(true)
    expect(supportsAssistantPrefill('anthropic/claude-opus-4')).toBe(true)
    expect(supportsAssistantPrefill('anthropic/claude-3-5-sonnet')).toBe(true)
    expect(
      supportsAssistantPrefill('anthropic/claude-haiku-4-5-20251001'),
    ).toBe(true)
  })

  test('allows prefill for non-Claude models', () => {
    expect(supportsAssistantPrefill('openai/gpt-5.1')).toBe(true)
    expect(supportsAssistantPrefill('deepseek/deepseek-v4-pro')).toBe(true)
    expect(supportsAssistantPrefill('moonshotai/kimi-k2.6')).toBe(true)
  })
})

describe('ephemeralTrailingMessageBreaksCache', () => {
  test('is true for GPT-5.6, whatever the route prefixes it with', () => {
    // GPT-5.6 keeps its cache only to the latest user/tool message and does not
    // fall back to the longest matching prefix before it, so a trailing message
    // we delete next step takes the whole cache with it.
    expect(ephemeralTrailingMessageBreaksCache('openai/gpt-5.6-luna')).toBe(
      true,
    )
    expect(ephemeralTrailingMessageBreaksCache('gpt-5.6-luna')).toBe(true)
    expect(
      ephemeralTrailingMessageBreaksCache('openai/gpt-5.6-luna-20260709'),
    ).toBe(true)
  })

  test('is false for every model that does longest-prefix matching', () => {
    // These hold ~96% cache in prod on the same harness; making the step prompt
    // resident would cost them recency for nothing.
    for (const model of [
      'deepseek/deepseek-v4-flash',
      'minimax/minimax-m3',
      'mimo/mimo-v2.5',
      'anthropic/claude-opus-4.6',
      'openai/gpt-5.5',
      'openai/gpt-5',
    ]) {
      expect(ephemeralTrailingMessageBreaksCache(model)).toBe(false)
    }
  })
})

describe('contextPrunerBudgetForModel', () => {
  test('defaults to 400k, which every ~1M-window model we serve can hold', () => {
    for (const model of [
      'anthropic/claude-opus-5',
      'anthropic/claude-sonnet-5',
      'openai/gpt-5.4',
      'openai/gpt-5.6-luna',
      'deepseek/deepseek-v4-flash',
      'deepseek/deepseek-v4-pro',
      'mimo/mimo-v2.5',
      'z-ai/glm-5.2',
      // MiniMax M3's real enforced limit is 524_288 (Fireworks rejects with
      // "model maximum context length: 524287"), not the 1M OpenRouter lists.
      // 400k is still comfortably under it.
      'minimax/minimax-m3',
      'some/model-we-have-never-shipped',
    ]) {
      expect(contextPrunerBudgetForModel(model)).toBe(400_000)
    }
  })

  test('drops to 250k for the 262,144-token models', () => {
    // Kimi was already special-cased; hy3 and Ling share its window and were
    // silently getting 400k, i.e. a budget above what the provider accepts.
    for (const model of [
      'moonshotai/kimi-k2.7-code',
      'tencent/hy3',
      'tencent/hy3:free',
      'tencent/hy3-preview',
      'inclusionai/ling-3.0-flash:free',
    ]) {
      expect(contextPrunerBudgetForModel(model)).toBe(250_000)
    }
  })

  test('every exception stays under its real window', () => {
    // The budget is compared against a GPT-4o-based estimate applied to other
    // tokenizers, so it must sit under the provider's limit with room to spare.
    expect(contextPrunerBudgetForModel('tencent/hy3')).toBeLessThan(262_144)
  })
})
