import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import {
  createFireworksRequestWithFallback,
  DEPLOYMENT_COOLDOWN_MS,
  isDeploymentHours,
  isDeploymentCoolingDown,
  markDeploymentScalingUp,
  resetDeploymentCooldown,
} from '../fireworks'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const STANDARD_MODEL_ID = 'accounts/fireworks/models/glm-5p1'
const KIMI_STANDARD_MODEL_ID = 'accounts/fireworks/models/kimi-k2p6'
const DEPLOYMENT_MODEL_ID = 'accounts/james-65d217/deployments/mjb4i7ea'
const TEST_DEPLOYMENT_MAP = {
  'z-ai/glm-5.1': DEPLOYMENT_MODEL_ID,
}
const IN_DEPLOYMENT_HOURS = new Date('2026-04-17T16:00:00Z') // Friday, 12pm ET / 9am PT
const BEFORE_DEPLOYMENT_HOURS = new Date('2026-04-17T12:59:00Z') // Friday, 8:59am ET
const AFTER_DEPLOYMENT_HOURS = new Date('2026-04-18T00:00:00Z') // Friday, 5pm PT
const WEEKDAY_AFTER_DEPLOYMENT_HOURS = new Date('2026-04-21T00:01:00Z') // Monday, 5:01pm PT
const WEEKEND_DEPLOYMENT_HOURS = new Date('2026-04-18T16:00:00Z') // Saturday

function createMockLogger(): Logger {
  return {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  }
}

