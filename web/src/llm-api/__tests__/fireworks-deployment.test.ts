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

const STANDARD_MODEL_ID = 'accounts/fireworks/models/minimax-m2p5'
const DEPLOYMENT_MODEL_ID = 'accounts/james-65d217/deployments/lnfid5h9'

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
      model: 'minimax/minimax-m2.5',
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
        originalModel: 'minimax/minimax-m2.5',
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
          originalModel: 'minimax/minimax-m2.5',
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
          originalModel: 'minimax/minimax-m2.5',
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

    it('throws FireworksError on non-scaling 503 from deployment', async () => {
      const spy = spyDeploymentHours(true)

      const mockFetch = mock(async () => {
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
      }) as unknown as typeof globalThis.fetch

      try {
        await expect(
          createFireworksRequestWithFallback({
            body: minimalBody as never,
            originalModel: 'minimax/minimax-m2.5',
            fetch: mockFetch,
            logger,
            useCustomDeployment: true,
            sessionId: 'test-user-id',
          }),
        ).rejects.toBeInstanceOf(FireworksError)
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
          originalModel: 'minimax/minimax-m2.5',
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

    it('returns non-200 responses from deployment without fallback (non-503)', async () => {
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
          originalModel: 'minimax/minimax-m2.5',
          fetch: mockFetch,
          logger,
          useCustomDeployment: true,
          sessionId: 'test-user-id',
        })

        // Non-503 errors from deployment are returned as-is (caller handles them)
        expect(response.status).toBe(429)
        expect(fetchCalls).toHaveLength(1)
        expect(fetchCalls[0]).toBe(DEPLOYMENT_MODEL_ID)
      } finally {
        spy.restore()
      }
    })

    it('logs when trying deployment and when falling back', async () => {
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
          originalModel: 'minimax/minimax-m2.5',
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
