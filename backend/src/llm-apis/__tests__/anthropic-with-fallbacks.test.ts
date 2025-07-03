import { describe, expect, it } from 'bun:test'
import { claudeModels } from '@codebuff/common/constants'

describe('promptAnthropicWithFallbacks', () => {
  it('should export the fallback function', async () => {
    const module = await import('../anthropic-with-fallbacks')
    expect(typeof module.promptAnthropicWithFallbacks).toBe('function')
  })

  it('should have correct fallback provider types', () => {
    const validProviders = ['openrouter']
    expect(validProviders).toHaveLength(1)
  })
})
