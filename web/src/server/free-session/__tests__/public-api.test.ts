import { beforeEach, describe, expect, test } from 'bun:test'

import {
  FALLBACK_FREEBUFF_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_GEMINI_PRO_MODEL_ID,
  FREEBUFF_GLM_V52_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
  FREEBUFF_LIMITED_SESSION_LIMIT,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
  FREEBUFF_PREMIUM_MODEL_IDS,
  FREEBUFF_PREMIUM_SESSION_LIMIT,
  FREEBUFF_PREMIUM_SESSION_WINDOW_HOURS,
} from '@codebuff/common/constants/freebuff-models'

import { FREEBUFF_DESKTOP_MAX_CONCURRENT_SESSIONS } from '../config'
import {
  checkSessionAdmissible,
  endUserSession,
  getGlmWeeklyUsage,
  getSessionState,
  pinFreeSessionToMinimax,
  requestSession,
} from '../public-api'
import {
  FreeSessionModelLockedError,
  FreeSessionPremiumSlotTakenError,
} from '../store'

import type { SessionDeps } from '../public-api'
import type {
  FreeSessionCountryAccessMetadata,
  InternalSessionRow,
} from '../types'

const SESSION_LEN = 60 * 60 * 1000
const GRACE_MS = 30 * 60 * 1000
const DEFAULT_MODEL = 'minimax/minimax-m2.7'
const REMOVED_GLM_MODEL = 'z-ai/glm-5.1'
const DEFAULT_PREMIUM_RESET_AT = '2026-04-18T07:00:00.000Z'

function expectedRateLimit(model: string, recentCount: number) {
  return {
    model,
    limit: FREEBUFF_PREMIUM_SESSION_LIMIT,
    period: 'pacific_day',
    resetTimeZone: 'America/Los_Angeles',
    resetAt: DEFAULT_PREMIUM_RESET_AT,
    windowHours: FREEBUFF_PREMIUM_SESSION_WINDOW_HOURS,
    recentCount,
  } as const
}

interface AdmitRecord {
  user_id: string
  model: string
  access_tier?: 'full' | 'limited'
  admitted_at: Date
  session_units?: number
}

