import { describe, expect, test } from 'bun:test'

import { supportsAssistantPrefill } from '../constants/model-config'

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
    expect(supportsAssistantPrefill('anthropic/claude-haiku-4-5-20251001')).toBe(
      true,
    )
  })

  test('allows prefill for non-Claude models', () => {
    expect(supportsAssistantPrefill('openai/gpt-5.1')).toBe(true)
    expect(supportsAssistantPrefill('deepseek/deepseek-v4-pro')).toBe(true)
    expect(supportsAssistantPrefill('moonshotai/kimi-k2.6')).toBe(true)
  })
})
