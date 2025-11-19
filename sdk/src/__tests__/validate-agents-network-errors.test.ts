import { describe, expect, test, beforeEach, mock, afterEach } from 'bun:test'
import { validateAgents } from '../validate-agents'
import type { AgentDefinition } from '../index'

describe('validateAgents network error handling', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof mock>

  beforeEach(() => {
    mockFetch = mock()
    globalThis.fetch = mockFetch as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const testAgent: AgentDefinition = {
    id: 'test-agent',
    displayName: 'Test Agent',
    model: 'openai/gpt-5-mini',
  }

  describe('network errors (thrown)', () => {
    test('throws NETWORK_ERROR for connection failures', async () => {
      mockFetch.mockRejectedValue(new Error('Failed to fetch'))

      const result = await validateAgents([testAgent], { remote: true })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('NETWORK_ERROR')
      expect(result.error.message).toContain('Failed to connect to validation API')
    })

    test('throws NETWORK_ERROR for 500 server errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'Server crashed' }),
      } as Response)

      const result = await validateAgents([testAgent], { remote: true })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('NETWORK_ERROR')
      expect(result.error.message).toContain('Failed to connect')
      expect(result.error.originalError).toBeDefined()
      expect((result.error.originalError as any).status).toBe(500)
    })

    test('throws NETWORK_ERROR for 502 Bad Gateway', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: () => Promise.resolve({}),
      } as Response)

      const result = await validateAgents([testAgent], { remote: true })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('NETWORK_ERROR')
      expect(result.error.message).toContain('Failed to connect')
      expect(result.error.originalError).toBeDefined()
      expect((result.error.originalError as any).status).toBe(502)
    })

    test('throws NETWORK_ERROR for 503 Service Unavailable', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: () => Promise.reject(new Error('Invalid JSON')),
      } as Response)

      const result = await validateAgents([testAgent], { remote: true })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('NETWORK_ERROR')
      expect(result.error.message).toContain('Failed to connect')
      expect(result.error.originalError).toBeDefined()
      expect((result.error.originalError as any).status).toBe(503)
    })

    test('throws NETWORK_ERROR for 504 Gateway Timeout', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 504,
        statusText: 'Gateway Timeout',
        json: () => Promise.resolve({ error: 'Timeout' }),
      } as Response)

      const result = await validateAgents([testAgent], { remote: true })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('NETWORK_ERROR')
      expect(result.error.message).toContain('Failed to connect')
      expect(result.error.originalError).toBeDefined()
      expect((result.error.originalError as any).status).toBe(504)
    })

    test('throws NETWORK_ERROR for network timeouts', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'))

      const result = await validateAgents([testAgent], { remote: true })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('NETWORK_ERROR')
      expect(result.error.message).toContain('Failed to connect')
    })

    test('throws NETWORK_ERROR for DNS resolution failures', async () => {
      mockFetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.example.com'))

      const result = await validateAgents([testAgent], { remote: true })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('NETWORK_ERROR')
      expect(result.error.message).toContain('Failed to connect')
      expect(result.error.originalError).toEqual(
        expect.objectContaining({ message: expect.stringContaining('ENOTFOUND') }),
      )
    })

    test('includes original error in network errors', async () => {
      const originalError = new Error('Connection refused')
      mockFetch.mockRejectedValue(originalError)

      const result = await validateAgents([testAgent], { remote: true })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('NETWORK_ERROR')
      expect(result.error.originalError).toBeDefined()
      expect((result.error.originalError as any).message).toBe('Connection refused')
    })
  })

  describe('client errors (returned as validation errors)', () => {
    test('returns validation error for 400 Bad Request', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: 'Invalid agent format' }),
      } as Response)

      const result = await validateAgents([testAgent], { remote: true })

      expect(result.success).toBe(true)
      const value = result.value
      expect(value.success).toBe(false)
      expect(value.validationErrors).toHaveLength(1)
      expect(value.validationErrors[0].id).toBe('validation_api_error')
      expect(value.validationErrors[0].message).toContain('Invalid agent format')
    })

    test('returns validation error for 401 Unauthorized', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: 'Invalid API key' }),
      } as Response)

      const result = await validateAgents([testAgent], { remote: true })

      expect(result.success).toBe(true)
      const value = result.value
      expect(value.success).toBe(false)
      expect(value.validationErrors).toHaveLength(1)
      expect(value.validationErrors[0].id).toBe('validation_api_error')
    })

    test('returns validation error for 403 Forbidden', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ error: 'Access denied' }),
      } as Response)

      const result = await validateAgents([testAgent], { remote: true })

      expect(result.success).toBe(true)
      const value = result.value
      expect(value.success).toBe(false)
      expect(value.validationErrors[0].id).toBe('validation_api_error')
      expect(value.validationErrors[0].message).toContain('Access denied')
    })

    test('returns validation error for 404 Not Found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({}),
      } as Response)

      const result = await validateAgents([testAgent], { remote: true })

      expect(result.success).toBe(true)
      const value = result.value
      expect(value.success).toBe(false)
      expect(value.validationErrors[0].message).toContain('404')
    })

    test('returns validation error for 422 Unprocessable Entity', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: () => Promise.resolve({ error: 'Validation failed' }),
      } as Response)

      const result = await validateAgents([testAgent], { remote: true })

      expect(result.success).toBe(true)
      const value = result.value
      expect(value.success).toBe(false)
      expect(value.validationErrors[0].id).toBe('validation_api_error')
      expect(value.validationErrors[0].message).toContain('Validation failed')
    })

    test('handles JSON parse errors in 4xx responses gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.reject(new Error('Invalid JSON')),
      } as Response)

      const result = await validateAgents([testAgent], { remote: true })

      expect(result.success).toBe(true)
      const value = result.value
      expect(value.success).toBe(false)
      expect(value.validationErrors[0].message).toContain('400')
    })
  })

  describe('successful validation', () => {
    test('returns success with empty errors for valid agents', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ validationErrors: [] }),
      } as Response)

      const result = await validateAgents([testAgent], { remote: true })

      expect(result.success).toBe(true)
      const value = result.value
      expect(value.success).toBe(true)
      expect(value.validationErrors).toEqual([])
      expect(value.errorCount).toBe(0)
    })

    test('returns validation errors from successful API response', async () => {
      const apiErrors = [
        { filePath: 'agent1.yaml', message: 'Missing required field' },
        { filePath: 'agent2.yaml', message: 'Invalid tool reference' },
      ]

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ validationErrors: apiErrors }),
      } as Response)

      const result = await validateAgents([testAgent], { remote: true })

      expect(result.success).toBe(true)
      const value = result.value
      expect(value.success).toBe(false)
      expect(value.validationErrors).toHaveLength(2)
      expect(value.validationErrors[0].id).toBe('agent1.yaml')
      expect(value.validationErrors[0].message).toBe('Missing required field')
    })
  })

  describe('local validation fallback', () => {
    test('uses local validation when remote is false', async () => {
      // Should not call fetch for local validation
      const result = await validateAgents([testAgent], { remote: false })

      expect(mockFetch).not.toHaveBeenCalled()
      // Local validation should work without network
      expect(result.success).toBe(true)
      const value = result.value
      expect(value).toHaveProperty('success')
      expect(value).toHaveProperty('validationErrors')
    })

    test('local validation is not affected by network issues', async () => {
      mockFetch.mockRejectedValue(new Error('Network down'))

      // Local validation should still work
      const result = await validateAgents([testAgent], { remote: false })

      expect(mockFetch).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.value).toHaveProperty('success')
    })
  })
})