function makeDeps(overrides: Partial<SessionDeps> = {}): SessionDeps & {
  rows: Map<string, InternalSessionRow>
  desktopRows: Map<string, InternalSessionRow>
  admits: AdmitRecord[]
  _tick: (n: Date) => void
  _now: () => Date
} {
  const rows = new Map<string, InternalSessionRow>()
  const desktopRows = new Map<string, InternalSessionRow>()
  const admits: AdmitRecord[] = []
  let currentNow = new Date('2026-04-17T12:00:00Z')
  let instanceCounter = 0

  const newInstanceId = () => `inst-${++instanceCounter}`

  const deps: SessionDeps & {
    rows: Map<string, InternalSessionRow>
    desktopRows: Map<string, InternalSessionRow>
    admits: AdmitRecord[]
    _tick: (n: Date) => void
    _now: () => Date
  } = {
    rows,
    desktopRows,
    admits,
    _tick: (n: Date) => {
      currentNow = n
    },
    _now: () => currentNow,
    graceMs: GRACE_MS,
    sessionLengthMs: SESSION_LEN,
    // Log-only per-IP concurrency instrumentation. Default to a no-op count so
    // existing tests are unaffected; the instrumentation tests override this.
    countActiveSessionsForIpHash: async () => 0,
    ipSessionCap: 30,
    // Empty fleet → every model resolves to the absence-default 'healthy', so
    // backup-capable models pin to 'deployment'. Routing tests override this.
    getFleetHealth: async () => ({}),
    // No measured TTFT by default → no TTFT-based serverless trip. TTFT tests
    // override this.
    getDeploymentTtftP90Ms: () => undefined,
    listRecentFreeSessionAdmits: async ({
      userId,
      models,
      since,
      accessTier,
    }) => {
      return admits
        .filter(
          (a) =>
            a.user_id === userId &&
            models.includes(a.model) &&
            a.admitted_at.getTime() >= since.getTime() &&
            (!accessTier || (a.access_tier ?? 'full') === accessTier),
        )
        .sort((a, b) => a.admitted_at.getTime() - b.admitted_at.getTime())
        .map((a) => ({
          admittedAt: a.admitted_at,
          model: a.model,
          sessionUnits: a.session_units ?? 1,
        }))
    },
    getGlmReferralEntitlement: async () => 0,
    getLimitedReferralSessionBonus: async () => 0,
    getStreakBonusUnits: async () => 0,
    promoteQueuedUser: async ({
      userId,
      model,
      sessionLengthMs,
      now,
      fireworksRoute,
    }) => {
      const row = rows.get(userId)
      if (!row || row.status !== 'queued' || row.model !== model) return null
      row.status = 'active'
      row.admitted_at = now
      row.expires_at = new Date(now.getTime() + sessionLengthMs)
      row.fireworks_route = fireworksRoute ?? null
      row.updated_at = now
      admits.push({
        user_id: userId,
        model,
        access_tier: row.access_tier ?? 'full',
        admitted_at: now,
        session_units: 1,
      })
      return row
    },
    pinMinimaxUpstream: async ({ userId, now }) => {
      const row = rows.get(userId)
      if (!row) return
      row.minimax_upstream = 'minimax'
      row.updated_at = now
    },
    now: () => currentNow,
    getSessionRow: async (userId) => rows.get(userId) ?? null,
    endSession: async ({ userId, now, sessionLengthMs }) => {
      const row = rows.get(userId)
      if (
        row?.status === 'active' &&
        row.admitted_at &&
        row.expires_at &&
        row.expires_at.getTime() > now.getTime()
      ) {
        const latest = admits
          .filter((a) => a.user_id === userId && a.model === row.model)
          .sort((a, b) => b.admitted_at.getTime() - a.admitted_at.getTime())[0]
        if (latest) {
          const usedMs = Math.max(
            0,
            Math.min(
              sessionLengthMs,
              now.getTime() - row.admitted_at.getTime(),
            ),
          )
          latest.session_units = Math.ceil((usedMs / sessionLengthMs) * 10) / 10
        }
      }
      rows.delete(userId)
    },
    joinOrTakeOver: async ({ userId, model, accessTier, now }) => {
      const existing = rows.get(userId)
      const nextInstance = newInstanceId()
      if (!existing) {
        const r: InternalSessionRow = {
          user_id: userId,
          status: 'queued',
          active_instance_id: nextInstance,
          model,
          access_tier: accessTier,
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
        if (existing.model !== model) {
          throw new FreeSessionModelLockedError(existing.model)
        }
        existing.active_instance_id = nextInstance
        existing.updated_at = now
        return existing
      }
      if (existing.status === 'queued') {
        existing.active_instance_id = nextInstance
        if (existing.model !== model) {
          existing.model = model
          existing.queued_at = now
        }
        existing.access_tier = accessTier
        existing.updated_at = now
        return existing
      }
      existing.status = 'queued'
      existing.active_instance_id = nextInstance
      existing.model = model
      existing.access_tier = accessTier
      existing.queued_at = now
      existing.admitted_at = null
      existing.expires_at = null
      existing.updated_at = now
      return existing
    },
    // — Desktop multi-session in-memory store, keyed by `${userId}::${instanceId}`.
    getDesktopSessionRow: async (userId, instanceId) =>
      desktopRows.get(`${userId}::${instanceId}`) ?? null,
    getActiveDesktopSessionCount: async (userId) =>
      [...desktopRows.values()].filter(
        (r) => r.user_id === userId && r.status === 'active',
      ).length,
    admitDesktopSession: async ({
      userId,
      instanceId,
      model,
      accessTier,
      premiumBucket,
      now,
      sessionLengthMs,
    }) => {
      const key = `${userId}::${instanceId}`
      const existing = desktopRows.get(key)
      const expires_at = new Date(now.getTime() + sessionLengthMs)
      if (existing) {
        existing.status = 'active'
        existing.model = model
        existing.premium_bucket = premiumBucket
        existing.access_tier = accessTier
        existing.expires_at = expires_at
        existing.updated_at = now
        return existing
      }
      // Enforce the one-active-premium-bucket-per-user cap (the partial unique
      // index in prod) — a racing/second premium admit throws.
      if (premiumBucket) {
        const other = [...desktopRows.values()].find(
          (r) =>
            r.user_id === userId &&
            r.status === 'active' &&
            r.premium_bucket === true,
        )
        if (other) {
          throw new FreeSessionPremiumSlotTakenError(
            other.model,
            other.active_instance_id,
          )
        }
      }
      const row: InternalSessionRow = {
        user_id: userId,
        status: 'active',
        active_instance_id: instanceId,
        model,
        premium_bucket: premiumBucket,
        access_tier: accessTier,
        queued_at: now,
        admitted_at: now,
        expires_at,
        created_at: now,
        updated_at: now,
      }
      desktopRows.set(key, row)
      admits.push({
        user_id: userId,
        model,
        access_tier: accessTier,
        admitted_at: now,
        session_units: 1,
      })
      return row
    },
    endDesktopSession: async ({ userId, instanceId }) => {
      desktopRows.delete(`${userId}::${instanceId}`)
    },
    endAllDesktopSessions: async (userId) => {
      for (const [k, r] of [...desktopRows.entries()]) {
        if (r.user_id === userId) desktopRows.delete(k)
      }
    },
    pinDesktopMinimaxUpstream: async ({ userId, instanceId, now }) => {
      const r = desktopRows.get(`${userId}::${instanceId}`)
      if (r) {
        r.minimax_upstream = 'minimax'
        r.updated_at = now
      }
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

  test('banned user is rejected before joinOrTakeOver runs', async () => {
    const state = await requestSession({
      userId: 'u1',
      model: DEFAULT_MODEL,
      userBanned: true,
      deps,
    })
    expect(state).toEqual({ status: 'banned' })
    // No row should be created — banned bots never reach joinOrTakeOver.
    expect(deps.rows.size).toBe(0)
  })

  test('first call admits the user immediately into an active session', async () => {
    const state = await requestSession({
      userId: 'u1',
      model: DEFAULT_MODEL,
      deps,
    })
    expect(state.status).toBe('active')
    if (state.status !== 'active') throw new Error('unreachable')
    expect(state.remainingMs).toBe(SESSION_LEN)
    expect(state.instanceId).toBe('inst-1')
    expect(deps.rows.get('u1')?.status).toBe('active')
  })

  test('concurrent admit: promote no-op falls back to the active row, not queued', async () => {
    // Simulate a racing request that already flipped the row to active: this
    // request's promote matches nothing (returns null), but a re-read finds the
    // active row. We must surface `active`, never a phantom `queued` view.
    deps.promoteQueuedUser = async ({ userId, now }) => {
      const row = deps.rows.get(userId)!
      row.status = 'active'
      row.admitted_at = now
      row.expires_at = new Date(now.getTime() + SESSION_LEN)
      return null // our UPDATE matched nothing because the row was already active
    }
    const state = await requestSession({
      userId: 'u1',
      model: DEFAULT_MODEL,
      deps,
    })
    expect(state.status).toBe('active')
  })

  test('concurrent model-switch race: loser recovers and admits the switched model', async () => {
    // Real race: our model-scoped promote matches nothing because a concurrent
    // request switched the queued row to another model. The recovery re-reads
    // and promotes whatever queued row now exists — no throw, ends active.
    const SWITCHED = 'minimax/minimax-m3'
    let calls = 0
    deps.promoteQueuedUser = async ({
      userId,
      model,
      now,
      sessionLengthMs,
    }) => {
      calls++
      const row = deps.rows.get(userId)!
      if (calls === 1) {
        // a concurrent switch flipped the queued row to a different model
        row.model = SWITCHED
        return null
      }
      if (row.status === 'queued' && row.model === model) {
        row.status = 'active'
        row.admitted_at = now
        row.expires_at = new Date(now.getTime() + sessionLengthMs)
        return row
      }
      return null
    }
    const state = await requestSession({
      userId: 'u1',
      model: DEFAULT_MODEL,
      deps,
    })
    expect(state.status).toBe('active')
    if (state.status !== 'active') throw new Error('unreachable')
    expect(state.model).toBe(SWITCHED)
    expect(calls).toBe(2)
  })

  test('promote that never succeeds throws (transient queued maps to no view)', async () => {
    // Pathological: promotion can never flip the row (cannot happen against the
    // real DB, where a fresh queued row always matches). A queued row is never
    // surfaced to the wire — it maps to no view — so requestSession throws
    // rather than returning a `queued` response. A GET poll then self-heals to
    // `none`.
    deps.promoteQueuedUser = async () => null
    await expect(
      requestSession({
        userId: 'u1',
        model: DEFAULT_MODEL,
        deps,
      }),
    ).rejects.toThrow(/maps to no view/)
  })

  test('removed GLM 5.1 request falls back to the default model', async () => {
    const state = await requestSession({
      userId: 'u1',
      model: REMOVED_GLM_MODEL,
      deps,
    })
    expect(state.status).toBe('active')
    if (state.status !== 'active') throw new Error('unreachable')
    expect(state.model).toBe(FALLBACK_FREEBUFF_MODEL_ID)
    expect(deps.rows.get('u1')?.model).toBe(FALLBACK_FREEBUFF_MODEL_ID)
  })

  test('removed GLM 5.1 active session cannot be reclaimed', async () => {
    const admittedAt = new Date(deps._now().getTime() - 10 * 60 * 1000)
    deps.rows.set('u1', {
      user_id: 'u1',
      status: 'active',
      active_instance_id: 'inst-pre',
      model: REMOVED_GLM_MODEL,
      queued_at: admittedAt,
      admitted_at: admittedAt,
      expires_at: new Date(deps._now().getTime() + SESSION_LEN),
      created_at: admittedAt,
      updated_at: admittedAt,
    })

    const state = await requestSession({
      userId: 'u1',
      model: REMOVED_GLM_MODEL,
      deps,
    })
    expect(state.status).toBe('active')
    if (state.status !== 'active') throw new Error('unreachable')
    expect(state.model).toBe(FALLBACK_FREEBUFF_MODEL_ID)
    expect(deps.rows.get('u1')?.model).toBe(FALLBACK_FREEBUFF_MODEL_ID)
  })

  test('second call from same user rotates instance id, preserves active session', async () => {
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    const second = await requestSession({
      userId: 'u1',
      model: DEFAULT_MODEL,
      deps,
    })
    if (second.status !== 'active') throw new Error('unreachable')
    expect(second.instanceId).toBe('inst-2')
  })

  test('active unexpired session → rotate instance id, preserve active state', async () => {
    // Prime a user into active state manually.
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = deps._now()
    row.expires_at = new Date(deps._now().getTime() + SESSION_LEN)

    const second = await requestSession({
      userId: 'u1',
      model: DEFAULT_MODEL,
      deps,
    })
    expect(second.status).toBe('active')
    if (second.status !== 'active') throw new Error('unreachable')
    expect(second.instanceId).not.toBe('inst-1') // rotated
  })

  test('admits every user immediately regardless of how many are active', async () => {
    const s1 = await requestSession({
      userId: 'u1',
      model: DEFAULT_MODEL,
      deps,
    })
    const s2 = await requestSession({
      userId: 'u2',
      model: DEFAULT_MODEL,
      deps,
    })
    const s3 = await requestSession({
      userId: 'u3',
      model: DEFAULT_MODEL,
      deps,
    })
    expect(s1.status).toBe('active')
    expect(s2.status).toBe('active')
    expect(s3.status).toBe('active')
  })

  // --- Log-only per-IP concurrent-session instrumentation -----------------
  // The cap is not enforced yet: these assert the measurement is sampled on
  // fresh admissions (and only then) and that it never changes the admission
  // outcome. See logIpSessionConcurrency in public-api.ts.
  const countryAccessWithIpHash = (
    clientIpHash: string | null,
  ): FreeSessionCountryAccessMetadata => ({
    countryCode: 'ID',
    cfCountry: 'ID',
    geoipCountry: 'ID',
    blockReason: null,
    ipPrivacySignals: null,
    clientIpHash,
    checkedAt: new Date('2026-04-17T12:00:00Z'),
  })

  test('admission: samples per-IP concurrency but never blocks (log-only)', async () => {
    const ipHashCalls: string[] = []
    const admitDeps = makeDeps({
      // Simulate a hash already far over the cap (default 30); log-only must
      // still admit.
      countActiveSessionsForIpHash: async (hash) => {
        ipHashCalls.push(hash)
        return 999
      },
    })
    const state = await requestSession({
      userId: 'u1',
      model: DEFAULT_MODEL,
      countryAccess: countryAccessWithIpHash('hash-farm'),
      deps: admitDeps,
    })
    expect(state.status).toBe('active')
    expect(ipHashCalls).toEqual(['hash-farm'])
  })

  test('admission: skips per-IP sampling when no client_ip_hash is known', async () => {
    const ipHashCalls: string[] = []
    const admitDeps = makeDeps({
      countActiveSessionsForIpHash: async (hash) => {
        ipHashCalls.push(hash)
        return 0
      },
    })
    const state = await requestSession({
      userId: 'u1',
      model: DEFAULT_MODEL,
      countryAccess: countryAccessWithIpHash(null),
      deps: admitDeps,
    })
    expect(state.status).toBe('active')
    expect(ipHashCalls).toEqual([])
  })

  test('reclaim/takeover does not re-sample per-IP concurrency', async () => {
    const ipHashCalls: string[] = []
    const admitDeps = makeDeps({
      countActiveSessionsForIpHash: async (hash) => {
        ipHashCalls.push(hash)
        return 1
      },
    })
    // First call is a fresh admission → sampled once.
    await requestSession({
      userId: 'u1',
      model: DEFAULT_MODEL,
      countryAccess: countryAccessWithIpHash('hash-a'),
      deps: admitDeps,
    })
    // Second call on the same active row is a takeover, not a new admission.
    const again = await requestSession({
      userId: 'u1',
      model: DEFAULT_MODEL,
      countryAccess: countryAccessWithIpHash('hash-a'),
      deps: admitDeps,
    })
    expect(again.status).toBe('active')
    expect(ipHashCalls).toEqual(['hash-a'])
  })

  test('admission no longer pins minimax-m3 to a deployment (deployment retired)', async () => {
    // The dedicated M3 deployment was retired: M3 now serves from Fireworks
    // serverless with a reactive MiniMax fallback, so admission never sets a
    // deployment route pin regardless of (legacy) fleet health.
    const admitDeps = makeDeps({
      getFleetHealth: async () => ({
        [FREEBUFF_MINIMAX_M3_MODEL_ID]: 'unhealthy',
      }),
    })
    await requestSession({
      userId: 'u1',
      model: FREEBUFF_MINIMAX_M3_MODEL_ID,
      deps: admitDeps,
    })
    expect(admitDeps.rows.get('u1')?.fireworks_route ?? null).toBeNull()
  })

  test('models without a serverless backup get no route pin', async () => {
    const admitDeps = makeDeps({
      // Even a degraded fleet leaves a non-backup model unpinned: there is no
      // safe serverless target to divert it to.
      getFleetHealth: async () => ({ [DEFAULT_MODEL]: 'degraded' }),
    })
    await requestSession({
      userId: 'u1',
      model: DEFAULT_MODEL,
      deps: admitDeps,
    })
    expect(admitDeps.rows.get('u1')?.fireworks_route ?? null).toBeNull()
  })

  test('a fresh M3 session has no minimax pin; the gate omits minimaxUpstream', async () => {
    const admitDeps = makeDeps()
    const state = await requestSession({
      userId: 'u1',
      model: FREEBUFF_MINIMAX_M3_MODEL_ID,
      deps: admitDeps,
    })
    if (state.status !== 'active') throw new Error('expected active')
    expect(admitDeps.rows.get('u1')?.minimax_upstream ?? null).toBeNull()

    const gate = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: state.instanceId,
      requestedModel: FREEBUFF_MINIMAX_M3_MODEL_ID,
      deps: admitDeps,
    })
    if (!gate.ok || gate.reason !== 'active') {
      throw new Error('expected ok active gate')
    }
    expect(gate.minimaxUpstream).toBeUndefined()
  })

  test('pinFreeSessionToMinimax sets the sticky pin, surfaced by checkSessionAdmissible', async () => {
    const admitDeps = makeDeps()
    const state = await requestSession({
      userId: 'u1',
      model: FREEBUFF_MINIMAX_M3_MODEL_ID,
      deps: admitDeps,
    })
    if (state.status !== 'active') throw new Error('expected active')

    // A Fireworks rate limit pins the session to the official MiniMax API.
    await pinFreeSessionToMinimax('u1', admitDeps)
    expect(admitDeps.rows.get('u1')?.minimax_upstream).toBe('minimax')

    const gate = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: state.instanceId,
      requestedModel: FREEBUFF_MINIMAX_M3_MODEL_ID,
      deps: admitDeps,
    })
    if (!gate.ok || gate.reason !== 'active') {
      throw new Error('expected ok active gate')
    }
    expect(gate.minimaxUpstream).toBe('minimax')
  })

  test('pinFreeSessionToMinimax is a no-op when no session row exists', async () => {
    const admitDeps = makeDeps()
    // No requestSession → no row. Must not throw, and creates nothing.
    await pinFreeSessionToMinimax('ghost', admitDeps)
    expect(admitDeps.rows.get('ghost')).toBeUndefined()
  })

  // Per-user premium session limit (5 units per Pacific day) — the wire
  // limit is hard-coded in public-api.ts, so tests seed the fake admit log
  // directly rather than configuring it.
  const PREMIUM_MODEL = FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID
  const KIMI_MODEL = FREEBUFF_KIMI_MODEL_ID
  const PREMIUM_LIMIT = FREEBUFF_PREMIUM_SESSION_LIMIT
  const PREMIUM_WINDOW_HOURS = FREEBUFF_PREMIUM_SESSION_WINDOW_HOURS
  const PREMIUM_OPEN_TIME = new Date('2026-04-17T16:00:00Z')

  test('rate_limited: shared premium pool blocks the next premium session at 5 units', async () => {
    deps._tick(PREMIUM_OPEN_TIME)
    const now = deps._now()
    for (let i = 0; i < PREMIUM_LIMIT; i++) {
      deps.admits.push({
        user_id: 'u1',
        model: i === 0 ? KIMI_MODEL : PREMIUM_MODEL,
        admitted_at: new Date(now.getTime() - i * 60 * 60 * 1000),
      })
    }

    const state = await requestSession({
      userId: 'u1',
      model: PREMIUM_MODEL,
      deps,
    })
    expect(state.status).toBe('rate_limited')
    if (state.status !== 'rate_limited') throw new Error('unreachable')
    expect(state.model).toBe(PREMIUM_MODEL)
    expect(state.limit).toBe(PREMIUM_LIMIT)
    expect(state.windowHours).toBe(PREMIUM_WINDOW_HOURS)
    expect(state.recentCount).toBe(PREMIUM_LIMIT)
    expect(state.retryAfterMs).toBe(15 * 60 * 60 * 1000)
    expect(deps.rows.has('u1')).toBe(false)
  })

  test('streak bonus raises the premium cap so a 6th session is admitted', async () => {
    deps._tick(PREMIUM_OPEN_TIME)
    const now = deps._now()
    // Five premium admits today would normally exhaust the daily pool...
    for (let i = 0; i < PREMIUM_LIMIT; i++) {
      deps.admits.push({
        user_id: 'u1',
        model: PREMIUM_MODEL,
        admitted_at: new Date(now.getTime() - i * 60 * 60 * 1000),
      })
    }
    // ...but a 7-day streak milestone today granted one bonus premium session.
    deps.getStreakBonusUnits = async ({ pool }) => (pool === 'premium' ? 1 : 0)

    const state = await requestSession({
      userId: 'u1',
      model: PREMIUM_MODEL,
      deps,
    })
    expect(state.status).toBe('active')
    if (state.status !== 'active') throw new Error('unreachable')
    expect(state.rateLimit?.limit).toBe(PREMIUM_LIMIT + 1)
    expect(state.rateLimit?.recentCount).toBe(PREMIUM_LIMIT + 1)
  })

  test('rate_limited: reset follows Pacific midnight across DST changes', async () => {
    deps._tick(new Date('2026-03-08T09:00:00Z'))
    const now = deps._now()
    for (let i = 0; i < PREMIUM_LIMIT; i++) {
      deps.admits.push({
        user_id: 'u1',
        model: PREMIUM_MODEL,
        admitted_at: new Date(now.getTime() - i * 60_000),
      })
    }

    const state = await requestSession({
      userId: 'u1',
      model: PREMIUM_MODEL,
      deps,
    })

    expect(state.status).toBe('rate_limited')
    if (state.status !== 'rate_limited') throw new Error('unreachable')
    expect(state.retryAfterMs).toBe(22 * 60 * 60 * 1000)
  })

  test('rate_limited: DeepSeek admit before Pacific midnight does not count', async () => {
    deps._tick(PREMIUM_OPEN_TIME)
    deps.admits.push({
      user_id: 'u1',
      model: PREMIUM_MODEL,
      admitted_at: new Date('2026-04-17T06:59:00Z'),
    })

    const state = await requestSession({
      userId: 'u1',
      model: PREMIUM_MODEL,
      deps,
    })
    expect(state.status).toBe('active')
    if (state.status !== 'active') throw new Error('unreachable')
    // The pre-reset admit doesn't count; only the admit just written for this
    // admission falls inside today's window.
    expect(state.rateLimit).toEqual(expectedRateLimit(PREMIUM_MODEL, 1))
  })

  test('rate_limited: 5th Kimi admit today blocks the 6th attempt', async () => {
    deps._tick(PREMIUM_OPEN_TIME)
    // Seed 5 admits inside today's Pacific day. retryAfter points at the
    // next Pacific midnight reset, not the oldest admit.
    const now = deps._now()
    const ages = [8, 4, 3, 2, 1]
    for (const hoursAgo of ages) {
      deps.admits.push({
        user_id: 'u1',
        model: KIMI_MODEL,
        admitted_at: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000),
      })
    }

    const state = await requestSession({
      userId: 'u1',
      model: KIMI_MODEL,
      deps,
    })
    expect(state.status).toBe('rate_limited')
    if (state.status !== 'rate_limited') throw new Error('unreachable')
    expect(state.model).toBe(KIMI_MODEL)
    expect(state.limit).toBe(PREMIUM_LIMIT)
    expect(state.windowHours).toBe(PREMIUM_WINDOW_HOURS)
    expect(state.recentCount).toBe(PREMIUM_LIMIT)
    expect(state.retryAfterMs).toBe(15 * 60 * 60 * 1000)
    // Blocked before any row is written — the user doesn't take a queue slot.
    expect(deps.rows.has('u1')).toBe(false)
  })

  test('rate_limited: removed GLM 5.1 request does not use the shared premium quota', async () => {
    deps._tick(PREMIUM_OPEN_TIME)
    const now = deps._now()
    for (let i = 0; i < PREMIUM_LIMIT; i++) {
      deps.admits.push({
        user_id: 'u1',
        model: PREMIUM_MODEL,
        admitted_at: new Date(now.getTime() - (i + 1) * 60 * 60 * 1000),
      })
    }

    const state = await requestSession({
      userId: 'u1',
      model: REMOVED_GLM_MODEL,
      deps,
    })
    expect(state.status).toBe('active')
    if (state.status !== 'active') throw new Error('unreachable')
    expect(state.model).toBe(FALLBACK_FREEBUFF_MODEL_ID)
  })

  test("rate_limited: admits before today's Pacific reset do not count", async () => {
    deps._tick(PREMIUM_OPEN_TIME)
    for (let i = 0; i < 5; i++) {
      deps.admits.push({
        user_id: 'u1',
        model: PREMIUM_MODEL,
        admitted_at: new Date(`2026-04-17T06:5${i}:00Z`),
      })
    }
    const state = await requestSession({
      userId: 'u1',
      model: PREMIUM_MODEL,
      deps,
    })
    expect(state.status).toBe('active')
    if (state.status !== 'active') throw new Error('unreachable')
    // The 5 pre-reset admits don't count; the count is 1 because this request
    // admits immediately and writes its own (post-reset) admit row.
    expect(state.rateLimit?.recentCount).toBe(1)
  })

  test('rate_limited: Minimax is unlimited even with many recent admits', async () => {
    const now = deps._now()
    for (let i = 0; i < 20; i++) {
      deps.admits.push({
        user_id: 'u1',
        model: DEFAULT_MODEL,
        admitted_at: new Date(now.getTime() - i * 60_000),
      })
    }
    const state = await requestSession({
      userId: 'u1',
      model: DEFAULT_MODEL,
      deps,
    })
    expect(state.status).toBe('active')
    if (state.status !== 'active') throw new Error('unreachable')
    // No rate-limit info for unrated models — the CLI skips the quota line.
    expect(state.rateLimit).toBeUndefined()
  })

  test('limited access coerces unsupported requested models to DeepSeek Flash', async () => {
    const state = await requestSession({
      userId: 'u1',
      model: DEFAULT_MODEL,
      accessTier: 'limited',
      deps,
    })
    expect(state.status).toBe('active')
    if (state.status !== 'active') throw new Error('unreachable')
    expect(state.accessTier).toBe('limited')
    expect(state.model).toBe('deepseek/deepseek-v4-flash')
    expect(deps.rows.get('u1')?.access_tier).toBe('limited')
  })

  test('limited access allows non-Pro MiMo 2.5', async () => {
    const state = await requestSession({
      userId: 'u1',
      model: FREEBUFF_MIMO_V25_MODEL_ID,
      accessTier: 'limited',
      deps,
    })
    expect(state.status).toBe('active')
    if (state.status !== 'active') throw new Error('unreachable')
    expect(state.accessTier).toBe('limited')
    expect(state.model).toBe(FREEBUFF_MIMO_V25_MODEL_ID)
    expect(deps.rows.get('u1')?.access_tier).toBe('limited')
  })

  test('limited access re-anchors an existing full-tier Flash row', async () => {
    const admittedAt = new Date(deps._now().getTime() - 10 * 60_000)
    deps.rows.set('u1', {
      user_id: 'u1',
      status: 'active',
      active_instance_id: 'full-inst',
      model: 'deepseek/deepseek-v4-flash',
      access_tier: 'full',
      queued_at: admittedAt,
      admitted_at: admittedAt,
      expires_at: new Date(deps._now().getTime() + SESSION_LEN),
      created_at: admittedAt,
      updated_at: admittedAt,
    })

    const state = await requestSession({
      userId: 'u1',
      model: 'deepseek/deepseek-v4-flash',
      accessTier: 'limited',
      deps,
    })
    expect(state.status).toBe('active')
    if (state.status !== 'active') throw new Error('unreachable')
    expect(state.accessTier).toBe('limited')
    expect(state.instanceId).not.toBe('full-inst')
    expect(deps.rows.get('u1')?.access_tier).toBe('limited')
  })

  test('rate_limited: limited access blocks the next session at 5 units across Flash and MiMo', async () => {
    const now = deps._now()
    for (let i = 0; i < FREEBUFF_LIMITED_SESSION_LIMIT; i++) {
      deps.admits.push({
        user_id: 'u1',
        model:
          i === 0
            ? FREEBUFF_MIMO_V25_MODEL_ID
            : FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
        access_tier: 'limited',
        admitted_at: new Date(now.getTime() - i * 60_000),
      })
    }

    const state = await requestSession({
      userId: 'u1',
      model: FREEBUFF_MIMO_V25_MODEL_ID,
      accessTier: 'limited',
      deps,
    })
    expect(state.status).toBe('rate_limited')
    if (state.status !== 'rate_limited') throw new Error('unreachable')
    expect(state.accessTier).toBe('limited')
    expect(state.model).toBe(FREEBUFF_MIMO_V25_MODEL_ID)
    expect(state.limit).toBe(FREEBUFF_LIMITED_SESSION_LIMIT)
    expect(state.recentCount).toBe(FREEBUFF_LIMITED_SESSION_LIMIT)
    expect(deps.rows.has('u1')).toBe(false)
  })

  test('limited referral bonus raises the daily cap (5 base + bonus)', async () => {
    deps.getLimitedReferralSessionBonus = async () => 2 // 2 limited-tier referrals
    const now = deps._now()
    const cap = FREEBUFF_LIMITED_SESSION_LIMIT + 2
    for (let i = 0; i < cap; i++) {
      deps.admits.push({
        user_id: 'u1',
        model: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
        access_tier: 'limited',
        admitted_at: new Date(now.getTime() - i * 60_000),
      })
    }
    const state = await requestSession({
      userId: 'u1',
      model: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
      accessTier: 'limited',
      deps,
    })
    expect(state.status).toBe('rate_limited')
    if (state.status !== 'rate_limited') throw new Error('unreachable')
    expect(state.limit).toBe(cap) // base 5 + 2 referral bonus = 7
  })

  test('limited referral bonus does NOT apply to the premium (full-tier) pool', async () => {
    // Even with a bonus configured, a full-access user's premium pool is gated
    // out (`config.pool === 'limited'`), so the cap is unchanged.
    deps.getLimitedReferralSessionBonus = async () => 3
    const now = deps._now()
    for (let i = 0; i < FREEBUFF_PREMIUM_SESSION_LIMIT; i++) {
      deps.admits.push({
        user_id: 'u1',
        model: FREEBUFF_PREMIUM_MODEL_IDS[0],
        access_tier: 'full',
        admitted_at: new Date(now.getTime() - i * 60_000),
      })
    }
    const state = await requestSession({
      userId: 'u1',
      model: FREEBUFF_PREMIUM_MODEL_IDS[0],
      accessTier: 'full',
      deps,
    })
    expect(state.status).toBe('rate_limited')
    if (state.status !== 'rate_limited') throw new Error('unreachable')
    expect(state.limit).toBe(FREEBUFF_PREMIUM_SESSION_LIMIT) // no referral bonus
  })

  test('rate_limited: full Flash sessions do not consume the limited quota', async () => {
    const now = deps._now()
    for (let i = 0; i < FREEBUFF_LIMITED_SESSION_LIMIT; i++) {
      deps.admits.push({
        user_id: 'u1',
        model: 'deepseek/deepseek-v4-flash',
        access_tier: 'full',
        admitted_at: new Date(now.getTime() - i * 60_000),
      })
    }

    const state = await requestSession({
      userId: 'u1',
      model: DEFAULT_MODEL,
      accessTier: 'limited',
      deps,
    })
    expect(state.status).toBe('active')
    if (state.status !== 'active') throw new Error('unreachable')
    // The full-tier Flash admits don't count toward the limited quota; the
    // count is 1 from this request's own immediate limited-tier admission.
    expect(state.rateLimit?.recentCount).toBe(1)
  })

  test('DeepSeek admit response carries the current admit count', async () => {
    deps._tick(PREMIUM_OPEN_TIME)
    const now = deps._now()
    // 2 admits today — under the limit so the user still queues.
    deps.admits.push({
      user_id: 'u1',
      model: PREMIUM_MODEL,
      admitted_at: new Date(now.getTime() - 60 * 60 * 1000),
    })
    deps.admits.push({
      user_id: 'u1',
      model: PREMIUM_MODEL,
      admitted_at: new Date(now.getTime() - 30 * 60 * 1000),
    })
    const state = await requestSession({
      userId: 'u1',
      model: PREMIUM_MODEL,
      deps,
    })
    if (state.status !== 'active') throw new Error('unreachable')
    // Two prior admits + the one just written for this admission = 3.
    expect(state.rateLimit).toEqual(expectedRateLimit(PREMIUM_MODEL, 3))
  })

  test('rate_limited: fractional premium usage under the cap can start another session', async () => {
    deps._tick(PREMIUM_OPEN_TIME)
    const now = deps._now()
    deps.admits.push({
      user_id: 'u1',
      model: KIMI_MODEL,
      admitted_at: new Date(now.getTime() - 8 * 60 * 60 * 1000),
      session_units: 0.9,
    })
    for (let i = 0; i < 4; i++) {
      deps.admits.push({
        user_id: 'u1',
        model: KIMI_MODEL,
        admitted_at: new Date(now.getTime() - (i + 1) * 60 * 60 * 1000),
      })
    }

    const state = await requestSession({
      userId: 'u1',
      model: KIMI_MODEL,
      deps,
    })

    expect(state.status).toBe('active')
    if (state.status !== 'active') throw new Error('unreachable')
    // 4.9 prior units + the 1.0-unit admit just written for this admission.
    expect(state.rateLimit?.recentCount).toBe(5.9)
  })

  test('rate_limited: takeover of an active premium row is allowed even when at cap', async () => {
    // Reclaim path: user has an active+unexpired premium session and restarts
    // the CLI. POST must rotate their instance id (takeover) and NOT reject
    // with rate_limited — otherwise they'd be stranded with a live session
    // they can't reconnect to. The 5th admission is already in the log, so
    // this also exercises "at the cap" rather than "over the cap".
    deps._tick(PREMIUM_OPEN_TIME)
    const now = deps._now()
    // Seed 5 prior admits (the cap), with the latest one matching the
    // active row we're about to install.
    const ages = [8, 4, 3, 2, 0]
    for (const hoursAgo of ages) {
      deps.admits.push({
        user_id: 'u1',
        model: PREMIUM_MODEL,
        admitted_at: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000),
      })
    }
    // Install the active row directly (skipping the normal request path so
    // we don't have to unwind the rate-limit gate to set up the fixture).
    const admittedAt = new Date(now.getTime() - 30 * 60 * 1000)
    deps.rows.set('u1', {
      user_id: 'u1',
      status: 'active',
      active_instance_id: 'inst-pre',
      model: PREMIUM_MODEL,
      queued_at: admittedAt,
      admitted_at: admittedAt,
      expires_at: new Date(admittedAt.getTime() + SESSION_LEN),
      created_at: admittedAt,
      updated_at: admittedAt,
    })

    const state = await requestSession({
      userId: 'u1',
      model: PREMIUM_MODEL,
      deps,
    })
    expect(state.status).toBe('active')
    if (state.status !== 'active') throw new Error('unreachable')
    // Instance id rotated; quota snapshot still reflects today's usage.
    expect(state.instanceId).not.toBe('inst-pre')
    expect(state.rateLimit?.recentCount).toBe(PREMIUM_LIMIT)
  })

  test('rate_limited: reclaim of a queued premium row is allowed even when at cap', async () => {
    // Reclaim exception for queued rows: if a user has a leftover queued row
    // (e.g. from before instant admission), a subsequent POST from the same CLI
    // must not flip to rate_limited. The row is now promoted to active in the
    // same request (every free session is admitted immediately).
    deps._tick(PREMIUM_OPEN_TIME)
    const now = deps._now()
    for (let i = 0; i < PREMIUM_LIMIT; i++) {
      deps.admits.push({
        user_id: 'u1',
        model: PREMIUM_MODEL,
        admitted_at: new Date(now.getTime() - (i + 1) * 60 * 60 * 1000),
      })
    }
    const queuedAt = new Date(now.getTime() - 5 * 60 * 1000)
    deps.rows.set('u1', {
      user_id: 'u1',
      status: 'queued',
      active_instance_id: 'inst-pre',
      model: PREMIUM_MODEL,
      queued_at: queuedAt,
      admitted_at: null,
      expires_at: null,
      created_at: queuedAt,
      updated_at: queuedAt,
    })

    const state = await requestSession({
      userId: 'u1',
      model: PREMIUM_MODEL,
      deps,
    })
    expect(state.status).toBe('active')
    if (state.status !== 'active') throw new Error('unreachable')
    // The instance id rotated so any prior CLI is superseded. Promotion writes
    // a fresh admit, so the snapshot reflects the 5 prior + 1 new = 6 units.
    expect(state.instanceId).not.toBe('inst-pre')
    expect(state.rateLimit?.recentCount).toBe(PREMIUM_LIMIT + 1)
  })

  test('rate_limited: expired premium row is not a reclaim — quota still applies', async () => {
    // The stored row's expires_at is in the past, so it doesn't represent
    // an in-flight session. This POST is effectively a fresh request and
    // must be blocked by the quota.
    deps._tick(PREMIUM_OPEN_TIME)
    const now = deps._now()
    const ages = [8, 4, 3, 2, 1]
    for (const hoursAgo of ages) {
      deps.admits.push({
        user_id: 'u1',
        model: PREMIUM_MODEL,
        admitted_at: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000),
      })
    }
    const admittedAt = new Date(now.getTime() - 2 * SESSION_LEN)
    deps.rows.set('u1', {
      user_id: 'u1',
      status: 'active',
      active_instance_id: 'inst-pre',
      model: PREMIUM_MODEL,
      queued_at: admittedAt,
      admitted_at: admittedAt,
      expires_at: new Date(admittedAt.getTime() + SESSION_LEN),
      created_at: admittedAt,
      updated_at: admittedAt,
    })
    const state = await requestSession({
      userId: 'u1',
      model: PREMIUM_MODEL,
      deps,
    })
    expect(state.status).toBe('rate_limited')
  })

  test('admission bumps the quota count for the freshly-written admit row', async () => {
    const admitDeps = makeDeps()
    admitDeps._tick(PREMIUM_OPEN_TIME)
    // 1 existing admit today; this new call is admitted immediately and
    // writes a second row, so the response's recentCount reflects 2.
    const now = admitDeps._now()
    admitDeps.admits.push({
      user_id: 'u1',
      model: PREMIUM_MODEL,
      admitted_at: new Date(now.getTime() - 30 * 60 * 1000),
    })
    const state = await requestSession({
      userId: 'u1',
      model: PREMIUM_MODEL,
      deps: admitDeps,
    })
    if (state.status !== 'active') throw new Error('unreachable')
    expect(state.rateLimit?.recentCount).toBe(2)
  })
})

