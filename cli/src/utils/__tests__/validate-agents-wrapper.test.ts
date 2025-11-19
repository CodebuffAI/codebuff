import { describe, expect, test, beforeEach, mock, afterEach, spyOn } from 'bun:test'
import { validateAgentsWithNetworkHandling } from '../validate-agents-wrapper'
import * as sdkModule from '@codebuff/sdk'

describe('validateAgentsWithNetworkHandling', () => {
  let mockValidateAgents: ReturnType<typeof mock>

  beforeEach(() => {
    mockValidateAgents = spyOn(sdkModule, 'validateAgents')
  })

  afterEach(() => {
    mockValidateAgents.mockRestore()
  })

  describe('successful validation', () => {
    test('returns success with no errors', async () => {
      mockValidateAgents.mockResolvedValue({
        success: true,
        value: {
          success: true,
          validationErrors: [],
          errorCount: 0,
        },
      })

      const result = await validateAgentsWithNetworkHandling(
        [{ id: 'test-agent', displayName: 'Test Agent' } as any],
        { remote: true }
      )

      expect(result.success).toBe(true)
      expect(result.validationErrors).toEqual([])
      expect(result.networkError).toBeNull()
    })

    test('passes through agent definitions and options correctly', async () => {
      mockValidateAgents.mockResolvedValue({
        success: true,
        value: {
          success: true,
          validationErrors: [],
          errorCount: 0,
        },
      })

      const agents = [
        { id: 'agent1', displayName: 'Agent 1' },
        { id: 'agent2', displayName: 'Agent 2' },
      ] as any

      await validateAgentsWithNetworkHandling(agents, { remote: true })

      expect(mockValidateAgents).toHaveBeenCalledTimes(1)
      expect(mockValidateAgents).toHaveBeenCalledWith(agents, { remote: true })
    })
  })

  describe('validation errors', () => {
    test('returns validation errors on failure', async () => {
      const validationErrors = [
        { id: 'agent1', message: 'Invalid configuration' },
        { id: 'agent2', message: 'Missing required field' },
      ]

      mockValidateAgents.mockResolvedValue({
        success: true,
        value: {
          success: false,
          validationErrors,
          errorCount: 2,
        },
      })

      const result = await validateAgentsWithNetworkHandling([], { remote: true })

      expect(result.success).toBe(false)
      expect(result.validationErrors).toEqual(validationErrors)
      expect(result.networkError).toBeNull()
    })

    test('preserves all validation error details', async () => {
      const detailedError = {
        id: 'complex-agent',
        message: 'Multiple issues found:\n- Invalid prompt\n- Missing tools',
      }

      mockValidateAgents.mockResolvedValue({
        success: true,
        value: {
          success: false,
          validationErrors: [detailedError],
          errorCount: 1,
        },
      })

      const result = await validateAgentsWithNetworkHandling([], { remote: false })

      expect(result.validationErrors[0]).toEqual(detailedError)
      expect(result.validationErrors[0].message).toContain('Multiple issues')
    })
  })

  describe('network error handling', () => {
    test('catches NETWORK_ERROR and returns as networkError', async () => {
      const networkError = new Error('Failed to connect to validation API') as any
      networkError.code = 'NETWORK_ERROR'

      mockValidateAgents.mockResolvedValue({
        success: false,
        error: networkError,
      })

      const result = await validateAgentsWithNetworkHandling([], { remote: true })

      // Should not throw, but return network error
      expect(result.success).toBe(true) // Don't block on network errors
      expect(result.validationErrors).toEqual([])
      expect(result.networkError).toBe('Failed to connect to validation API')
    })

    test('uses default message for network errors without message', async () => {
      const networkError = new Error() as any
      networkError.code = 'NETWORK_ERROR'

      mockValidateAgents.mockResolvedValue({
        success: false,
        error: networkError,
      })

      const result = await validateAgentsWithNetworkHandling([], { remote: true })

      expect(result.networkError).toBe('Unable to connect to validation server')
    })

    test('network errors do not block operations', async () => {
      const networkError = new Error('Server timeout') as any
      networkError.code = 'NETWORK_ERROR'

      mockValidateAgents.mockResolvedValue({
        success: false,
        error: networkError,
      })

      const result = await validateAgentsWithNetworkHandling(
        [{ id: 'test' } as any],
        { remote: true }
      )

      // Network errors should return success: true to not block message sending
      expect(result.success).toBe(true)
      expect(result.validationErrors).toEqual([])
      expect(result.networkError).toBe('Server timeout')
    })
  })

  describe('unexpected error handling', () => {
    test('re-throws non-network errors', async () => {
      const unexpectedError = new Error('Unexpected failure')

      mockValidateAgents.mockRejectedValue(unexpectedError)

      await expect(
        validateAgentsWithNetworkHandling([], { remote: true })
      ).rejects.toThrow('Unexpected failure')
    })

    test('re-throws errors without code property', async () => {
      const genericError = new Error('Generic error')

      mockValidateAgents.mockRejectedValue(genericError)

      await expect(
        validateAgentsWithNetworkHandling([], { remote: true })
      ).rejects.toThrow('Generic error')
    })

    test('re-throws errors with non-NETWORK_ERROR code', async () => {
      const authError = new Error('Auth failed') as any
      authError.code = 'AUTH_FAILED'

      mockValidateAgents.mockRejectedValue(authError)

      await expect(
        validateAgentsWithNetworkHandling([], { remote: true })
      ).rejects.toThrow('Auth failed')
    })
  })

  describe('options handling', () => {
    test('uses remote validation when remote: true', async () => {
      mockValidateAgents.mockResolvedValue({
        success: true,
        value: {
          success: true,
          validationErrors: [],
          errorCount: 0,
        },
      })

      await validateAgentsWithNetworkHandling([], { remote: true })

      expect(mockValidateAgents).toHaveBeenCalledWith([], { remote: true })
    })

    test('uses local validation when remote: false', async () => {
      mockValidateAgents.mockResolvedValue({
        success: true,
        value: {
          success: true,
          validationErrors: [],
          errorCount: 0,
        },
      })

      await validateAgentsWithNetworkHandling([], { remote: false })

      expect(mockValidateAgents).toHaveBeenCalledWith([], { remote: false })
    })

    test('handles undefined options', async () => {
      mockValidateAgents.mockResolvedValue({
        success: true,
        value: {
          success: true,
          validationErrors: [],
          errorCount: 0,
        },
      })

      await validateAgentsWithNetworkHandling([])

      expect(mockValidateAgents).toHaveBeenCalledWith([], undefined)
    })
  })

  describe('return value structure', () => {
    test('always returns the expected structure', async () => {
      mockValidateAgents.mockResolvedValue({
        success: true,
        value: {
          success: true,
          validationErrors: [],
          errorCount: 0,
        },
      })

      const result = await validateAgentsWithNetworkHandling([])

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('validationErrors')
      expect(result).toHaveProperty('networkError')
      expect(typeof result.success).toBe('boolean')
      expect(Array.isArray(result.validationErrors)).toBe(true)
    })

    test('network error structure is string or null', async () => {
      // Test with network error
      const networkError = new Error('Network issue') as any
      networkError.code = 'NETWORK_ERROR'
      mockValidateAgents.mockResolvedValue({
        success: false,
        error: networkError,
      })

      const networkResult = await validateAgentsWithNetworkHandling([])
      expect(typeof networkResult.networkError).toBe('string')

      // Test without network error
      mockValidateAgents.mockResolvedValue({
        success: true,
        value: {
          success: true,
          validationErrors: [],
          errorCount: 0,
        },
      })

      const successResult = await validateAgentsWithNetworkHandling([])
      expect(successResult.networkError).toBeNull()
    })
  })
})
