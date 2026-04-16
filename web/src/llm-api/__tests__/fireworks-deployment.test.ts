import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import {
  createFireworksRequestWithFallback,
  DEPLOYMENT_COOLDOWN_MS,
  FireworksError,
  isDeploymentCoolingDown,
  markDeploymentScalingUp,
  resetDeploymentCooldown,
} from '../fireworks'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const STANDARD_MODEL_ID = 'accounts/fireworks/models/glm-5p1'
const DEPLOYMENT_MODEL_ID = 'accounts/james-65d217/deployments/mjb4i7ea'

function createMockLogger(): Logger {
  return {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  }
}

// Helper: create a Date at a specific ET hour using a known EDT date (June 2025, UTC-4)
function dateAtEtHour(hour: number): Date {
  // June 15, 2025 is EDT (UTC-4), so ET hour H = UTC hour H+4
  const utcHour = hour + 4
  if (utcHour < 24) {
    return new Date(`2025-06-15T${String(utcHour).padStart(2, '0')}:30:00Z`)
  }
  // Wraps to next day
  return new Date(`2025-06-16T${String(utcHour - 24).padStart(2, '0')}:30:00Z`)
}

describe('Fireworks deployment routing', () => {
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

    function spyDeploymentHours(inHours: boolean) {
      // Control isDeploymentHours by mocking Date.prototype.toLocaleString
      // When called with the ET timezone options, return an hour inside or outside the window
      const original = Date.prototype.toLocaleString
      const spy = {
        restore: () => {
          Date.prototype.toLocaleString = original
        },
      }
      Date.prototype.toLocaleString = function (
        this: Date,
        ...args: Parameters<Date['toLocaleString']>
      ) {
        const options = args[1] as Intl.DateTimeFormatOptions | undefined
        if (options?.timeZone === 'America/New_York' && options?.hour === 'numeric') {
          return inHours ? '14' : '3'
        }
        return original.apply(this, args)
      }
      return spy
    }

    it('uses standard API when custom deployment is disabled', async () => {
      const fetchCalls: string[] = []

      const mockFetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string)
        fetchCalls.push(body.model)
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }) as unknown as typeof globalThis.fetch

      const response = await createFireworksRequestWithFallback({
        body: minimalBody as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: false,
        sessionId: 'test-user-id',
      })

      expect(response.status).toBe(200)
      expect(fetchCalls).toHaveLength(1)
      expect(fetchCalls[0]).toBe(STANDARD_MODEL_ID)
    })

    it('tries custom deployment during deployment hours', async () => {
      const spy = spyDeploymentHours(true)
      const fetchCalls: string[] = []

      const mockFetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string)
        fetchCalls.push(body.model)
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }) as unknown as typeof globalThis.fetch

      try {
        const response = await createFireworksRequestWithFallback({
          body: minimalBody as never,
          originalModel: 'z-ai/glm-5.1',
          fetch: mockFetch,
          logger,
          useCustomDeployment: true,
          sessionId: 'test-user-id',
        })

        expect(response.status).toBe(200)
        expect(fetchCalls).toHaveLength(1)
        expect(fetchCalls[0]).toBe(DEPLOYMENT_MODEL_ID)
      } finally {
        spy.restore()
      }
    })

    it('falls back to standard API on 503 DEPLOYMENT_SCALING_UP', async () => {
      const spy = spyDeploymentHours(true)
      const fetchCalls: string[] = []
      let callCount = 0

      const mockFetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string)
        fetchCalls.push(body.model)
        callCount++

        if (callCount === 1) {
          return new Response(
            JSON.stringify({
              error: {
                message: 'Deployment is currently scaled to zero and is scaling up. Please retry your request in a few minutes.',
                code: 'DEPLOYMENT_SCALING_UP',
                type: 'error',
              },
            }),
            { status: 503, statusText: 'Service Unavailable' },
          )
        }

        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }) as unknown as typeof globalThis.fetch

      try {
        const response = await createFireworksRequestWithFallback({
          body: minimalBody as never,
          originalModel: 'z-ai/glm-5.1',
          fetch: mockFetch,
          logger,
          useCustomDeployment: true,
          sessionId: 'test-user-id',
        })

        expect(response.status).toBe(200)
        expect(fetchCalls).toHaveLength(2)
        expect(fetchCalls[0]).toBe(DEPLOYMENT_MODEL_ID)
        expect(fetchCalls[1]).toBe(STANDARD_MODEL_ID)
        // Verify cooldown was activated
        expect(isDeploymentCoolingDown()).toBe(true)
      } finally {
        spy.restore()
      }
    })

    it('falls back to standard API on non-scaling 503 from deployment', async () => {
      const spy = spyDeploymentHours(true)
      const fetchCalls: string[] = []
      let callCount = 0

      const mockFetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string)
        fetchCalls.push(body.model)
        callCount++

        if (callCount === 1) {
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
        }

        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }) as unknown as typeof globalThis.fetch

      try {
        const response = await createFireworksRequestWithFallback({
          body: minimalBody as never,
          originalModel: 'z-ai/glm-5.1',
          fetch: mockFetch,
          logger,
          useCustomDeployment: true,
          sessionId: 'test-user-id',
        })

        expect(response.status).toBe(200)
        expect(fetchCalls).toHaveLength(2)
        expect(fetchCalls[0]).toBe(DEPLOYMENT_MODEL_ID)
        expect(fetchCalls[1]).toBe(STANDARD_MODEL_ID)
        // Non-scaling 503 should NOT activate the cooldown
        expect(isDeploymentCoolingDown()).toBe(false)
      } finally {
        spy.restore()
      }
    })

    it('falls back to standard API on 500 Internal Error from deployment', async () => {
      const spy = spyDeploymentHours(true)
      const fetchCalls: string[] = []
      let callCount = 0

      const mockFetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string)
        fetchCalls.push(body.model)
        callCount++

        if (callCount === 1) {
          return new Response(
            JSON.stringify({ error: 'Internal error' }),
            { status: 500, statusText: 'Internal Server Error' },
          )
        }

        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }) as unknown as typeof globalThis.fetch

      try {
        const response = await createFireworksRequestWithFallback({
          body: minimalBody as never,
          originalModel: 'z-ai/glm-5.1',
          fetch: mockFetch,
          logger,
          useCustomDeployment: true,
          sessionId: 'test-user-id',
        })

        expect(response.status).toBe(200)
        expect(fetchCalls).toHaveLength(2)
        expect(fetchCalls[0]).toBe(DEPLOYMENT_MODEL_ID)
        expect(fetchCalls[1]).toBe(STANDARD_MODEL_ID)
        expect(isDeploymentCoolingDown()).toBe(false)
      } finally {
        spy.restore()
      }
    })

    it('skips deployment during cooldown and goes straight to standard API', async () => {
      const spy = spyDeploymentHours(true)
      markDeploymentScalingUp()

      const fetchCalls: string[] = []
      const mockFetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string)
        fetchCalls.push(body.model)
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }) as unknown as typeof globalThis.fetch

      try {
        const response = await createFireworksRequestWithFallback({
          body: minimalBody as never,
          originalModel: 'z-ai/glm-5.1',
          fetch: mockFetch,
          logger,
          useCustomDeployment: true,
          sessionId: 'test-user-id',
        })

        expect(response.status).toBe(200)
        expect(fetchCalls).toHaveLength(1)
        expect(fetchCalls[0]).toBe(STANDARD_MODEL_ID)
      } finally {
        spy.restore()
      }
    })

    it('uses standard API for models without a custom deployment', async () => {
      const spy = spyDeploymentHours(true)
      const fetchCalls: string[] = []

      const mockFetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string)
        fetchCalls.push(body.model)
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }) as unknown as typeof globalThis.fetch

      try {
        const response = await createFireworksRequestWithFallback({
          body: { ...minimalBody, model: 'some-other/model' } as never,
          originalModel: 'some-other/model',
          fetch: mockFetch,
          logger,
          useCustomDeployment: true,
          sessionId: 'test-user-id',
        })

        expect(response.status).toBe(200)
        expect(fetchCalls).toHaveLength(1)
        // Model without mapping falls through to the original model
        expect(fetchCalls[0]).toBe('some-other/model')
      } finally {
        spy.restore()
      }
    })

    it('returns non-5xx responses from deployment without fallback (e.g. 429)', async () => {
      const spy = spyDeploymentHours(true)
      const fetchCalls: string[] = []

      const mockFetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string)
        fetchCalls.push(body.model)
        return new Response(
          JSON.stringify({ error: { message: 'Rate limited' } }),
          { status: 429, statusText: 'Too Many Requests' },
        )
      }) as unknown as typeof globalThis.fetch

      try {
        const response = await createFireworksRequestWithFallback({
          body: minimalBody as never,
          originalModel: 'z-ai/glm-5.1',
          fetch: mockFetch,
          logger,
          useCustomDeployment: true,
          sessionId: 'test-user-id',
        })

        // Non-5xx errors from deployment are returned as-is (caller handles them)
        expect(response.status).toBe(429)
        expect(fetchCalls).toHaveLength(1)
        expect(fetchCalls[0]).toBe(DEPLOYMENT_MODEL_ID)
      } finally {
        spy.restore()
      }
    })

    it('transforms reasoning to reasoning_effort (defaults to medium)', async () => {
      const fetchedBodies: Record<string, unknown>[] = []

      const mockFetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string)
        fetchedBodies.push(body)
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }) as unknown as typeof globalThis.fetch

      await createFireworksRequestWithFallback({
        body: {
          ...minimalBody,
          reasoning: { enabled: true },
        } as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: false,
        sessionId: 'test-user-id',
      })

      expect(fetchedBodies).toHaveLength(1)
      expect(fetchedBodies[0].reasoning_effort).toBe('medium')
      expect(fetchedBodies[0].reasoning).toBeUndefined()
    })

    it('uses reasoning.effort value when specified', async () => {
      const fetchedBodies: Record<string, unknown>[] = []

      const mockFetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string)
        fetchedBodies.push(body)
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }) as unknown as typeof globalThis.fetch

      await createFireworksRequestWithFallback({
        body: {
          ...minimalBody,
          reasoning: { effort: 'high' },
        } as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: false,
        sessionId: 'test-user-id',
      })

      expect(fetchedBodies).toHaveLength(1)
      expect(fetchedBodies[0].reasoning_effort).toBe('high')
      expect(fetchedBodies[0].reasoning).toBeUndefined()
    })

    it('skips reasoning_effort when reasoning.enabled is false', async () => {
      const fetchedBodies: Record<string, unknown>[] = []

      const mockFetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string)
        fetchedBodies.push(body)
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }) as unknown as typeof globalThis.fetch

      await createFireworksRequestWithFallback({
        body: {
          ...minimalBody,
          reasoning: { enabled: false, effort: 'high' },
        } as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: false,
        sessionId: 'test-user-id',
      })

      expect(fetchedBodies).toHaveLength(1)
      expect(fetchedBodies[0].reasoning_effort).toBeUndefined()
      expect(fetchedBodies[0].reasoning).toBeUndefined()
    })

    it('preserves reasoning_effort when tools are present (Fireworks supports both)', async () => {
      const fetchedBodies: Record<string, unknown>[] = []

      const mockFetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string)
        fetchedBodies.push(body)
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }) as unknown as typeof globalThis.fetch

      await createFireworksRequestWithFallback({
        body: {
          ...minimalBody,
          reasoning: { effort: 'high' },
          tools: [{ type: 'function', function: { name: 'test', arguments: '{}' } }],
        } as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: false,
        sessionId: 'test-user-id',
      })

      expect(fetchedBodies).toHaveLength(1)
      expect(fetchedBodies[0].reasoning_effort).toBe('high')
      expect(fetchedBodies[0].reasoning).toBeUndefined()
    })

    it('passes through reasoning_effort when set directly without reasoning object', async () => {
      const fetchedBodies: Record<string, unknown>[] = []

      const mockFetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string)
        fetchedBodies.push(body)
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }) as unknown as typeof globalThis.fetch

      await createFireworksRequestWithFallback({
        body: {
          ...minimalBody,
          reasoning_effort: 'low',
        } as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: false,
        sessionId: 'test-user-id',
      })

      expect(fetchedBodies).toHaveLength(1)
      expect(fetchedBodies[0].reasoning_effort).toBe('low')
    })

    it('preserves directly-set reasoning_effort when tools are present', async () => {
      const fetchedBodies: Record<string, unknown>[] = []

      const mockFetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string)
        fetchedBodies.push(body)
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }) as unknown as typeof globalThis.fetch

      await createFireworksRequestWithFallback({
        body: {
          ...minimalBody,
          reasoning_effort: 'low',
          tools: [{ type: 'function', function: { name: 'test', arguments: '{}' } }],
        } as never,
        originalModel: 'z-ai/glm-5.1',
        fetch: mockFetch,
        logger,
        useCustomDeployment: false,
        sessionId: 'test-user-id',
      })

      expect(fetchedBodies).toHaveLength(1)
      expect(fetchedBodies[0].reasoning_effort).toBe('low')
    })

    it('logs when trying deployment and when falling back on 5xx', async () => {
      const spy = spyDeploymentHours(true)
      let callCount = 0

      const mockFetch = mock(async () => {
        callCount++
        if (callCount === 1) {
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
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }) as unknown as typeof globalThis.fetch

      try {
        await createFireworksRequestWithFallback({
          body: minimalBody as never,
          originalModel: 'z-ai/glm-5.1',
          fetch: mockFetch,
          logger,
          useCustomDeployment: true,
          sessionId: 'test-user-id',
        })

        expect(logger.info).toHaveBeenCalledTimes(2)
      } finally {
        spy.restore()
      }
    })
  })
})