describe('getSessionState', () => {
  let deps: ReturnType<typeof makeDeps>
  beforeEach(() => {
    deps = makeDeps()
  })

  test('banned user returns banned without hitting the DB', async () => {
    const state = await getSessionState({
      userId: 'u1',
      userBanned: true,
      deps,
    })
    expect(state).toEqual({ status: 'banned' })
  })

  test('no row returns none', async () => {
    const state = await getSessionState({ userId: 'u1', deps })
    expect(state).toEqual({
      status: 'none',
      accessTier: 'full',
    })
  })

  test('no row surfaces used premium quota before joining', async () => {
    const now = deps._now()
    deps.admits.push({
      user_id: 'u1',
      model: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
      admitted_at: new Date(now.getTime() - 60 * 60 * 1000),
    })

    const state = await getSessionState({ userId: 'u1', deps })
    expect(state.status).toBe('none')
    if (state.status !== 'none') throw new Error('unreachable')
    expect(
      state.rateLimitsByModel?.[FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID],
    ).toEqual(expectedRateLimit(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID, 1))
  })

  test('limited access deletes an incompatible queued row before returning none', async () => {
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    expect(deps.rows.has('u1')).toBe(true)

    const state = await getSessionState({
      userId: 'u1',
      accessTier: 'limited',
      deps,
    })

    expect(state).toEqual({
      status: 'none',
      accessTier: 'limited',
    })
    expect(deps.rows.has('u1')).toBe(false)
  })

  test('limited access deletes a queued full-tier Flash row before returning none', async () => {
    await requestSession({
      userId: 'u1',
      model: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
      deps,
    })
    expect(deps.rows.get('u1')?.access_tier).toBe('full')

    const state = await getSessionState({
      userId: 'u1',
      accessTier: 'limited',
      deps,
    })

    expect(state).toEqual({
      status: 'none',
      accessTier: 'limited',
    })
    expect(deps.rows.has('u1')).toBe(false)
  })

  test('limited access deletes an incompatible active row before returning none', async () => {
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = deps._now()
    row.expires_at = new Date(deps._now().getTime() + SESSION_LEN)

    const state = await getSessionState({
      userId: 'u1',
      accessTier: 'limited',
      claimedInstanceId: row.active_instance_id,
      deps,
    })

    expect(state).toEqual({
      status: 'none',
      accessTier: 'limited',
    })
    expect(deps.rows.has('u1')).toBe(false)
  })

  test('active session with matching instance id returns active', async () => {
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = deps._now()
    row.expires_at = new Date(deps._now().getTime() + SESSION_LEN)

    const state = await getSessionState({
      userId: 'u1',
      claimedInstanceId: row.active_instance_id,
      deps,
    })
    expect(state.status).toBe('active')
  })

  test('active session with mismatched instance id returns superseded', async () => {
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = deps._now()
    row.expires_at = new Date(deps._now().getTime() + SESSION_LEN)

    const state = await getSessionState({
      userId: 'u1',
      claimedInstanceId: 'stale-token',
      deps,
    })
    expect(state).toEqual({ status: 'superseded' })
  })

  test('getSessionState surfaces rateLimit on active polls', async () => {
    // Regression: the POST response attached rateLimit, but GET polls did
    // not — so the "Sessions N/M used" line flashed once then disappeared on
    // the next 5s poll. GET must attach the same quota snapshot. Rate
    // limits only apply to DeepSeek, so this test uses DeepSeek explicitly (inside
    // deployment hours) rather than the Minimax DEFAULT_MODEL.
    deps._tick(new Date('2026-04-17T16:00:00Z'))
    const now = deps._now()
    deps.admits.push({
      user_id: 'u1',
      model: 'deepseek/deepseek-v4-pro',
      admitted_at: new Date(now.getTime() - 60 * 60 * 1000),
    })
    await requestSession({
      userId: 'u1',
      model: 'deepseek/deepseek-v4-pro',
      deps,
    })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = now
    row.expires_at = new Date(now.getTime() + SESSION_LEN)

    const state = await getSessionState({
      userId: 'u1',
      claimedInstanceId: row.active_instance_id,
      deps,
    })
    if (state.status !== 'active') throw new Error('unreachable')
    // Seeded admit (1h ago) + this request's own immediate admission = 2.
    expect(state.rateLimit).toEqual(
      expectedRateLimit(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID, 2),
    )
  })

  test('active session only fetches one shared premium quota snapshot', async () => {
    deps._tick(new Date('2026-04-17T16:00:00Z'))
    let listRecentAdmitsCalls = 0
    const originalListRecentAdmits = deps.listRecentFreeSessionAdmits
    deps.listRecentFreeSessionAdmits = async (params) => {
      listRecentAdmitsCalls++
      return originalListRecentAdmits(params)
    }

    await requestSession({
      userId: 'u1',
      model: 'deepseek/deepseek-v4-pro',
      deps,
    })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = deps._now()
    row.expires_at = new Date(deps._now().getTime() + SESSION_LEN)
    listRecentAdmitsCalls = 0

    const state = await getSessionState({
      userId: 'u1',
      claimedInstanceId: row.active_instance_id,
      deps,
    })

    expect(state.status).toBe('active')
    expect(listRecentAdmitsCalls).toBe(1)
  })

  test('omitted claimedInstanceId on active session returns active (read-only)', async () => {
    // Polling without an id (e.g. very first GET before POST has resolved)
    // must not be classified as superseded — only an explicit mismatch is.
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = deps._now()
    row.expires_at = new Date(deps._now().getTime() + SESSION_LEN)

    const state = await getSessionState({ userId: 'u1', deps })
    expect(state.status).toBe('active')
  })

  test('row inside grace window returns ended (with instanceId)', async () => {
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = new Date(deps._now().getTime() - SESSION_LEN - 60_000)
    row.expires_at = new Date(deps._now().getTime() - 60_000)

    const state = await getSessionState({
      userId: 'u1',
      claimedInstanceId: row.active_instance_id,
      deps,
    })
    expect(state.status).toBe('ended')
    if (state.status !== 'ended') throw new Error('unreachable')
    expect(state.instanceId).toBe(row.active_instance_id)
    expect(state.gracePeriodRemainingMs).toBe(GRACE_MS - 60_000)
  })

  test('ended view carries the full premium-quota snapshot', async () => {
    // The post-session banner reads any entry from rateLimitsByModel since
    // all premium models share one daily pool. Unlike queued/active, the
    // ended view ships the full unfiltered map so a single banner read is
    // always safe.
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = new Date(deps._now().getTime() - SESSION_LEN - 60_000)
    row.expires_at = new Date(deps._now().getTime() - 60_000)
    deps.admits.push({
      user_id: 'u1',
      model: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
      admitted_at: new Date(deps._now().getTime() - 30 * 60_000),
    })

    const state = await getSessionState({
      userId: 'u1',
      claimedInstanceId: row.active_instance_id,
      deps,
    })
    if (state.status !== 'ended') throw new Error('unreachable')
    expect(
      state.rateLimitsByModel?.[FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID],
    ).toEqual(expectedRateLimit(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID, 1))
    // Every premium model is present (sharing the same recentCount) so the
    // banner can read any entry without caring which model the user was on.
    expect(state.rateLimitsByModel?.[FREEBUFF_KIMI_MODEL_ID]).toEqual(
      expectedRateLimit(FREEBUFF_KIMI_MODEL_ID, 1),
    )
    expect(state.rateLimitsByModel?.[FREEBUFF_MIMO_V25_PRO_MODEL_ID]).toEqual(
      expectedRateLimit(FREEBUFF_MIMO_V25_PRO_MODEL_ID, 1),
    )
  })

  test('row past grace window returns none', async () => {
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = new Date(deps._now().getTime() - 2 * SESSION_LEN)
    row.expires_at = new Date(deps._now().getTime() - GRACE_MS - 1)

    const state = await getSessionState({
      userId: 'u1',
      claimedInstanceId: row.active_instance_id,
      deps,
    })
    expect(state).toEqual({
      status: 'none',
      accessTier: 'full',
    })
  })
})

