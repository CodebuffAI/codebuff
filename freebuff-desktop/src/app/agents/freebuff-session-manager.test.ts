import { afterEach, describe, expect, test } from 'bun:test'

import { FreebuffSessionError, FreebuffSessionManager } from './freebuff-session-manager'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

/** Stub global fetch with a fixed status + JSON body. */
function stubFetch(status: number, body: unknown = {}) {
  globalThis.fetch = (async () => {
    return {
      status,
      ok: status < 400,
      json: async () => body,
    } as Response
  }) as unknown as typeof fetch
}

describe('FreebuffSessionManager — auth rejection', () => {
  test('ensure: a 401 fires onAuthRejected and throws unauthenticated', async () => {
    stubFetch(401)
    let rejected = 0
    const mgr = new FreebuffSessionManager(() => 'stale-token', () => rejected++)
    const err = await mgr.ensure('t1', 'model-x').catch((e) => e)
    expect(err).toBeInstanceOf(FreebuffSessionError)
    expect((err as FreebuffSessionError).status).toBe('unauthenticated')
    expect((err as FreebuffSessionError).message).toContain('expired')
    expect(rejected).toBe(1)
  })

  test('ensure: an active admission does not fire onAuthRejected', async () => {
    stubFetch(200, { status: 'active', accessTier: 'full' })
    let rejected = 0
    const mgr = new FreebuffSessionManager(() => 'good-token', () => rejected++)
    const instanceId = await mgr.ensure('t1', 'model-x')
    expect(instanceId).toBeTruthy()
    expect(rejected).toBe(0)
  })

  test('fetchTier: a 401 fires onAuthRejected but still resolves with the cached tier', async () => {
    stubFetch(401)
    let rejected = 0
    const mgr = new FreebuffSessionManager(() => 'stale-token', () => rejected++)
    const info = await mgr.fetchTier()
    expect(info.accessTier).toBe('full')
    expect(rejected).toBe(1)
  })

  test('no token throws unauthenticated without firing onAuthRejected (nothing to revoke)', async () => {
    stubFetch(200, { status: 'active' })
    let rejected = 0
    const mgr = new FreebuffSessionManager(() => undefined, () => rejected++)
    const err = await mgr.ensure('t1', 'model-x').catch((e) => e)
    expect(err).toBeInstanceOf(FreebuffSessionError)
    expect((err as FreebuffSessionError).status).toBe('unauthenticated')
    expect(rejected).toBe(0)
  })
})

