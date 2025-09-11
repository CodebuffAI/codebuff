import { describe, it, expect } from 'bun:test'
import { modelToAiSDKModel } from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { zAiModels } from '@codebuff/common/old-constants'

describe('Z.ai Provider Integration', () => {
  it('should correctly route GLM-4.5 model to Z.ai provider', () => {
    const model = zAiModels.glm4_5
    const aiSdkModel = modelToAiSDKModel(model)
    expect(aiSdkModel).toBeDefined()
    expect(typeof aiSdkModel).toBe('object')
  })

  it('should handle Z.ai model type correctly', () => {
    const { ZAiModel } = require('@codebuff/common/old-constants')
    const model = zAiModels.glm4_5
    expect(model).toBe('glm-4.5')
    expect(typeof model).toBe('string')
  })

  it('should include Z.ai models in the main models export', () => {
    const { models } = require('@codebuff/common/old-constants')
    expect(models.glm4_5).toBe('glm-4.5')
  })

  it('should have correct short name mapping for GLM-4.5', () => {
    const { shortModelNames } = require('@codebuff/common/old-constants')
    expect(shortModelNames['glm-4.5']).toBe('glm-4.5')
  })

  it('should include Z.ai in allowed model prefixes', () => {
    const { ALLOWED_MODEL_PREFIXES } = require('@codebuff/common/old-constants')
    expect(ALLOWED_MODEL_PREFIXES).toContain('z-ai')
  })

  it('should have provider name mapping for Z.ai models', () => {
    const { providerModelNames } = require('@codebuff/common/old-constants')
    expect(providerModelNames['glm-4.5']).toBe('z-ai')
  })

  it('should support caching for Z.ai models', () => {
    const { shouldCacheModels, supportsCacheControl } = require('@codebuff/common/old-constants')
    expect(shouldCacheModels).toContain('glm-4.5')
    expect(supportsCacheControl('glm-4.5')).toBe(true)
  })

  it('should return correct logo for Z.ai models', () => {
    const { getLogoForModel } = require('@codebuff/common/old-constants')
    const logo = getLogoForModel('glm-4.5')
    expect(logo).toBe('https://www.google.com/s2/favicons?domain=z.ai&sz=256')
  })
})