describe('checkSessionAdmissible', () => {
  let deps: ReturnType<typeof makeDeps>
  beforeEach(() => {
    deps = makeDeps()
  })

  test('missing instance id always requires an update, even with requireActiveSession', async () => {
    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: undefined,
      requestedModel: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
      requireActiveSession: true,
      deps,
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('freebuff_update_required')
  })

  test('instance id but no row → waiting_room_required', async () => {
    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: 'inst-1',
      requestedModel: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
      requireActiveSession: true,
      deps,
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('waiting_room_required')
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

  test('requireActiveSession admits Gemini thinker for smart model rows', async () => {
    // requireActiveSession=true allows the gemini-thinker child agent's Gemini
    // Pro call through against the parent session row when that session is
    // bound to one of the smart freebuff models (Kimi or DeepSeek).
    const now = deps._now()
    deps.rows.set('u1', {
      user_id: 'u1',
      status: 'active',
      active_instance_id: 'inst-1',
      model: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
      queued_at: now,
      admitted_at: now,
      expires_at: new Date(now.getTime() + SESSION_LEN),
      created_at: now,
      updated_at: now,
    })

    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: 'inst-1',
      requestedModel: FREEBUFF_GEMINI_PRO_MODEL_ID,
      requireActiveSession: true,
      deps,
    })
    expect(result.ok).toBe(true)
  })

  test('queued row → waiting_room_queued', async () => {
    // requestSession no longer persists queued rows, but a leftover queued row
    // (seeded directly) must still be rejected with the queued gate code.
    const now = deps._now()
    deps.rows.set('u1', {
      user_id: 'u1',
      status: 'queued',
      active_instance_id: 'inst-1',
      model: DEFAULT_MODEL,
      queued_at: now,
      admitted_at: null,
      expires_at: null,
      created_at: now,
      updated_at: now,
    })
    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: 'inst-1',
      deps,
    })
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('waiting_room_queued')
  })

  test('active + matching instance id → ok', async () => {
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
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

  test('active removed GLM 5.1 session is not admissible', async () => {
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    const row = deps.rows.get('u1')!
    row.model = REMOVED_GLM_MODEL
    row.status = 'active'
    row.admitted_at = deps._now()
    row.expires_at = new Date(deps._now().getTime() + SESSION_LEN)

    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: row.active_instance_id,
      requestedModel: REMOVED_GLM_MODEL,
      deps,
    })
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('session_model_mismatch')
  })

  test('active Kimi session admits Gemini thinker requests', async () => {
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    const row = deps.rows.get('u1')!
    row.model = FREEBUFF_KIMI_MODEL_ID
    row.status = 'active'
    row.admitted_at = deps._now()
    row.expires_at = new Date(deps._now().getTime() + SESSION_LEN)

    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: row.active_instance_id,
      requestedModel: FREEBUFF_GEMINI_PRO_MODEL_ID,
      requireActiveSession: true,
      deps,
    })
    expect(result.ok).toBe(true)
  })

  test('active DeepSeek session admits Gemini thinker requests', async () => {
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    const row = deps.rows.get('u1')!
    row.model = FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID
    row.status = 'active'
    row.admitted_at = deps._now()
    row.expires_at = new Date(deps._now().getTime() + SESSION_LEN)

    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: row.active_instance_id,
      requestedModel: FREEBUFF_GEMINI_PRO_MODEL_ID,
      requireActiveSession: true,
      deps,
    })
    expect(result.ok).toBe(true)
  })

  test('active MiniMax session rejects Gemini thinker requests', async () => {
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = deps._now()
    row.expires_at = new Date(deps._now().getTime() + SESSION_LEN)

    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: row.active_instance_id,
      requestedModel: FREEBUFF_GEMINI_PRO_MODEL_ID,
      requireActiveSession: true,
      deps,
    })
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('session_model_mismatch')
  })

  test('limited active Flash session admits Flash root requests', async () => {
    await requestSession({
      userId: 'u1',
      model: DEFAULT_MODEL,
      accessTier: 'limited',
      deps,
    })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = deps._now()
    row.expires_at = new Date(deps._now().getTime() + SESSION_LEN)

    const result = await checkSessionAdmissible({
      userId: 'u1',
      accessTier: 'limited',
      claimedInstanceId: row.active_instance_id,
      requestedModel: 'deepseek/deepseek-v4-flash',
      deps,
    })
    expect(result.ok).toBe(true)
  })

  test('limited access rejects active full-tier non-Flash sessions', async () => {
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = deps._now()
    row.expires_at = new Date(deps._now().getTime() + SESSION_LEN)

    const result = await checkSessionAdmissible({
      userId: 'u1',
      accessTier: 'limited',
      claimedInstanceId: row.active_instance_id,
      requestedModel: DEFAULT_MODEL,
      deps,
    })
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('session_model_mismatch')
  })

  test('active + wrong instance id → session_superseded', async () => {
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
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

  test('missing instance id → freebuff_update_required (pre-waiting-room CLI)', async () => {
    // Classified up front regardless of row state: old clients never send an
    // id, so we surface a distinct code that maps to 426 Upgrade Required.
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
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
    expect(result.code).toBe('freebuff_update_required')
  })

  test('active inside grace window → ok with reason=draining', async () => {
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = new Date(deps._now().getTime() - SESSION_LEN - 60_000)
    // 1 minute past expiry, well within the 30-minute grace window
    row.expires_at = new Date(deps._now().getTime() - 60_000)

    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: row.active_instance_id,
      deps,
    })
    expect(result.ok).toBe(true)
    if (!result.ok || result.reason !== 'draining')
      throw new Error('unreachable')
    expect(result.gracePeriodRemainingMs).toBe(GRACE_MS - 60_000)
  })

  test('active past the grace window → session_expired', async () => {
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = new Date(deps._now().getTime() - 2 * SESSION_LEN)
    row.expires_at = new Date(deps._now().getTime() - GRACE_MS - 1)

    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: row.active_instance_id,
      deps,
    })
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('session_expired')
  })

  test('draining + wrong instance id still rejects with session_superseded', async () => {
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    const row = deps.rows.get('u1')!
    row.status = 'active'
    row.admitted_at = new Date(deps._now().getTime() - SESSION_LEN - 60_000)
    row.expires_at = new Date(deps._now().getTime() - 60_000)

    const result = await checkSessionAdmissible({
      userId: 'u1',
      claimedInstanceId: 'stale-token',
      deps,
    })
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('session_superseded')
  })
})

