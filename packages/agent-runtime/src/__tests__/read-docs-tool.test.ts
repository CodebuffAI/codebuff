import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AgentRuntimeDeps } from '@codebuff/common/types/contracts/agent-runtime'
import type { CiEnv } from '@codebuff/common/types/contracts/env'

import { read_docs } from '../tools/read-docs-tool'
import { callDocsSearchAPI } from '../tools/handlers/call-docs-search-api'

// Mock the Codebuff web API handler
vi.mock('../tools/handlers/call-docs-search-api', () => ({
  callDocsSearchAPI: vi.fn(),
}))

// Mock global fetch
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

// Context7 API response shape
const mockContext7SearchResponse = {
  results: [
    {
      id: 'doc-1',
      source: 'context7' as const,
      title: 'Test Document',
      content: 'Test content from Context7',
      url: 'https://example.com/doc1',
      score: 0.95,
    },
  ],
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

describe('read_docs tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when CODEBUFF_API_KEY is undefined (BYOK/local mode)', () => {
    it('should NOT call callDocsSearchAPI and should use direct Context7 API via fetch', async () => {
      const deps = createTestDeps({ CODEBUFF_API_KEY: undefined })

      // Mock fetch to return Context7 search response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockContext7SearchResponse,
      })

      const args = {
        query: 'test query for documentation',
        repo_name: 'test-repo',
      }

      await read_docs({ args, deps })

      // Assert: callDocsSearchAPI (web facade) should NOT be called
      expect(callDocsSearchAPI).not.toHaveBeenCalled()

      // Assert: fetch should be called for direct Context7 API
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should return formatted results from Context7 API response', async () => {
      const deps = createTestDeps({ CODEBUFF_API_KEY: undefined })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockContext7SearchResponse,
      })

      const args = {
        query: 'react hooks usage',
        repo_name: 'my-project',
      }

      const result = await read_docs({ args, deps })

      expect(result.success).toBe(true)
      expect(callDocsSearchAPI).not.toHaveBeenCalled()
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should use LINKUP_API_KEY from ciEnv for Context7 API', async () => {
      const deps = createTestDeps({
        CODEBUFF_API_KEY: undefined,
        LINKUP_API_KEY: 'my-linkup-key-123',
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockContext7SearchResponse,
      })

      const args = { query: 'test', repo_name: 'test-repo' }
      await read_docs({ args, deps })

      // Verify fetch was called (direct API path)
      expect(mockFetch).toHaveBeenCalled()
      expect(callDocsSearchAPI).not.toHaveBeenCalled()
    })
  })

  describe('when CODEBUFF_API_KEY is defined (hosted Codebuff mode)', () => {
    it('should call callDocsSearchAPI and NOT use direct Context7 fetch', async () => {
      const deps = createTestDeps({ CODEBUFF_API_KEY: 'hosted-api-key' })

      // Mock callDocsSearchAPI to return success
      vi.mocked(callDocsSearchAPI).mockResolvedValueOnce({
        success: true,
        data: [{ id: 'web-result', content: 'From Codebuff API' }],
      })

      const args = {
        query: 'test query',
        repo_name: 'test-repo',
      }

      await read_docs({ args, deps })

      // Assert: callDocsSearchAPI (web facade) SHOULD be called
      expect(callDocsSearchAPI).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'test query' }),
        deps,
      )

      // Assert: fetch should NOT be called (web facade handles it)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
