import { describe, it, expect, vi, beforeEach } from 'bun:test'
import { zAi } from '../llm-apis/vercel-ai-sdk/z-ai'
import { env } from '@codebuff/internal/env'

describe('Z.ai Integration', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should create Z.ai provider with correct configuration', () => {
    expect(zAi).toBeDefined()
    expect(env.Z_AI_API_KEY).toBeDefined()
    expect(env.Z_AI_BASE_URL).toBe('https://api.z.ai/api/coding/paas/v4')
  })

  it('should include GLM-4.5 model in available models', () => {
    const { zAiModels } = require('@codebuff/common/old-constants')
    expect(zAiModels.glm4_5).toBe('glm-4.5')
  })

  it('should have correct provider configuration', () => {
    // Test that the provider is properly configured
    const providerConfig = zAi as any
    expect(providerConfig.name).toBe('z-ai')
    expect(providerConfig.apiKey).toBeDefined()
    expect(providerConfig.baseURL).toBe('https://api.z.ai/api/coding/paas/v4')
  })

  it('should include proper headers for Z.ai API', () => {
    const providerConfig = zAi as any
    expect(providerConfig.headers).toBeDefined()
    expect(providerConfig.headers['HTTP-Referer']).toBe('https://codebuff.com')
    expect(providerConfig.headers['X-Title']).toBe('Codebuff')
  })
})