describe('GLM 5.2 weekly referral pool', () => {
  // The fixed test clock is 2026-04-17T12:00Z (a Friday). Its Pacific week
  // starts Monday 2026-04-13 07:00Z, so admits on 04-14/04-16 count and an
  // admit on 04-12 (prior week) does not.
  test('rejects GLM with no referral entitlement as rate_limited (weekly)', async () => {
    const deps = makeDeps({
      getGlmReferralEntitlement: async () => 0,
    })
    const state = await requestSession({
      userId: 'u1',
      model: FREEBUFF_GLM_V52_MODEL_ID,
      deps,
    })
    expect(state.status).toBe('rate_limited')
    if (state.status !== 'rate_limited') throw new Error('unreachable')
    expect(state.limit).toBe(0)
    expect(state.period).toBe('pacific_week')
  })

  test('a 7-day streak grants a weekly GLM session with no referrals', async () => {
    // Full-access user with zero GLM referrals would normally be rejected, but a
    // streak-milestone GLM bonus (one weekly session) raises the limit to 1.
    const deps = makeDeps({
      getGlmReferralEntitlement: async () => 0,
      getStreakBonusUnits: async ({ pool }) => (pool === 'glm' ? 1 : 0),
    })
    const state = await requestSession({
      userId: 'u1',
      model: FREEBUFF_GLM_V52_MODEL_ID,
      deps,
    })
    expect(state.status).toBe('active')
    if (state.status !== 'active') throw new Error('unreachable')
    expect(state.rateLimit?.limit).toBe(1)
    expect(state.rateLimit?.period).toBe('pacific_week')
  })

  test('admits a GLM session when the user has referral entitlement', async () => {
    const deps = makeDeps({
      getGlmReferralEntitlement: async () => 2,
    })
    const state = await requestSession({
      userId: 'u1',
      model: FREEBUFF_GLM_V52_MODEL_ID,
      deps,
    })
    expect(state.status).toBe('active')
  })

  test('rejects once the weekly GLM entitlement is used up', async () => {
    const deps = makeDeps({
      getGlmReferralEntitlement: async () => 2,
    })
    deps.admits.push(
      {
        user_id: 'u1',
        model: FREEBUFF_GLM_V52_MODEL_ID,
        admitted_at: new Date('2026-04-14T10:00:00Z'),
      },
      {
        user_id: 'u1',
        model: FREEBUFF_GLM_V52_MODEL_ID,
        admitted_at: new Date('2026-04-16T10:00:00Z'),
      },
    )
    const state = await requestSession({
      userId: 'u1',
      model: FREEBUFF_GLM_V52_MODEL_ID,
      deps,
    })
    expect(state.status).toBe('rate_limited')
    if (state.status !== 'rate_limited') throw new Error('unreachable')
    expect(state.limit).toBe(2)
    expect(state.recentCount).toBe(2)
  })

  test('getGlmWeeklyUsage keeps referral entitlement separate from the streak bonus', async () => {
    const deps = makeDeps({
      getGlmReferralEntitlement: async () => 2,
      getStreakBonusUnits: async ({ pool }) => (pool === 'glm' ? 1 : 0),
    })
    const usage = await getGlmWeeklyUsage('u1', deps)
    // referralLimit is the bonus-free entitlement (drives the "(N/cap)" copy);
    // limit/remaining fold in the +1 streak bonus (drive launchability).
    expect(usage.referralLimit).toBe(2)
    expect(usage.limit).toBe(3)
    expect(usage.remaining).toBe(3)
  })

  test('ignores GLM admits from a prior week', async () => {
    const deps = makeDeps({
      getGlmReferralEntitlement: async () => 1,
    })
    // 2026-04-12 is the Sunday before this week's Monday start → prior week.
    deps.admits.push({
      user_id: 'u1',
      model: FREEBUFF_GLM_V52_MODEL_ID,
      admitted_at: new Date('2026-04-12T10:00:00Z'),
    })
    const state = await requestSession({
      userId: 'u1',
      model: FREEBUFF_GLM_V52_MODEL_ID,
      deps,
    })
    expect(state.status).toBe('active')
  })
})