describe('FreebuffSessionManager — admission rejection copy', () => {
  const mgr = () => new FreebuffSessionManager(() => 'token')

  test('daily-pool rate_limited (full tier) suggests an unlimited model', async () => {
    stubFetch(429, {
      status: 'rate_limited',
      accessTier: 'full',
      model: 'deepseek/deepseek-v4-pro',
      resetAt: '2026-07-03T07:00:00.000Z',
    })
    const err = (await mgr().ensure('t1', 'deepseek/deepseek-v4-pro').catch((e) => e)) as FreebuffSessionError
    expect(err.status).toBe('rate_limited')
    expect(err.message).toContain('Daily limit reached')
    expect(err.message).toContain('unlimited model')
  })

  test('daily-pool rate_limited (limited tier) does NOT point at unlimited models', async () => {
    stubFetch(429, {
      status: 'rate_limited',
      accessTier: 'limited',
      model: 'deepseek/deepseek-v4-flash',
      resetAt: '2026-07-03T07:00:00.000Z',
    })
    const err = (await mgr().ensure('t1', 'deepseek/deepseek-v4-flash').catch((e) => e)) as FreebuffSessionError
    expect(err.status).toBe('rate_limited')
    expect(err.message).toContain('Daily free limit reached')
    expect(err.message).not.toContain('unlimited model')
  })

  test('concurrent_sessions backstop says "close a tab", not "daily limit"', async () => {
    stubFetch(429, {
      status: 'rate_limited',
      reason: 'concurrent_sessions',
      accessTier: 'full',
      model: 'deepseek/deepseek-v4-flash',
      limit: 8,
      resetAt: '2026-07-03T07:00:00.000Z',
    })
    const err = (await mgr().ensure('t1', 'deepseek/deepseek-v4-flash').catch((e) => e)) as FreebuffSessionError
    expect(err.status).toBe('rate_limited')
    expect(err.message).toContain('Too many tabs')
    expect(err.message).not.toContain('Daily')
  })

  test('premium_slot_taken (limited tier) explains the one-tab rule', async () => {
    stubFetch(409, {
      status: 'premium_slot_taken',
      accessTier: 'limited',
      requestedModel: 'deepseek/deepseek-v4-flash',
      currentModel: 'deepseek/deepseek-v4-flash',
      currentInstanceId: 'other-tab',
    })
    const err = (await mgr().ensure('t1', 'deepseek/deepseek-v4-flash').catch((e) => e)) as FreebuffSessionError
    expect(err.status).toBe('premium_slot_taken')
    expect(err.message).toContain('one tab at a time')
  })

  test('ensure and fetchTier cache the quota snapshot for the header badge', async () => {
    const m = mgr()
    stubFetch(200, {
      status: 'none',
      accessTier: 'full',
      rateLimitsByModel: {
        'deepseek/deepseek-v4-pro': { model: 'deepseek/deepseek-v4-pro', limit: 5, recentCount: 0 },
      },
    })
    await m.fetchTier()
    expect(m.getRateLimits()?.['deepseek/deepseek-v4-pro']?.recentCount).toBe(0)

    stubFetch(200, {
      status: 'active',
      accessTier: 'full',
      rateLimitsByModel: {
        'deepseek/deepseek-v4-pro': { model: 'deepseek/deepseek-v4-pro', limit: 5, recentCount: 2 },
      },
    })
    await m.ensure('t1', 'deepseek/deepseek-v4-pro')
    expect(m.getRateLimits()?.['deepseek/deepseek-v4-pro']?.recentCount).toBe(2)
  })

  test('a daily-pool reject folds its fresh count into EVERY cached entry (shared pool)', async () => {
    const m = mgr()
    // Prime the cache the way a real client would (startup tier probe).
    stubFetch(200, {
      status: 'none',
      accessTier: 'limited',
      rateLimitsByModel: {
        'deepseek/deepseek-v4-flash': { model: 'deepseek/deepseek-v4-flash', limit: 5, recentCount: 4 },
        'xiaomi/mimo-2.5': { model: 'xiaomi/mimo-2.5', limit: 5, recentCount: 4 },
      },
    })
    await m.fetchTier()
    stubFetch(429, {
      status: 'rate_limited',
      accessTier: 'limited',
      model: 'deepseek/deepseek-v4-flash',
      limit: 5,
      recentCount: 5.2,
      resetAt: '2026-07-03T07:00:00.000Z',
    })
    await m.ensure('t1', 'deepseek/deepseek-v4-flash').catch(() => {})
    // Both models draw from the one limited pool — both badges must flip.
    expect(m.getRateLimits()?.['deepseek/deepseek-v4-flash']?.recentCount).toBe(5.2)
    expect(m.getRateLimits()?.['xiaomi/mimo-2.5']?.recentCount).toBe(5.2)
  })

  test('a reject for a model with no cached quota entry does not invent one (old-server backstop)', async () => {
    const m = mgr()
    // Version skew: an old server's concurrency backstop reject has no
    // `reason` field — it must not fabricate a daily-quota entry for an
    // unmetered model.
    stubFetch(429, {
      status: 'rate_limited',
      model: 'deepseek/deepseek-v4-flash',
      limit: 8,
      recentCount: 8,
      resetAt: '2026-07-03T07:00:00.000Z',
    })
    await m.ensure('t1', 'deepseek/deepseek-v4-flash').catch(() => {})
    expect(m.getRateLimits()).toBeNull()
  })

  test('a concurrent_sessions reject does NOT touch the daily quota cache', async () => {
    const m = mgr()
    stubFetch(429, {
      status: 'rate_limited',
      reason: 'concurrent_sessions',
      model: 'deepseek/deepseek-v4-flash',
      limit: 8,
      recentCount: 8,
      resetAt: '2026-07-03T07:00:00.000Z',
    })
    await m.ensure('t1', 'deepseek/deepseek-v4-flash').catch(() => {})
    expect(m.getRateLimits()).toBeNull()
  })

  test('an unchanged quota map keeps the same reference (engine skips redundant broadcasts)', async () => {
    const m = mgr()
    const body = {
      status: 'active',
      accessTier: 'full',
      rateLimitsByModel: {
        'deepseek/deepseek-v4-pro': { model: 'deepseek/deepseek-v4-pro', limit: 5, recentCount: 1 },
      },
    }
    stubFetch(200, body)
    await m.ensure('t1', 'deepseek/deepseek-v4-pro')
    const first = m.getRateLimits()
    stubFetch(200, body) // same content, new object from res.json()
    await m.ensure('t1', 'deepseek/deepseek-v4-pro')
    expect(m.getRateLimits()).toBe(first)
  })

  test('premium_slot_taken (full tier) keeps the premium-model copy', async () => {
    stubFetch(409, {
      status: 'premium_slot_taken',
      accessTier: 'full',
      requestedModel: 'minimax/minimax-m3',
      currentModel: 'deepseek/deepseek-v4-pro',
      currentInstanceId: 'other-tab',
    })
    const err = (await mgr().ensure('t1', 'minimax/minimax-m3').catch((e) => e)) as FreebuffSessionError
    expect(err.status).toBe('premium_slot_taken')
    expect(err.message).toContain('premium model')
  })
})
