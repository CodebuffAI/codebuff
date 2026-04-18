import { beforeEach, describe, expect, test } from 'bun:test'

import {
  checkSessionAdmissible,
  endUserSession,
  getSessionState,
  requestSession,
} from '../public-api'

import type { SessionDeps } from '../public-api'
import type { InternalSessionRow } from '../types'

const SESSION_LEN = 60 * 60 * 1000
const TICK_MS = 15_000
const ADMITS_PER_TICK = 1

function makeDeps(overrides: Partial<SessionDeps> = {}): SessionDeps & {
  rows: Map<string, InternalSessionRow>
  _tick: (n: Date) => void
  _now: () => Date
} {
  const rows = new Map<string, InternalSessionRow>()
  let currentNow = new Date('2026-04-17T12:00:00Z')
  let instanceCounter = 0

  const newInstanceId = () => `inst-${++instanceCounter}`

  const deps: SessionDeps & {
    rows: Map<string, InternalSessionRow>
    _tick: (n: Date) => void
    _now: () => Date
  } = {
    rows,
    _tick: (n: Date) => {
      currentNow = n
    },
    _now: () => currentNow,
    isWaitingRoomEnabled: () => true,
    getAdmissionTickMs: () => TICK_MS,
    getMaxAdmitsPerTick: () => ADMITS_PER_TICK,
    now: () => currentNow,
    getSessionRow: async (userId) => rows.get(userId) ?? null,
    endSession: async (userId) => {
      rows.delete(userId)
    },
    queueDepth: async () => {
      let n = 0
      for (const r of rows.values()) if (r.status === 'queued') n++
      return n
    },
    queuePositionFor: async ({ userId, queuedAt }) => {
      let pos = 0
      for (const r of rows.values()) {
        if (r.status !== 'queued') continue
        if (
          r.queued_at.getTime() < queuedAt.getTime() ||
          (r.queued_at.getTime() === queuedAt.getTime() && r.user_id <= userId)
        ) {
          pos++
        }
      }
      return pos
    },
    joinOrTakeOver: async ({ userId, now }) => {
      const existing = rows.get(userId)
      const nextInstance = newInstanceId()
      if (!existing) {
        const r: InternalSessionRow = {
          user_id: userId,
          status: 'queued',
          active_instance_id: nextInstance,
          queued_at: now,
          admitted_at: null,
          expires_at: null,
          created_at: now,
          updated_at: now,
        }
        rows.set(userId, r)
        return r
      }
      if (
        existing.status === 'active' &&
        existing.expires_at &&
        existing.expires_at.getTime() > now.getTime()
      ) {
        existing.active_instance_id = nextInstance
        existing.updated_at = now
        return existing
      }
      if (existing.status === 'queued') {
        existing.active_instance_id = nextInstance
        existing.updated_at = now
        return existing
      }
      existing.status = 'queued'
      existing.active_instance_id = nextInstance
      existing.queued_at = now
      existing.admitted_at = null
      existing.expires_at = null
      existing.updated_at = now
      return existing
    },
    ...overrides,
  }
  return deps
}