describe('Fireworks deployment routing', () => {
  describe('deployment hours', () => {
    it('is active from 9am ET until before 5pm PT every day', () => {
      expect(isDeploymentHours(BEFORE_DEPLOYMENT_HOURS)).toBe(false)
      expect(isDeploymentHours(IN_DEPLOYMENT_HOURS)).toBe(true)
      expect(isDeploymentHours(AFTER_DEPLOYMENT_HOURS)).toBe(false)
      expect(isDeploymentHours(WEEKDAY_AFTER_DEPLOYMENT_HOURS)).toBe(false)
    })

    it('is active on weekends during deployment hours', () => {
      expect(isDeploymentHours(WEEKEND_DEPLOYMENT_HOURS)).toBe(true)
    })
  })

  describe('deployment cooldown', () => {
    beforeEach(() => {
      resetDeploymentCooldown()
    })

    afterEach(() => {
      resetDeploymentCooldown()
    })

    it('isDeploymentCoolingDown returns false initially', () => {
      expect(isDeploymentCoolingDown()).toBe(false)
    })

    it('isDeploymentCoolingDown returns true after markDeploymentScalingUp', () => {
      markDeploymentScalingUp()
      expect(isDeploymentCoolingDown()).toBe(true)
    })

    it('isDeploymentCoolingDown returns false after resetDeploymentCooldown', () => {
      markDeploymentScalingUp()
      expect(isDeploymentCoolingDown()).toBe(true)
      resetDeploymentCooldown()
      expect(isDeploymentCoolingDown()).toBe(false)
    })

    it('DEPLOYMENT_COOLDOWN_MS is 2 minutes', () => {
      expect(DEPLOYMENT_COOLDOWN_MS).toBe(2 * 60 * 1000)
    })
  })

  describe('createFireworksRequestWithFallback', () => {
    let logger: Logger

    beforeEach(() => {
      resetDeploymentCooldown()
      logger = createMockLogger()
    })

    afterEach(() => {
      resetDeploymentCooldown()
    })

    const minimalBody = {
      model: 'z-ai/glm-5.1',
      messages: [{ role: 'user' as const, content: 'test' }],
    }
    const kimiBody = {
      model: 'moonshotai/kimi-k2.6',
      messages: [{ role: 'user' as const, content: 'test' }],
    }
    const kimiLiteBody = {
      ...kimiBody,
      codebuff_metadata: { cost_mode: 'lite' },
    }
    const liteBody = {
      ...minimalBody,
      codebuff_metadata: { cost_mode: 'lite' },
    }

    it('uses standard API when custom deployment is disabled', async () => {
      const fetchCalls: string[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchCalls.push(body.model)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      ) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: minimalBody as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: false,
        now: IN_DEPLOYMENT_HOURS,
        sessionId: 'test-user-id',
      })

      expect(response.status).toBe(200)
      expect(fetchCalls).toHaveLength(1)
      expect(fetchCalls[0]).toBe(STANDARD_MODEL_ID)
    })

    it('uses standard API for GLM during hours when no deployment is mapped', async () => {
      const fetchCalls: string[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchCalls.push(body.model)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      ) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: minimalBody as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: true,
        sessionId: 'test-user-id',
        now: IN_DEPLOYMENT_HOURS,
      })

      expect(response.status).toBe(200)
      expect(fetchCalls).toEqual([STANDARD_MODEL_ID])
    })

    it('uses serverless API for Kimi during hours without a deployment', async () => {
      const fetchCalls: string[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchCalls.push(body.model)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      ) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: kimiBody as never,
        originalModel: 'moonshotai/kimi-k2.6',
        fetch: mockFetch,
        logger,
        useCustomDeployment: true,
        deploymentMap: {
          'z-ai/glm-5.1': DEPLOYMENT_MODEL_ID,
        },
        sessionId: 'test-user-id',
        now: IN_DEPLOYMENT_HOURS,
      })

      expect(response.status).toBe(200)
      expect(fetchCalls).toEqual([KIMI_STANDARD_MODEL_ID])
    })

    it('keeps Kimi unavailable outside hours when no deployment is mapped', async () => {
      const mockFetch = mock(async () => {
        throw new Error('should not fetch outside deployment hours')
      }) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: kimiBody as never,
        originalModel: 'moonshotai/kimi-k2.6',
        fetch: mockFetch,
        logger,
        useCustomDeployment: true,
        deploymentMap: {
          'z-ai/glm-5.1': DEPLOYMENT_MODEL_ID,
        },
        sessionId: 'test-user-id',
        now: BEFORE_DEPLOYMENT_HOURS,
      })

      expect(response.status).toBe(503)
      const body = await response.json()
      expect(body.error.code).toBe('DEPLOYMENT_OUTSIDE_HOURS')
    })

    it('keeps GLM unavailable outside hours when no deployment is mapped', async () => {
      const mockFetch = mock(async () => {
        throw new Error('should not fetch outside deployment hours')
      }) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: minimalBody as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: true,
        sessionId: 'test-user-id',
        now: BEFORE_DEPLOYMENT_HOURS,
      })

      expect(response.status).toBe(503)
      const body = await response.json()
      expect(body.error.code).toBe('DEPLOYMENT_OUTSIDE_HOURS')
    })

    it('tries custom deployment during deployment hours', async () => {
      const fetchCalls: string[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchCalls.push(body.model)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      ) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: minimalBody as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: true,
        deploymentMap: TEST_DEPLOYMENT_MAP,
        sessionId: 'test-user-id',
        now: IN_DEPLOYMENT_HOURS,
      })

      expect(response.status).toBe(200)
      expect(fetchCalls).toHaveLength(1)
      expect(fetchCalls[0]).toBe(DEPLOYMENT_MODEL_ID)
    })

    it('returns deployment 503 on DEPLOYMENT_SCALING_UP without serverless fallback', async () => {
      const fetchCalls: string[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchCalls.push(body.model)
          return new Response(
            JSON.stringify({
              error: {
                message:
                  'Deployment is currently scaled to zero and is scaling up. Please retry your request in a few minutes.',
                code: 'DEPLOYMENT_SCALING_UP',
                type: 'error',
              },
            }),
            { status: 503, statusText: 'Service Unavailable' },
          )
        },
      ) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: minimalBody as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: true,
        deploymentMap: TEST_DEPLOYMENT_MAP,
        sessionId: 'test-user-id',
        now: IN_DEPLOYMENT_HOURS,
      })

      expect(response.status).toBe(503)
      expect(fetchCalls).toEqual([DEPLOYMENT_MODEL_ID])
      expect(isDeploymentCoolingDown()).toBe(true)
    })

    it('returns non-scaling deployment 503 without serverless fallback', async () => {
      const fetchCalls: string[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchCalls.push(body.model)
          return new Response(
            JSON.stringify({
              error: {
                message: 'Service temporarily unavailable',
                code: 'SERVICE_UNAVAILABLE',
                type: 'error',
              },
            }),
            { status: 503, statusText: 'Service Unavailable' },
          )
        },
      ) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: minimalBody as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: true,
        deploymentMap: TEST_DEPLOYMENT_MAP,
        sessionId: 'test-user-id',
        now: IN_DEPLOYMENT_HOURS,
      })

      expect(response.status).toBe(503)
      expect(fetchCalls).toEqual([DEPLOYMENT_MODEL_ID])
      expect(isDeploymentCoolingDown()).toBe(false)
    })

    it('returns 500 Internal Error from deployment without serverless fallback', async () => {
      const fetchCalls: string[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchCalls.push(body.model)
          return new Response(JSON.stringify({ error: 'Internal error' }), {
            status: 500,
            statusText: 'Internal Server Error',
          })
        },
      ) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: minimalBody as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: true,
        deploymentMap: TEST_DEPLOYMENT_MAP,
        sessionId: 'test-user-id',
        now: IN_DEPLOYMENT_HOURS,
      })

      expect(response.status).toBe(500)
      expect(fetchCalls).toEqual([DEPLOYMENT_MODEL_ID])
      expect(isDeploymentCoolingDown()).toBe(false)
    })

    it('returns cooldown error without serverless fallback', async () => {
      markDeploymentScalingUp()

      const fetchCalls: string[] = []
      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchCalls.push(body.model)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      ) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: minimalBody as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: true,
        deploymentMap: TEST_DEPLOYMENT_MAP,
        sessionId: 'test-user-id',
        now: IN_DEPLOYMENT_HOURS,
      })

      expect(response.status).toBe(503)
      expect(fetchCalls).toHaveLength(0)
    })

    it('uses standard API for models without a custom deployment', async () => {
      const fetchCalls: string[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchCalls.push(body.model)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      ) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: { ...minimalBody, model: 'some-other/model' } as never,
        originalModel: 'some-other/model',
        fetch: mockFetch,
        logger,
        useCustomDeployment: true,
        deploymentMap: TEST_DEPLOYMENT_MAP,
        sessionId: 'test-user-id',
        now: BEFORE_DEPLOYMENT_HOURS,
      })

      expect(response.status).toBe(200)
      expect(fetchCalls).toHaveLength(1)
      // Model without mapping falls through to the original model
      expect(fetchCalls[0]).toBe('some-other/model')
    })

    it('returns an availability error for deployment models outside hours', async () => {
      const mockFetch = mock(async () => {
        throw new Error('should not fetch outside deployment hours')
      }) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: minimalBody as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: true,
        deploymentMap: TEST_DEPLOYMENT_MAP,
        sessionId: 'test-user-id',
        now: BEFORE_DEPLOYMENT_HOURS,
      })

      expect(response.status).toBe(503)
      const body = await response.json()
      expect(body.error.code).toBe('DEPLOYMENT_OUTSIDE_HOURS')
    })

    it('falls back to the standard Fireworks API for Kimi lite mode outside deployment hours', async () => {
      const fetchCalls: string[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchCalls.push(body.model)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      ) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: kimiLiteBody as never,
        originalModel: 'moonshotai/kimi-k2.6',
        fetch: mockFetch,
        logger,
        useCustomDeployment: true,
        deploymentMap: TEST_DEPLOYMENT_MAP,
        sessionId: 'test-user-id',
        now: BEFORE_DEPLOYMENT_HOURS,
      })

      expect(response.status).toBe(200)
      expect(fetchCalls).toEqual([KIMI_STANDARD_MODEL_ID])
    })

    it('returns non-5xx responses from deployment without fallback (e.g. 429)', async () => {
      const fetchCalls: string[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchCalls.push(body.model)
          return new Response(
            JSON.stringify({ error: { message: 'Rate limited' } }),
            { status: 429, statusText: 'Too Many Requests' },
          )
        },
      ) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: minimalBody as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: true,
        deploymentMap: TEST_DEPLOYMENT_MAP,
        sessionId: 'test-user-id',
        now: IN_DEPLOYMENT_HOURS,
      })

      // Non-5xx errors from deployment are returned as-is (caller handles them)
      expect(response.status).toBe(429)
      expect(fetchCalls).toHaveLength(1)
      expect(fetchCalls[0]).toBe(DEPLOYMENT_MODEL_ID)
    })

    it('transforms reasoning to reasoning_effort (defaults to medium)', async () => {
      const fetchedBodies: Record<string, unknown>[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchedBodies.push(body)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      ) as unknown as typeof globalThis.fetch

      await createFireworksRequestWithFallback({
        body: {
          ...minimalBody,
          reasoning: { enabled: true },
        } as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: false,
        now: IN_DEPLOYMENT_HOURS,
        sessionId: 'test-user-id',
      })

      expect(fetchedBodies).toHaveLength(1)
      expect(fetchedBodies[0].reasoning_effort).toBe('medium')
      expect(fetchedBodies[0].reasoning).toBeUndefined()
    })

    it('uses reasoning.effort value when specified', async () => {
      const fetchedBodies: Record<string, unknown>[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchedBodies.push(body)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      ) as unknown as typeof globalThis.fetch

      await createFireworksRequestWithFallback({
        body: {
          ...minimalBody,
          reasoning: { effort: 'high' },
        } as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: false,
        now: IN_DEPLOYMENT_HOURS,
        sessionId: 'test-user-id',
      })

      expect(fetchedBodies).toHaveLength(1)
      expect(fetchedBodies[0].reasoning_effort).toBe('high')
      expect(fetchedBodies[0].reasoning).toBeUndefined()
    })

    it('skips reasoning_effort when reasoning.enabled is false', async () => {
      const fetchedBodies: Record<string, unknown>[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchedBodies.push(body)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      ) as unknown as typeof globalThis.fetch

      await createFireworksRequestWithFallback({
        body: {
          ...minimalBody,
          reasoning: { enabled: false, effort: 'high' },
        } as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: false,
        now: IN_DEPLOYMENT_HOURS,
        sessionId: 'test-user-id',
      })

      expect(fetchedBodies).toHaveLength(1)
      expect(fetchedBodies[0].reasoning_effort).toBeUndefined()
      expect(fetchedBodies[0].reasoning).toBeUndefined()
    })

    it('preserves reasoning_effort when tools are present (Fireworks supports both)', async () => {
      const fetchedBodies: Record<string, unknown>[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchedBodies.push(body)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      ) as unknown as typeof globalThis.fetch

      await createFireworksRequestWithFallback({
        body: {
          ...minimalBody,
          reasoning: { effort: 'high' },
          tools: [
            { type: 'function', function: { name: 'test', arguments: '{}' } },
          ],
        } as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: false,
        now: IN_DEPLOYMENT_HOURS,
        sessionId: 'test-user-id',
      })

      expect(fetchedBodies).toHaveLength(1)
      expect(fetchedBodies[0].reasoning_effort).toBe('high')
      expect(fetchedBodies[0].reasoning).toBeUndefined()
    })

    it('passes through reasoning_effort when set directly without reasoning object', async () => {
      const fetchedBodies: Record<string, unknown>[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchedBodies.push(body)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      ) as unknown as typeof globalThis.fetch

      await createFireworksRequestWithFallback({
        body: {
          ...minimalBody,
          reasoning_effort: 'low',
        } as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: false,
        now: IN_DEPLOYMENT_HOURS,
        sessionId: 'test-user-id',
      })

      expect(fetchedBodies).toHaveLength(1)
      expect(fetchedBodies[0].reasoning_effort).toBe('low')
    })

    it('preserves directly-set reasoning_effort when tools are present', async () => {
      const fetchedBodies: Record<string, unknown>[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchedBodies.push(body)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      ) as unknown as typeof globalThis.fetch

      await createFireworksRequestWithFallback({
        body: {
          ...minimalBody,
          reasoning_effort: 'low',
          tools: [
            { type: 'function', function: { name: 'test', arguments: '{}' } },
          ],
        } as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: false,
        now: IN_DEPLOYMENT_HOURS,
        sessionId: 'test-user-id',
      })

      expect(fetchedBodies).toHaveLength(1)
      expect(fetchedBodies[0].reasoning_effort).toBe('low')
    })

    it('logs when trying deployment and when deployment returns 5xx', async () => {
      const mockFetch = mock(async () => {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Scaling up',
              code: 'DEPLOYMENT_SCALING_UP',
              type: 'error',
            },
          }),
          { status: 503, statusText: 'Service Unavailable' },
        )
      }) as unknown as typeof globalThis.fetch

      await createFireworksRequestWithFallback({
        body: minimalBody as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: true,
        deploymentMap: TEST_DEPLOYMENT_MAP,
        sessionId: 'test-user-id',
        now: IN_DEPLOYMENT_HOURS,
      })

      expect(logger.info).toHaveBeenCalledTimes(2)
    })

    it('falls back to the standard Fireworks API in lite mode after deployment scaling 503', async () => {
      const fetchCalls: string[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchCalls.push(body.model)
          if (fetchCalls.length === 1) {
            return new Response(
              JSON.stringify({
                error: {
                  message:
                    'Deployment is currently scaled to zero and is scaling up. Please retry your request in a few minutes.',
                  code: 'DEPLOYMENT_SCALING_UP',
                  type: 'error',
                },
              }),
              { status: 503, statusText: 'Service Unavailable' },
            )
          }
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      ) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: liteBody as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: true,
        deploymentMap: TEST_DEPLOYMENT_MAP,
        sessionId: 'test-user-id',
        now: IN_DEPLOYMENT_HOURS,
      })

      expect(response.status).toBe(200)
      expect(fetchCalls).toEqual([DEPLOYMENT_MODEL_ID, STANDARD_MODEL_ID])
      expect(isDeploymentCoolingDown()).toBe(true)
    })

    it('falls back to the standard Fireworks API in lite mode during deployment cooldown', async () => {
      markDeploymentScalingUp()

      const fetchCalls: string[] = []
      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchCalls.push(body.model)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      ) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: liteBody as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: true,
        deploymentMap: TEST_DEPLOYMENT_MAP,
        sessionId: 'test-user-id',
        now: IN_DEPLOYMENT_HOURS,
      })

      expect(response.status).toBe(200)
      expect(fetchCalls).toEqual([STANDARD_MODEL_ID])
    })

    it('falls back to the standard Fireworks API in lite mode when the deployment request throws', async () => {
      const fetchCalls: string[] = []

      const mockFetch = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(init?.body as string)
          fetchCalls.push(body.model)
          if (fetchCalls.length === 1) {
            throw new Error('socket hang up')
          }
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      ) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: liteBody as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: true,
        deploymentMap: TEST_DEPLOYMENT_MAP,
        sessionId: 'test-user-id',
        now: IN_DEPLOYMENT_HOURS,
      })

      expect(response.status).toBe(200)
      expect(fetchCalls).toEqual([DEPLOYMENT_MODEL_ID, STANDARD_MODEL_ID])
      expect(logger.warn).toHaveBeenCalledTimes(1)
    })
  })
})
