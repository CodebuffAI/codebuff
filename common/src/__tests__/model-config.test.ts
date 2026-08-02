import { describe, expect, test } from 'bun:test'

import {
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