describe('requestSession', () => {
  let deps: ReturnType<typeof makeDeps>
  beforeEach(() => {
    deps = makeDeps()
  })

  test('disabled flag returns { status: disabled } and does not touch DB', async () => {
    deps.isWaitingRoomEnabled = () => true // sanity
    const offDeps = makeDeps({ isWaitingRoomEnabled: () => false })
    const state = await requestSession({ userId: 'u1', deps: offDeps })
    expect(state).toEqual({ status: 'disabled' })
    expect(offDeps.rows.size).toBe(0)
  })

  test('first call puts user in queue at position 1', async () => {
    const state = await requestSession({ userId: 'u1', deps })
    expect(state.status).toBe('queued')
    if (state.status !== 'queued') throw new Error('unreachable')
    expect(state.position).toBe(1)
    expect(state.queueDepth).toBe(1)
    expect(state.instanceId).toBe('inst-1')
  })

  test('second call from same user rotates instance id, keeps queue position', async () => {
    await requestSession({ userId: 'u1', deps })
    const second = await requestSession({ userId: 'u1', deps })
    if (second.status !== 'queued') throw new Error('unreachable')
    expect(second.position).toBe(1)
    expect(second.instanceId).toBe('inst-2')
  })

  test('multiple users queue in FIFO order', async () => {
    await requestSession({ userId: 'u1', deps })
    deps._tick(new Date(deps._now().getTime() + 1000))
    await requestSession({ userId: 'u2', deps })

    const s1 = (await getSessionState({ userId: 'u1', deps }))!
    const s2 = (await getSessionState({ userId: 'u2', deps }))!
    if (s1.status !== 'queued' || s2.status !== 'queued') throw new Error('unreachable')
    expect(s1.position).toBe(1)
    expect(s2.position).toBe(2)
  })

  test('active unexpired session → rotate instance id, preserve active state', async () => {
    // Prime a user into active state manually.
    await requestSession({ userId: 'u1', deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = deps._now()
    row.expires_at = new Date(deps._now().getTime() + SESSION_LEN)

    const second = await requestSession({ userId: 'u1', deps })
    expect(second.status).toBe('active')
    if (second.status !== 'active') throw new Error('unreachable')
    expect(second.instanceId).not.toBe('inst-1') // rotated
  })
})

describe('checkSessionAdmissible', () => {
  let deps: ReturnType<typeof makeDeps>
  beforeEach(() => {
    deps = makeDeps()
  })

  test('disabled flag → ok with reason=disabled', async () => {
    const offDeps = makeDeps({ isWaitingRoomEnabled: () => false })
    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: undefined,
      deps: offDeps,
    })
    expect(result.ok).toBe(true)
  })

  test('no session → waiting_room_required', async () => {
    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: 'x',
      deps,
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('waiting_room_required')
  })

  test('queued session → waiting_room_queued', async () => {
    await requestSession({ userId: 'u1', deps })
    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: 'inst-1',
      deps,
    })
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('waiting_room_queued')
  })

  test('active + matching instance id → ok', async () => {
    await requestSession({ userId: 'u1', deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = deps._now()
    row.expires_at = new Date(deps._now().getTime() + SESSION_LEN)

    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: row.active_instance_id,
      deps,
    })
    expect(result.ok).toBe(true)
    if (!result.ok || result.reason !== 'active') throw new Error('unreachable')
    expect(result.remainingMs).toBe(SESSION_LEN)
  })

  test('active + wrong instance id → session_superseded', async () => {
    await requestSession({ userId: 'u1', deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = deps._now()
    row.expires_at = new Date(deps._now().getTime() + SESSION_LEN)

    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: 'stale-token',
      deps,
    })
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('session_superseded')
  })

  test('active + missing instance id → session_superseded (fails closed)', async () => {
    await requestSession({ userId: 'u1', deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = deps._now()
    row.expires_at = new Date(deps._now().getTime() + SESSION_LEN)

    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: undefined,
      deps,
    })
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('session_superseded')
  })

  test('active but expires_at in the past → session_expired', async () => {
    await requestSession({ userId: 'u1', deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = new Date(deps._now().getTime() - 2 * SESSION_LEN)
    row.expires_at = new Date(deps._now().getTime() - 1)

    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: row.active_instance_id,
      deps,
    })
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('session_expired')
  })
})

describe('endUserSession', () => {
  test('removes row', async () => {
    const deps = makeDeps()
    await requestSession({ userId: 'u1', deps })
    expect(deps.rows.has('u1')).toBe(true)
    await endUserSession({ userId: 'u1', deps })
    expect(deps.rows.has('u1')).toBe(false)
  })

  test('is no-op when disabled', async () => {
    const deps = makeDeps({ isWaitingRoomEnabled: () => false })
    deps.rows.set('u1', {
      user_id: 'u1',
      status: 'active',
      active_instance_id: 'x',
      queued_at: new Date(),
      admitted_at: null,
      expires_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    })
    await endUserSession({ userId: 'u1', deps })
    expect(deps.rows.has('u1')).toBe(true)
  })
})
