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
