import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'
import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'

describe('getModelForRequest free-mode guards', () => {
  const mockGetValidChatGptOAuthCredentials = mock(() =>
    Promise.resolve(null),
  )
  let mockProviderModelResolved = false

  beforeEach(async () => {
    mockProviderModelResolved = false
    // Mock CHATGPT_OAUTH_ENABLED to true so the ChatGPT OAuth path is entered.
    // Uses mockModule helper since this is an absolute package specifier.
    await mockModule('@codebuff/common/constants/chatgpt-oauth', () => ({
      CHATGPT_OAUTH_ENABLED: true,
    }))

    // Mock credentials directly with Bun's mock.module — the helper resolves
    // relative paths from common/src/testing/, not from this test file.
    const actualCredentials = await import('../../credentials')
    mock.module('../../credentials', () => ({
      ...actualCredentials,
      getValidChatGptOAuthCredentials: mockGetValidChatGptOAuthCredentials,
    }))

    mock.module('../../provider-config', () => ({
      loadProviderConfigSync: () => ({
        config: {
          providers: {},
          defaultModel: undefined,
          defaultReasoningEffort: undefined,
          modes: {},
          modeReasoningEfforts: {},
          agents: {},
          agentReasoningEfforts: {},
        },
        sourceFilePaths: [],
      }),
      resolveConfiguredAgentModelConfig: (params: any) => ({
        model: params.model,
        reasoningEffort: undefined,
      }),
      resolveConfiguredProviderModel: (params: any) => {
        if (mockProviderModelResolved && params.model === 'openai/gpt-5.3') {
          return {
            providerId: 'openai',
            provider: {
              type: 'openai-compatible',
              baseURL: 'https://api.openai.com/v1',
              models: ['gpt-5.3'],
            },
            requestedModel: 'openai/gpt-5.3',
            providerModel: 'gpt-5.3',
            apiKey: 'test-key',
            compatibility: {
              stripCacheControl: true,
              stringifyTextContent: true,
              supportsTools: true,
              supportsRequiredToolChoice: true,
              stripProviderMetadata: true,
            },
          }
        }
        return undefined
      },
      DEFAULT_PROVIDER_COMPATIBILITY: {
        stripCacheControl: true,
        stringifyTextContent: true,
        supportsTools: true,
        supportsRequiredToolChoice: true,
        stripProviderMetadata: true,
      },
    }))

    mockGetValidChatGptOAuthCredentials.mockReset()
    mockGetValidChatGptOAuthCredentials.mockResolvedValue(null)
  })

  afterEach(() => {
    mock.restore()
    clearMockedModules()
  })

  async function importFresh() {
    const mod = await import('../model-provider')
    // Ensure clean rate-limit state
    mod.resetChatGptOAuthRateLimit()
    return mod
  }

  test('throws when ChatGPT OAuth is rate-limited in free mode', async () => {
    const { getModelForRequest, markChatGptOAuthRateLimited } =
      await importFresh()

    markChatGptOAuthRateLimited()

    await expect(
      getModelForRequest({
        apiKey: 'test-key',
        model: 'openai/gpt-5.3',
        costMode: 'free',
      }),
    ).rejects.toThrow('ChatGPT rate limit reached')
  })

  test('throws when ChatGPT OAuth credentials are unavailable in free mode', async () => {
    const { getModelForRequest } = await importFresh()

    mockGetValidChatGptOAuthCredentials.mockResolvedValue(null)

    await expect(
      getModelForRequest({
        apiKey: 'test-key',
        model: 'openai/gpt-5.3',
        costMode: 'free',
      }),
    ).rejects.toThrow('ChatGPT OAuth credentials unavailable')
  })

  test('falls through to backend when rate-limited in non-free mode', async () => {
    mockProviderModelResolved = true
    const { getModelForRequest, markChatGptOAuthRateLimited } =
      await importFresh()

    markChatGptOAuthRateLimited()

    const result = await getModelForRequest({
      apiKey: 'test-key',
      model: 'openai/gpt-5.3',
      costMode: 'default',
    })

    expect(result.isChatGptOAuth).toBe(false)
  })

  test('falls through to backend when credentials unavailable in non-free mode', async () => {
    mockProviderModelResolved = true
    const { getModelForRequest } = await importFresh()

    mockGetValidChatGptOAuthCredentials.mockResolvedValue(null)

    const result = await getModelForRequest({
      apiKey: 'test-key',
      model: 'openai/gpt-5.3',
      costMode: 'default',
    })

    expect(result.isChatGptOAuth).toBe(false)
  })
})
