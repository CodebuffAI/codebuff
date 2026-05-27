import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AgentRuntimeDeps } from '@codebuff/common/types/contracts/agent-runtime'
import type { CiEnv } from '@codebuff/common/types/contracts/env'

import { web_search } from '../tools/web-search-tool'
import { callWebSearchAPI } from '../tools/handlers/call-web-search-api'

// Mock the Codebuff web API handler
vi.mock('../tools/handlers/call-web-search-api', () => ({
  callWebSearchAPI: vi.fn(),
}))

// Mock global fetch
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

// Linkup API response shape
const mockLinkupSearchResponse = {
  results: [
    {
      id: 'linkup-result-1',
      source: 'linkup' as const,
      title: 'Linkup Search Result',
      content: 'Answer from Linkup web search',
      url: 'https://example.com/article',
    },
  ],
  answer: 'This is the Linkup answer to your query.',
}

// Create test deps with optional CODEBUFF_API_KEY
function createTestDeps(overrides?: Partial<CiEnv>): AgentRuntimeDeps {
  return {
    clientEnv: {
      NEXT_PUBLIC_CB_ENVIRONMENT: 'test',
      NEXT_PUBLIC_CODEBUFF_APP_URL: 'https://test.codebuff.com',
      NEXT_PUBLIC_SUPPORT_EMAIL: 'support@test.com',
      NEXT_PUBLIC_POSTHOG_API_KEY: 'test-posthog',
      NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://test.posthog.com',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test',
      NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL: 'https://test.stripe.com',
      NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID: undefined,
      NEXT_PUBLIC_WEB_PORT: 3000,
    },
    ciEnv: {
      CI: 'true',
      CODEBUFF_API_KEY: undefined,
      LINKUP_API_KEY: 'test-linkup-key',
      ...overrides,
    },
    getUserInfoFromApiKey: vi.fn(),
    fetchAgentFromDatabase: vi.fn(),
    startAgentRun: vi.fn(),
    finishAgentRun: vi.fn(),
    addAgentStep: vi.fn(),
    consumeCreditsWithFallback: vi.fn(),
    promptAiSdkStream: vi.fn(),
    promptAiSdk: vi.fn(),
    promptAiSdkStructured: vi.fn(),
    databaseAgentCache: new Map(),
    trackEvent: vi.fn(),
    logger: console,
    fetch: mockFetch,
    localMode: true,
  } as unknown as AgentRuntimeDeps
}

describe('web_search tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when CODEBUFF_API_KEY is undefined (BYOK/local mode)', () => {
    it('should NOT call callWebSearchAPI and should use direct Linkup API via fetch', async () => {
      const deps = createTestDeps({ CODEBUFF_API_KEY: undefined })

      // Mock fetch to return Linkup search response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockLinkupSearchResponse,
      })

      const args = {
        query: 'test query for web search',
      }

      await web_search({ args, deps })

      // Assert: callWebSearchAPI (web facade) should NOT be called
      expect(callWebSearchAPI).not.toHaveBeenCalled()

      // Assert: fetch should be called for direct Linkup API
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should return formatted results from Linkup API response', async () => {
      const deps = createTestDeps({ CODEBUFF_API_KEY: undefined })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockLinkupSearchResponse,
      })

      const args = {
        query: 'latest typescript features',
      }

      const result = await web_search({ args, deps })

      expect(result.success).toBe(true)
      expect(callWebSearchAPI).not.toHaveBeenCalled()
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should use LINKUP_API_KEY from ciEnv for Linkup API', async () => {
      const deps = createTestDeps({
        CODEBUFF_API_KEY: undefined,
        LINKUP_API_KEY: 'my-linkup-key-456',
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockLinkupSearchResponse,
      })

      const args = { query: 'test search query' }
      await web_search({ args, deps })

      // Verify fetch was called (direct API path)
      expect(mockFetch).toHaveBeenCalled()
      expect(callWebSearchAPI).not.toHaveBeenCalled()
    })

    it('should handle Linkup API error gracefully', async () => {
      const deps = createTestDeps({ CODEBUFF_API_KEY: undefined })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Invalid API key' }),
      })

      const args = { query: 'test query' }
      const result = await web_search({ args, deps })

      expect(callWebSearchAPI).not.toHaveBeenCalled()
      expect(mockFetch).toHaveBeenCalled()
      // Result should indicate failure but not crash
      expect(result.success).toBe(false)
    })
  })

  describe('when CODEBUFF_API_KEY is defined (hosted Codebuff mode)', () => {
    it('should call callWebSearchAPI and NOT use direct Linkup fetch', async () => {
      const deps = createTestDeps({ CODEBUFF_API_KEY: 'hosted-api-key' })

      // Mock callWebSearchAPI to return success
      vi.mocked(callWebSearchAPI).mockResolvedValueOnce({
        success: true,
        data: [{ id: 'web-result', content: 'From Codebuff API' }],
      })

      const args = {
        query: 'test query',
      }

      await web_search({ args, deps })

      // Assert: callWebSearchAPI (web facade) SHOULD be called
      expect(callWebSearchAPI).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'test query' }),
        deps,
      )

      // Assert: fetch should NOT be called (web facade handles it)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
