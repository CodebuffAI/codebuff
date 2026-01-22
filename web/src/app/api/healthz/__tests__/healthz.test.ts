import { describe, test, expect } from 'bun:test'

import { getHealthz } from '../_get'

import type { HealthzDeps } from '../_get'

describe('/api/healthz route', () => {
  describe('Success cases', () => {
    test('returns 200 with status ok and agent count', async () => {
      const mockGetAgentCount = async () => 42

      const response = await getHealthz({ getAgentCount: mockGetAgentCount })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.status).toBe('ok')
      expect(body.cached_agents).toBe(42)
      expect(body.timestamp).toBeDefined()
      expect(typeof body.timestamp).toBe('string')
    })

    test('returns correct count when no agents exist', async () => {
      const mockGetAgentCount = async () => 0

      const response = await getHealthz({ getAgentCount: mockGetAgentCount })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.status).toBe('ok')
      expect(body.cached_agents).toBe(0)
    })

    test('returns correct count for large number of agents', async () => {
      const mockGetAgentCount = async () => 10000

      const response = await getHealthz({ getAgentCount: mockGetAgentCount })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.status).toBe('ok')
      expect(body.cached_agents).toBe(10000)
    })
  })

  describe('Error handling', () => {
    test('returns 200 with error flag when getAgentCount throws', async () => {
      const mockGetAgentCount = async () => {
        throw new Error('Database connection failed')
      }

      const response = await getHealthz({ getAgentCount: mockGetAgentCount })

      // Should still return 200 so health check passes
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.status).toBe('ok')
      expect(body.agent_count_error).toBe(true)
      expect(body.error).toBe('Database connection failed')
      expect(body.cached_agents).toBeUndefined()
    })

    test('handles non-Error exceptions gracefully', async () => {
      const mockGetAgentCount = async () => {
        throw 'String error'
      }

      const response = await getHealthz({ getAgentCount: mockGetAgentCount })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.status).toBe('ok')
      expect(body.agent_count_error).toBe(true)
      expect(body.error).toBe('Unknown error')
    })
  })

  describe('Response format', () => {
    test('response has correct Content-Type header', async () => {
      const mockGetAgentCount = async () => 100

      const response = await getHealthz({ getAgentCount: mockGetAgentCount })

      expect(response.headers.get('content-type')).toContain('application/json')
    })

    test('timestamp is in ISO format', async () => {
      const mockGetAgentCount = async () => 50

      const response = await getHealthz({ getAgentCount: mockGetAgentCount })
      const body = await response.json()

      // Verify timestamp is valid ISO date
      const timestamp = new Date(body.timestamp)
      expect(timestamp.toString()).not.toBe('Invalid Date')
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })
  })
})