describe('endUserSession', () => {
  test('removes row', async () => {
    const deps = makeDeps()
    await requestSession({ userId: 'u1', model: DEFAULT_MODEL, deps })
    expect(deps.rows.has('u1')).toBe(true)
    await endUserSession({ userId: 'u1', deps })
    expect(deps.rows.has('u1')).toBe(false)
  })

  test('rounds active premium session usage up to nearest tenth on early end', async () => {
    const deps = makeDeps()
    deps._tick(new Date('2026-04-17T16:00:00Z'))
    const state = await requestSession({
      userId: 'u1',
      model: FREEBUFF_KIMI_MODEL_ID,
      deps,
    })
    expect(state.status).toBe('active')
    deps._tick(new Date(deps._now().getTime() + 14 * 60 * 1000))

    await endUserSession({ userId: 'u1', deps })

    expect(deps.rows.has('u1')).toBe(false)
    expect(deps.admits[0]?.session_units).toBe(0.3)
  })
})

describe('requestSession — desktop multi-session', () => {
  let deps: ReturnType<typeof makeDeps>
  beforeEach(() => {
    deps = makeDeps()
  })

  const PRO = FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID
  const FLASH = FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID
  const M3 = FREEBUFF_MINIMAX_M3_MODEL_ID

  test('admits one premium-bucket session plus several unlimited concurrently', async () => {
    const a = await requestSession({
      userId: 'u1', model: PRO, multiSession: true, instanceId: 'A', deps,
    })
    const b = await requestSession({
      userId: 'u1', model: FLASH, multiSession: true, instanceId: 'B', deps,
    })
    const c = await requestSession({
      userId: 'u1', model: FLASH, multiSession: true, instanceId: 'C', deps,
    })
    expect(a.status).toBe('active')
    expect(b.status).toBe('active')
    expect(c.status).toBe('active')
    expect(await deps.getActiveDesktopSessionCount!('u1')).toBe(3)
    // Single-session table is untouched in multi-session mode.
    expect(deps.rows.size).toBe(0)
  })

  test('a second premium-bucket session is rejected as premium_slot_taken', async () => {
    await requestSession({ userId: 'u1', model: PRO, multiSession: true, instanceId: 'A', deps })
    // MiniMax M3 is in the desktop premium concurrency bucket too.
    const b = await requestSession({ userId: 'u1', model: M3, multiSession: true, instanceId: 'B', deps })
    expect(b).toMatchObject({
      status: 'premium_slot_taken',
      requestedModel: M3,
      currentModel: PRO,
      currentInstanceId: 'A',
    })
  })

  test('premium slot frees after the holding session ends', async () => {
    await requestSession({ userId: 'u1', model: PRO, multiSession: true, instanceId: 'A', deps })
    const blocked = await requestSession({ userId: 'u1', model: M3, multiSession: true, instanceId: 'B', deps })
    expect(blocked.status).toBe('premium_slot_taken')
    await endUserSession({ userId: 'u1', multiSession: true, instanceId: 'A', deps })
    const ok = await requestSession({ userId: 'u1', model: M3, multiSession: true, instanceId: 'B', deps })
    expect(ok.status).toBe('active')
  })

  test('different users each get their own premium slot', async () => {
    const a = await requestSession({ userId: 'u1', model: PRO, multiSession: true, instanceId: 'A', deps })
    const b = await requestSession({ userId: 'u2', model: PRO, multiSession: true, instanceId: 'A', deps })
    expect(a.status).toBe('active')
    expect(b.status).toBe('active')
  })

  test('without the multiSession flag, behavior is unchanged (single-session table)', async () => {
    const s = await requestSession({ userId: 'u1', model: PRO, instanceId: 'A', deps })
    expect(s.status).toBe('active')
    expect(deps.rows.has('u1')).toBe(true)
    expect(deps.desktopRows.size).toBe(0)
  })

  test('per-user total concurrent cap rejects beyond the limit', async () => {
    for (let i = 0; i < FREEBUFF_DESKTOP_MAX_CONCURRENT_SESSIONS; i++) {
      const r = await requestSession({
        userId: 'u1', model: FLASH, multiSession: true, instanceId: `i${i}`, deps,
      })
      expect(r.status).toBe('active')
    }
    const over = await requestSession({
      userId: 'u1', model: FLASH, multiSession: true, instanceId: 'over', deps,
    })
    expect(over.status).toBe('rate_limited')
  })
})

describe('checkSessionAdmissible — desktop multi-session', () => {
  let deps: ReturnType<typeof makeDeps>
  beforeEach(() => {
    deps = makeDeps()
  })
  const FLASH = FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID

  test('validates the run against the per-tab desktop row by instance id', async () => {
    await requestSession({ userId: 'u1', model: FLASH, multiSession: true, instanceId: 'A', deps })
    const ok = await checkSessionAdmissible({
      userId: 'u1', claimedInstanceId: 'A', multiSession: true, requestedModel: FLASH, deps,
    })
    expect(ok.ok).toBe(true)
    // A different (unknown) instance id has no row → not admitted.
    const bad = await checkSessionAdmissible({
      userId: 'u1', claimedInstanceId: 'ZZZ', multiSession: true, requestedModel: FLASH, deps,
    })
    expect(bad.ok).toBe(false)
  })
})
