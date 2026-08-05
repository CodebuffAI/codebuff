import { afterEach, expect, spyOn, test } from 'bun:test'
import {
  FREEBUFF_GLM_V52_MODEL_ID,
  resolveFreebuffModelForAccessTier,
} from '@codebuff/common/constants/freebuff-models'

import {
  callFreebuffSession,
  mergeCompactActiveSession,
} from '../freebuff-session-api'

let fetchSpy: ReturnType<typeof spyOn> | undefined

afterEach(() => {
  fetchSpy?.mockRestore()
  fetchSpy = undefined
})

test('full-tier referral GLM reaches the session POST header unchanged', async () => {
  fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ status: 'none' }), {
      headers: { 'content-type': 'application/json' },
    }),
  )
  const resolved = resolveFreebuffModelForAccessTier(
    FREEBUFF_GLM_V52_MODEL_ID,
    'full',
  )

  await callFreebuffSession('POST', 'test-token', { model: resolved })

  expect(fetchSpy).toHaveBeenCalledTimes(1)
  const [, init] = fetchSpy.mock.calls[0]!
  expect(new Headers(init?.headers).get('x-freebuff-model')).toBe(
    FREEBUFF_GLM_V52_MODEL_ID,
  )
})

test('compact GET sends the compact-session header', async () => {
  fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({ status: 'active', model: 'model', instanceId: 'i1' }),
  )

  await callFreebuffSession('GET', 'test-token', {
    instanceId: 'i1',
    compact: true,
  })

  const [, init] = fetchSpy.mock.calls[0]!
  expect(new Headers(init?.headers).get('x-freebuff-compact-session')).toBe('1')
})

test('compact active state retains the admission quota snapshot', () => {
  const rateLimit = {
    model: 'model',
    limit: 5,
    period: 'pacific_day' as const,
    resetTimeZone: 'America/Los_Angeles' as const,
    resetAt: '2026-08-06T07:00:00.000Z',
    windowHours: 1,
    recentCount: 2,
    entitlementBreakdown: { base: 5, referral: 0, streak: 0 },
  }
  const merged = mergeCompactActiveSession(
    {
      status: 'active',
      accessTier: 'full',
      model: 'model',
      instanceId: 'i1',
      admittedAt: '2026-08-05T12:00:00.000Z',
      expiresAt: '2026-08-05T13:00:00.000Z',
      remainingMs: 1_000,
      rateLimit,
    },
    {
      status: 'active',
      accessTier: 'full',
      model: 'model',
      instanceId: 'i1',
      admittedAt: '2026-08-05T12:00:00.000Z',
      expiresAt: '2026-08-05T13:00:00.000Z',
      remainingMs: 500,
    },
  )

  expect(merged).toMatchObject({ remainingMs: 500, rateLimit })
})

test('compact state requests a full refresh instead of carrying quota across models', () => {
  const merged = mergeCompactActiveSession(
    {
      status: 'active',
      accessTier: 'full',
      model: 'old-model',
      instanceId: 'i1',
      admittedAt: '2026-08-05T12:00:00.000Z',
      expiresAt: '2026-08-05T13:00:00.000Z',
      remainingMs: 1_000,
      rateLimit: {
        model: 'old-model',
        limit: 5,
        period: 'pacific_day',
        resetTimeZone: 'America/Los_Angeles',
        resetAt: '2026-08-06T07:00:00.000Z',
        windowHours: 1,
        recentCount: 2,
        entitlementBreakdown: { base: 5, referral: 0, streak: 0 },
      },
    },
    {
      status: 'active',
      accessTier: 'full',
      model: 'new-model',
      instanceId: 'i1',
      admittedAt: '2026-08-05T12:00:00.000Z',
      expiresAt: '2026-08-05T13:00:00.000Z',
      remainingMs: 500,
    },
  )

  expect(merged).toBeNull()
})
