import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'
import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'

describe('getModelForRequest free-mode guards', () => {
  const mockGetValidChatGptOAuthCredentials = mock(() =>
    Promise.resolve(null),
  )
  const mockGetValidClaudeOAuthCredentials = mock(() =>
    Promise.resolve(null),
  )

  beforeEach(async () => {
    // Mock CHATGPT_OAUTH_ENABLED to true so the ChatGPT OAuth path is entered.
    // Uses mockModule helper since this is an absolute package specifier.
    await mockModule('@codebuff/common/constants/chatgpt-oauth', () => ({
      CHATGPT_OAUTH_ENABLED: true,
    }))

    // Mock credentials directly with Bun's mock.module — the helper resolves
    // relative paths from common/src/testing/, not from this test file.
    mock.module('../../credentials', () => ({
      getValidChatGptOAuthCredentials: mockGetValidChatGptOAuthCredentials,
      getValidClaudeOAuthCredentials: mockGetValidClaudeOAuthCredentials,
    }))

    mockGetValidChatGptOAuthCredentials.mockReset()
    mockGetValidClaudeOAuthCredentials.mockReset()
    mockGetValidChatGptOAuthCredentials.mockResolvedValue(null)
    mockGetValidClaudeOAuthCredentials.mockResolvedValue(null)
  })

  afterEach(() => {
    mock.restore()
    clearMockedModules()
  })

  async function importFresh() {
    const mod = await import('../model-provider')
    // Ensure clean rate-limit state
    mod.resetChatGptOAuthRateLimit()
    mod.resetClaudeOAuthRateLimit()
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
    const { getModelForRequest, markChatGptOAuthRateLimited } =
      await importFresh()

    markChatGptOAuthRateLimited()

    const result = await getModelForRequest({
      apiKey: 'test-key',
      model: 'openai/gpt-5.3',
      costMode: 'default',
    })

    expect(result.isChatGptOAuth).toBe(false)
    expect(result.isClaudeOAuth).toBe(false)
  })

  test('falls through to backend when credentials unavailable in non-free mode', async () => {
    const { getModelForRequest } = await importFresh()

    mockGetValidChatGptOAuthCredentials.mockResolvedValue(null)

    const result = await getModelForRequest({
      apiKey: 'test-key',
      model: 'openai/gpt-5.3',
      costMode: 'default',
    })

    expect(result.isChatGptOAuth).toBe(false)
    expect(result.isClaudeOAuth).toBe(false)
  })
})
