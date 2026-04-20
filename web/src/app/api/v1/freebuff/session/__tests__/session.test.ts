import { describe, expect, test } from 'bun:test'

import {
  deleteFreebuffSession,
  FREEBUFF_INSTANCE_HEADER,
  getFreebuffSession,
  postFreebuffSession,
} from '../_handlers'

import type { FreebuffSessionDeps } from '../_handlers'
import type { SessionDeps } from '@/server/free-session/public-api'
import type { InternalSessionRow } from '@/server/free-session/types'
import type { NextRequest } from 'next/server'

const DEFAULT_MODEL = 'z-ai/glm-5.1'

function makeReq(
  apiKey: string | null,
  opts: { instanceId?: string; cfCountry?: string } = {},
): NextRequest {
  const headers = new Headers()
  if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`)
  if (opts.instanceId) headers.set(FREEBUFF_INSTANCE_HEADER, opts.instanceId)
  if (opts.cfCountry) headers.set('cf-ipcountry', opts.cfCountry)
  return {
    headers,
  } as unknown as NextRequest
}

function makeSessionDeps(overrides: Partial<SessionDeps> = {}): SessionDeps & {
  rows: Map<string, InternalSessionRow>
} {
  const rows = new Map<string, InternalSessionRow>()
  const now = new Date('2026-04-17T12:00:00Z')
  let instanceCounter = 0
  return {
    rows,
    isWaitingRoomEnabled: () => true,
    graceMs: 30 * 60 * 1000,
    now: () => now,
    getSessionRow: async (userId) => rows.get(userId) ?? null,
    queueDepthsByModel: async () => {
      const out: Record<string, number> = {}
      for (const r of rows.values()) {
        if (r.status !== 'queued') continue
        out[r.model] = (out[r.model] ?? 0) + 1
      }
      return out
    },
    queuePositionFor: async () => 1,
    endSession: async (userId) => {
      rows.delete(userId)
    },
    joinOrTakeOver: async ({ userId, model, now }) => {
      const r: InternalSessionRow = {
        user_id: userId,
        status: 'queued',
        active_instance_id: `inst-${++instanceCounter}`,
        model,
        queued_at: now,
        admitted_at: null,
        expires_at: null,
        created_at: now,
        updated_at: now,
      }
      rows.set(userId, r)
      return r
    },
    ...overrides,
  }
}

const LOGGER = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

function makeDeps(sessionDeps: SessionDeps, userId: string | null): FreebuffSessionDeps {
  return {
    logger: LOGGER as unknown as FreebuffSessionDeps['logger'],
    getUserInfoFromApiKey: (async () => (userId ? { id: userId } : undefined)) as unknown as FreebuffSessionDeps['getUserInfoFromApiKey'],
    sessionDeps,
  }
}

describe('POST /api/v1/freebuff/session', () => {
  test('401 when Authorization header is missing', async () => {
    const sessionDeps = makeSessionDeps()
    const resp = await postFreebuffSession(makeReq(null), makeDeps(sessionDeps, null))
    expect(resp.status).toBe(401)
  })

  test('401 when API key is invalid', async () => {
    const sessionDeps = makeSessionDeps()
    const resp = await postFreebuffSession(makeReq('bad'), makeDeps(sessionDeps, null))
    expect(resp.status).toBe(401)
  })

  test('creates a queued session for authed user', async () => {
    const sessionDeps = makeSessionDeps()
    const resp = await postFreebuffSession(makeReq('ok'), makeDeps(sessionDeps, 'u1'))
    expect(resp.status).toBe(200)
    const body = await resp.json()
    expect(body.status).toBe('queued')
    expect(body.instanceId).toBe('inst-1')
  })

  test('returns disabled when waiting room flag is off', async () => {
    const sessionDeps = makeSessionDeps({ isWaitingRoomEnabled: () => false })
    const resp = await postFreebuffSession(makeReq('ok'), makeDeps(sessionDeps, 'u1'))
    const body = await resp.json()
    expect(body.status).toBe('disabled')
  })

  test('returns country_blocked without joining the queue for disallowed country', async () => {
    const sessionDeps = makeSessionDeps()
    const resp = await postFreebuffSession(
      makeReq('ok', { cfCountry: 'FR' }),
      makeDeps(sessionDeps, 'u1'),
    )
    // 403 (not 200) so older CLIs that don't know `country_blocked` fall into
    // their error-retry backoff instead of tight-polling.
    expect(resp.status).toBe(403)
    const body = await resp.json()
    expect(body.status).toBe('country_blocked')
    expect(body.countryCode).toBe('FR')
    expect(sessionDeps.rows.size).toBe(0)
  })

  test('allows queue entry for allowed country', async () => {
    const sessionDeps = makeSessionDeps()
    const resp = await postFreebuffSession(
      makeReq('ok', { cfCountry: 'US' }),
      makeDeps(sessionDeps, 'u1'),
    )
    const body = await resp.json()
    expect(body.status).toBe('queued')
  })
})

describe('GET /api/v1/freebuff/session', () => {
  test('returns { status: none } when user has no session', async () => {
    const sessionDeps = makeSessionDeps()
    const resp = await getFreebuffSession(makeReq('ok'), makeDeps(sessionDeps, 'u1'))
    expect(resp.status).toBe(200)
    const body = await resp.json()
    expect(body.status).toBe('none')
  })

  test('returns country_blocked for disallowed country on GET', async () => {
    const sessionDeps = makeSessionDeps()
    const resp = await getFreebuffSession(
      makeReq('ok', { cfCountry: 'FR' }),
      makeDeps(sessionDeps, 'u1'),
    )
    expect(resp.status).toBe(403)
    const body = await resp.json()
    expect(body.status).toBe('country_blocked')
    expect(body.countryCode).toBe('FR')
  })

  test('returns superseded when active row exists with mismatched instance id', async () => {
    const sessionDeps = makeSessionDeps()
    sessionDeps.rows.set('u1', {
      user_id: 'u1',
      status: 'active',
      active_instance_id: 'real-id',
      model: DEFAULT_MODEL,
      queued_at: new Date(),
      admitted_at: new Date(),
      expires_at: new Date(Date.now() + 60_000),
      created_at: new Date(),
      updated_at: new Date(),
    })
    const resp = await getFreebuffSession(
      makeReq('ok', { instanceId: 'stale-id' }),
      makeDeps(sessionDeps, 'u1'),
    )
    const body = await resp.json()
    expect(body.status).toBe('superseded')
  })
})

describe('DELETE /api/v1/freebuff/session', () => {
  test('ends the session', async () => {
    const sessionDeps = makeSessionDeps()
    // Pre-seed a row
    sessionDeps.rows.set('u1', {
      user_id: 'u1',
      status: 'active',
      active_instance_id: 'x',
      model: DEFAULT_MODEL,
      queued_at: new Date(),
      admitted_at: new Date(),
      expires_at: new Date(Date.now() + 60_000),
      created_at: new Date(),
      updated_at: new Date(),
    })
    const resp = await deleteFreebuffSession(makeReq('ok'), makeDeps(sessionDeps, 'u1'))
    expect(resp.status).toBe(200)
    expect(sessionDeps.rows.has('u1')).toBe(false)
  })
})
