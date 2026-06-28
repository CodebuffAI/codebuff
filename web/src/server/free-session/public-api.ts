import {
  canFreebuffModelSpawnGeminiThinker,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEPLOYMENT_HOURS_LABEL,
  FREEBUFF_GLM_V52_MODEL_IDS,
  FREEBUFF_GLM_V52_SESSION_RESET_TIMEZONE,
  FREEBUFF_GLM_V52_SESSION_WINDOW_HOURS,
  FREEBUFF_LIMITED_SESSION_LIMIT,
  FREEBUFF_LIMITED_SESSION_PERIOD,
  FREEBUFF_LIMITED_SESSION_RESET_TIMEZONE,
  FREEBUFF_LIMITED_SESSION_WINDOW_HOURS,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_PREMIUM_MODEL_IDS,
  FREEBUFF_PREMIUM_SESSION_PERIOD,
  FREEBUFF_PREMIUM_SESSION_LIMIT,
  FREEBUFF_PREMIUM_SESSION_RESET_TIMEZONE,
  FREEBUFF_PREMIUM_SESSION_WINDOW_HOURS,
  FREEBUFF_WEEKLY_SESSION_PERIOD,
  isFreebuffGeminiProModelId,
  isFreebuffGlmV52ModelId,
  isFreebuffModelAllowedForAccessTier,
  isFreebuffModelAvailable,
  isFreebuffPremiumModelId,
  isSupportedFreebuffModelId,
  resolveFreebuffModelForAccessTier,
} from '@codebuff/common/constants/freebuff-models'
import {
  getZonedDayBounds,
  getZonedWeekBounds,
} from '@codebuff/common/util/zoned-time'
import { getGlmReferralEntitlement } from '@codebuff/billing/referral-program'

import {
  getIpSessionCap,
  IP_SESSION_LOG_FLOOR,
  getSessionGraceMs,
  getSessionLengthMs,
} from './config'
import {
  countActiveSessionsForIpHash,
  endSession,
  FreeSessionModelLockedError,
  getSessionRow,
  joinOrTakeOver,
  listRecentFreeSessionAdmits,
  pinMinimaxUpstreamToMinimax,
  promoteQueuedUser,
} from './store'
import { maybeSweepExpired } from './admission'
import { getFleetHealth, routeForAdmission } from './fireworks-health'
import { toSessionStateResponse } from './session-view'

import { sumStreakBonusUnits } from '@/db/freebuff-streak'
import { hasFireworksServerlessBackup } from '@/llm-api/fireworks-config'
import type { MiniMaxUpstream } from '@/llm-api/minimax-request-body'
import { deploymentTtftP90Ms } from '@/llm-api/fireworks-ttft'
import { logger } from '@/util/logger'

import type {
  FireworksHealth,
  FireworksRoute,
  FleetHealth,
} from './fireworks-health'
import type {
  FreebuffAccessTier,
  FreebuffStreakRewardPool,
} from '@codebuff/common/constants/freebuff-models'
import type {
  FreebuffSessionRateLimit,
  FreebuffSessionServerResponse,
} from '@codebuff/common/types/freebuff-session'
import type {
  FreeSessionCountryAccessMetadata,
  InternalSessionRow,
  SessionStateResponse,
} from './types'

function roundSessionUnits(units: number): number {
  return Math.round(units * 10) / 10
}

function canStartSession(snapshot: FreebuffSessionRateLimit): boolean {
  return snapshot.recentCount < snapshot.limit
}

type SessionQuotaInfo = Omit<FreebuffSessionRateLimit, 'model'>

interface SessionQuotaSnapshot {
  info: SessionQuotaInfo
  resetsAt: Date
}

interface SessionQuotaConfig {
  models: readonly string[]
  limit: number
  period: 'pacific_day' | 'pacific_week'
  resetTimeZone: string
  windowHours: number
  accessTier?: FreebuffAccessTier
  /** Streak-reward pool this quota draws bonus credits from. The gate adds any
   *  streak bonus units awarded in the current period to `limit`. */
  pool: FreebuffStreakRewardPool
}

/** GLM 5.2's per-user weekly session pool. Unlike the daily pools the limit is
 *  dynamic: it equals the caller's GLM referral entitlement (qualified GLM
 *  referrals, capped). A limit of 0 means the user has earned no GLM sessions,
 *  so admission is rejected as `rate_limited`. */
async function glmReferralQuotaConfig(
  userId: string,
  deps: SessionDeps,
): Promise<SessionQuotaConfig> {
  const limit = await deps.getGlmReferralEntitlement(userId)
  return {
    models: FREEBUFF_GLM_V52_MODEL_IDS,
    limit,
    period: FREEBUFF_WEEKLY_SESSION_PERIOD,
    resetTimeZone: FREEBUFF_GLM_V52_SESSION_RESET_TIMEZONE,
    windowHours: FREEBUFF_GLM_V52_SESSION_WINDOW_HOURS,
    pool: 'glm',
  }
}

/** Returns the session-quota config for `model`, or undefined when the model
 *  is unlimited. Only premium models count against (and are gated by) the
 *  shared daily session pool; full-tier non-premium ("Unlimited") models have
 *  no session quota. GLM 5.2 has its own weekly referral pool (see
 *  `glmReferralQuotaConfig`), resolved by the async callers before this. The
 *  broader per-request abuse ceiling lives in the Redis free-mode rate limiter,
 *  which spans every model. */
function quotaConfigForModel(
  model: string,
  accessTier: FreebuffAccessTier,
): SessionQuotaConfig | undefined {
  if (accessTier === 'full' && !isFreebuffPremiumModelId(model)) {
    return undefined
  }
  return quotaConfigForAccessTier(accessTier)
}

function quotaConfigForAccessTier(
  accessTier: FreebuffAccessTier,
): SessionQuotaConfig {
  if (accessTier === 'limited') {
    return {
      models: [FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID, FREEBUFF_MIMO_V25_MODEL_ID],
      limit: FREEBUFF_LIMITED_SESSION_LIMIT,
      period: FREEBUFF_LIMITED_SESSION_PERIOD,
      resetTimeZone: FREEBUFF_LIMITED_SESSION_RESET_TIMEZONE,
      windowHours: FREEBUFF_LIMITED_SESSION_WINDOW_HOURS,
      accessTier,
      pool: 'limited',
    }
  }
  return {
    models: FREEBUFF_PREMIUM_MODEL_IDS,
    limit: FREEBUFF_PREMIUM_SESSION_LIMIT,
    period: FREEBUFF_PREMIUM_SESSION_PERIOD,
    resetTimeZone: FREEBUFF_PREMIUM_SESSION_RESET_TIMEZONE,
    windowHours: FREEBUFF_PREMIUM_SESSION_WINDOW_HOURS,
    accessTier,
    pool: 'premium',
  }
}

async function fetchSessionQuotaSnapshot(
  userId: string,
  config: SessionQuotaConfig,
  deps: SessionDeps,
): Promise<SessionQuotaSnapshot> {
  const now = nowOf(deps)
  const bounds =
    config.period === 'pacific_week'
      ? getZonedWeekBounds(now, config.resetTimeZone)
      : getZonedDayBounds(now, config.resetTimeZone)
  const admits = await deps.listRecentFreeSessionAdmits({
    userId,
    since: bounds.startsAt,
    models: config.models,
    accessTier: config.accessTier,
  })
  const recentCount = roundSessionUnits(
    admits.reduce((sum, admit) => sum + admit.sessionUnits, 0),
  )
  // Fold in any streak-milestone bonus earned in this same period: a 7-day
  // streak raises today's premium/limited cap (or this week's GLM cap) by one
  // session. The CLI's "N of M used" line then shows the boosted M for free.
  const bonusUnits = await deps.getStreakBonusUnits({
    userId,
    pool: config.pool,
    since: bounds.startsAt,
  })
  const limit = roundSessionUnits(config.limit + bonusUnits)
  return {
    info: {
      limit,
      period: config.period,
      resetTimeZone: config.resetTimeZone,
      resetAt: bounds.resetsAt.toISOString(),
      windowHours: config.windowHours,
      recentCount,
    },
    resetsAt: bounds.resetsAt,
  }
}

function toRateLimitInfo(
  model: string,
  snapshot: SessionQuotaSnapshot,
): FreebuffSessionRateLimit {
  return {
    model,
    ...snapshot.info,
  }
}

/** Fetch the caller's current shared premium-session quota snapshot for
 *  `model`, or undefined if the model is unlimited. Used by both POST (after
 *  admit) and GET polls so the CLI's "N of M sessions used" line stays live
 *  instead of disappearing after the first poll. */
async function fetchRateLimitSnapshot(
  userId: string,
  model: string,
  accessTier: FreebuffAccessTier,
  deps: SessionDeps,
): Promise<
  | {
      info: FreebuffSessionRateLimit
      resetsAt: Date
    }
  | undefined
> {
  // GLM 5.2 uses its own weekly referral pool with a per-user dynamic limit,
  // resolved before the static daily-pool config.
  if (isFreebuffGlmV52ModelId(model)) {
    const config = await glmReferralQuotaConfig(userId, deps)
    const snapshot = await fetchSessionQuotaSnapshot(userId, config, deps)
    return {
      info: toRateLimitInfo(model, snapshot),
      resetsAt: snapshot.resetsAt,
    }
  }
  const config = quotaConfigForModel(model, accessTier)
  if (!config) return undefined
  const snapshot = await fetchSessionQuotaSnapshot(userId, config, deps)
  return {
    info: toRateLimitInfo(model, snapshot),
    resetsAt: snapshot.resetsAt,
  }
}

async function fetchRateLimitsByModel(
  userId: string,
  accessTier: FreebuffAccessTier,
  deps: SessionDeps,
): Promise<Record<string, FreebuffSessionRateLimit>> {
  const config = quotaConfigForAccessTier(accessTier)
  const snapshot = await fetchSessionQuotaSnapshot(userId, config, deps)
  // GLM's weekly referral pool is deliberately NOT folded in here: this runs on
  // every session poll, and GLM usage is surfaced via the dedicated `referral`
  // block on the landing response instead, so we keep the hot path to a single
  // admits query.
  return Object.fromEntries(
    config.models.map(
      (model) => [model, toRateLimitInfo(model, snapshot)] as const,
    ),
  )
}

function onlyUsedRateLimitsByModel(
  rateLimitsByModel: Record<string, FreebuffSessionRateLimit>,
): Record<string, FreebuffSessionRateLimit> {
  return Object.fromEntries(
    Object.entries(rateLimitsByModel).filter(
      ([, snapshot]) => snapshot.recentCount > 0,
    ),
  )
}

function nonEmptyRateLimitsByModel(
  rateLimitsByModel: Record<string, FreebuffSessionRateLimit>,
): { rateLimitsByModel: Record<string, FreebuffSessionRateLimit> } | {} {
  return Object.keys(rateLimitsByModel).length > 0 ? { rateLimitsByModel } : {}
}

export interface SessionDeps {
  getSessionRow: (userId: string) => Promise<InternalSessionRow | null>
  joinOrTakeOver: (params: {
    userId: string
    model: string
    accessTier: FreebuffAccessTier
    now: Date
    countryAccess?: FreeSessionCountryAccessMetadata
  }) => Promise<InternalSessionRow>
  endSession: (params: {
    userId: string
    now: Date
    sessionLengthMs: number
  }) => Promise<void>
  /** Log-only abuse instrumentation: number of active sessions sharing one
   *  hashed egress IP, sampled at fresh admission. Feeds the per-IP
   *  concurrency log; does not gate admission (see `requestSession`). */
  countActiveSessionsForIpHash: (clientIpHash: string) => Promise<number>
  /** Rate-limit helper: oldest-first free-session admissions since today's
   *  Pacific midnight reset. */
  listRecentFreeSessionAdmits: (params: {
    userId: string
    models: readonly string[]
    since: Date
    accessTier?: FreebuffAccessTier
  }) => Promise<{ admittedAt: Date; model: string; sessionUnits: number }[]>
  /** The caller's GLM 5.2 weekly session entitlement: number of qualified GLM
   *  referrals (capped). Drives the dynamic limit of the GLM weekly pool.
   *  Indirected through deps so the session tests can set it without seeding
   *  referral rows. */
  getGlmReferralEntitlement: (userId: string) => Promise<number>
  /** Streak-reward bonus session units for `userId` in `pool` awarded since the
   *  current period start. Added to the pool's base limit so a 7-day streak
   *  milestone grants an extra session. Indirected through deps so session tests
   *  can set it without seeding reward rows. Defaults to 0. */
  getStreakBonusUnits: (params: {
    userId: string
    pool: FreebuffStreakRewardPool
    since: Date
  }) => Promise<number>
  /** Admission: flips a freshly-joined queued row to active in the same
   *  request (every free session is admitted immediately — there is no queue).
   *  Returns the updated row or null if the row wasn't in a queued state. */
  promoteQueuedUser: (params: {
    userId: string
    model: string
    sessionLengthMs: number
    now: Date
    fireworksRoute?: FireworksRoute | null
  }) => Promise<InternalSessionRow | null>
  /** Reactively pin a session to the official MiniMax API after Fireworks
   *  rate-limited it. Sticky for the session's life so the prompt cache stays
   *  warm. No-op when the session row is absent (waiting room off). */
  pinMinimaxUpstream: (params: { userId: string; now: Date }) => Promise<void>
  /** Cached Fireworks fleet-health snapshot, used at admission time to pin
   *  a backup-capable session to 'deployment' (healthy) or 'serverless'
   *  (degraded/unhealthy) for its whole life. */
  getFleetHealth: () => Promise<FleetHealth>
  /** Recent measured p90 TTFT (ms) for the model's dedicated deployment, or
   *  undefined when there aren't enough samples. Over 2s pins new sessions to
   *  serverless even while Prometheus health still reads healthy. */
  getDeploymentTtftP90Ms: (model: string) => number | undefined
  /** Plain values, not getters: these never change at runtime. The deps
   *  interface uses values rather than thunks so tests can pass numbers
   *  inline without wrapping. */
  graceMs: number
  sessionLengthMs: number
  /** Candidate per-IP concurrent-session cap (log-only today — see
   *  `requestSession`). The emit floor is the fixed `IP_SESSION_LOG_FLOOR`
   *  constant, not injected. */
  ipSessionCap: number
  /** Best-effort, throttled traffic-driven expiry sweep. Called fire-and-forget
   *  from the hot path so cleanup survives a starved/dead admission interval.
   *  Optional + omitted in unit tests (no real DB); prod wires the real
   *  throttled sweep via `defaultDeps`. */
  maybeSweepExpired?: () => void | Promise<void>
  now?: () => Date
}

const defaultDeps: SessionDeps = {
  getSessionRow,
  joinOrTakeOver,
  endSession,
  countActiveSessionsForIpHash,
  listRecentFreeSessionAdmits,
  getGlmReferralEntitlement: (userId: string) =>
    getGlmReferralEntitlement({ userId }),
  getStreakBonusUnits: (params) => sumStreakBonusUnits(params),
  promoteQueuedUser,
  pinMinimaxUpstream: pinMinimaxUpstreamToMinimax,
  getFleetHealth,
  getDeploymentTtftP90Ms: deploymentTtftP90Ms,
  get graceMs() {
    // Read-through getter keeps the default deps aligned with config while
    // tests can still inject a plain graceMs value through SessionDeps.
    return getSessionGraceMs()
  },
  get sessionLengthMs() {
    return getSessionLengthMs()
  },
  get ipSessionCap() {
    return getIpSessionCap()
  },
  maybeSweepExpired,
}

const nowOf = (deps: SessionDeps): Date => (deps.now ?? (() => new Date()))()

/**
 * The caller's GLM 5.2 weekly session balance, for the CLI referral banner:
 * `limit` is their entitlement (capped qualified GLM referrals), `used` is the
 * GLM sessions started since this week's Pacific reset, `remaining` is the
 * floor-0 difference, and `resetAt` is the next reset. Reuses the same weekly
 * pool the admission gate enforces, so the banner and the gate never disagree.
 */
export async function getGlmWeeklyUsage(
  userId: string,
  deps: SessionDeps = defaultDeps,
): Promise<{
  /** Effective weekly cap: referral entitlement + any streak-bonus GLM session
   *  earned this week. Drives `remaining` so the banner matches the gate. */
  limit: number
  /** Pure referral entitlement (capped qualified GLM referrals), excluding the
   *  streak bonus. This is the user's actual referral count for "(N/cap)" copy —
   *  keep it separate from `limit` so the streak bonus never inflates it. */
  referralLimit: number
  used: number
  remaining: number
  resetAt: string
}> {
  const config = await glmReferralQuotaConfig(userId, deps)
  const snapshot = await fetchSessionQuotaSnapshot(userId, config, deps)
  const used = snapshot.info.recentCount
  // The snapshot's limit already folds in the streak bonus; config.limit is the
  // bonus-free referral entitlement.
  const limit = snapshot.info.limit
  return {
    limit,
    referralLimit: config.limit,
    used,
    remaining: Math.max(0, limit - used),
    resetAt: snapshot.resetsAt.toISOString(),
  }
}

/**
 * Log-only abuse instrumentation, fired once per **fresh** instant-admission
 * (not on reclaim/takeover — those hold an existing slot). Counts the active
 * sessions now sharing this admission's hashed egress IP and logs what a per-IP
 * concurrent-session cap *would* block — it never rejects the request.
 *
 * Why log-only first: a hard per-IP cap is the structural fix for admit-and-idle
 * registration farms (2026-06-20: ~605 idle sessions on one `client_ip_hash`),
 * but a residential / CGNAT / campus IP also legitimately shares one hash across
 * several users. This phase measures that shared-NAT concurrency ceiling from
 * real traffic so the eventual cap is set above it. Query `metric =
 * "freebuff_ip_session_cap"` in the freebuff Axiom dataset; `wouldBlock` marks
 * admissions the current `ipSessionCap` guess would have rejected. See
 * docs/freebuff-abuse-detection.md ("Mitigation gap").
 *
 * `countActiveSessionsForIpHash` runs after promotion, so `activeForIp` includes
 * the just-admitted row (i.e. it is the post-admit concurrency for the hash).
 */
async function logIpSessionConcurrency(
  params: { userId: string; countryAccess?: FreeSessionCountryAccessMetadata },
  model: string,
  deps: SessionDeps,
): Promise<void> {
  const clientIpHash = params.countryAccess?.clientIpHash
  if (!clientIpHash) return
  const activeForIp = await deps.countActiveSessionsForIpHash(clientIpHash)
  if (activeForIp < IP_SESSION_LOG_FLOOR) return
  logger.info(
    {
      metric: 'freebuff_ip_session_cap',
      userId: params.userId,
      model,
      clientIpHash,
      countryCode: params.countryAccess?.countryCode ?? null,
      activeForIp,
      cap: deps.ipSessionCap,
      wouldBlock: activeForIp > deps.ipSessionCap,
      enforced: false,
    },
    '[FreeSession] per-IP concurrent-session count at admission (log-only)',
  )
}

function isSessionRowCompatibleWithAccessTier(
  row: InternalSessionRow,
  accessTier: FreebuffAccessTier,
): boolean {
  if (accessTier === 'limited' && (row.access_tier ?? 'full') !== 'limited') {
    return false
  }
  return isFreebuffModelAllowedForAccessTier(row.model, accessTier)
}

async function viewForRow(
  userId: string,
  deps: SessionDeps,
  row: InternalSessionRow,
): Promise<SessionStateResponse | null> {
  // Free sessions are admitted immediately, so a row is never persisted as
  // `queued` between requests — no queue position or depth to compute.
  return toSessionStateResponse({
    row,
    graceMs: deps.graceMs,
    now: nowOf(deps),
  })
}

export type RequestSessionResult =
  | SessionStateResponse
  | {
      /** User asked to switch to a different model while their active session
       *  is still bound to another. The CLI must end the existing session
       *  first (DELETE /session) before requesting the new model. */
      status: 'model_locked'
      accessTier?: FreebuffAccessTier
      currentModel: string
      requestedModel: string
    }
  | {
      /** User has hit the premium-model admission quota for the current Pacific
       *  day. See `FreebuffSessionServerResponse`'s `rate_limited` variant. */
      status: 'rate_limited'
      accessTier?: FreebuffAccessTier
      model: string
      limit: number
      period: 'pacific_day' | 'pacific_week'
      resetTimeZone: string
      resetAt: string
      windowHours: number
      recentCount: number
      retryAfterMs: number
    }
  | {
      status: 'model_unavailable'
      accessTier?: FreebuffAccessTier
      requestedModel: string
      availableHours: string
    }

/**
 * Promote the caller's freshly-joined queued row to active, pinning the
 * Fireworks upstream from current deployment health. Returns the active row, or
 * null if the model-scoped `promoteQueuedUser` matched nothing (a concurrent
 * same-account request changed the row first — see the recovery in
 * `requestSession`). Only backup-capable models (e.g. minimax/minimax-m3) need
 * the health probe; it's cached (~25s) so this is a cheap map read on the hot
 * path. The pin is decided once here and frozen for the session — see
 * `routeForAdmission`.
 */
async function admitQueuedRow(
  params: { userId: string; countryAccess?: FreeSessionCountryAccessMetadata },
  model: string,
  now: Date,
  deps: SessionDeps,
): Promise<InternalSessionRow | null> {
  let fireworksRoute: FireworksRoute | null = null
  let pinnedHealth: FireworksHealth | undefined
  let pinnedTtftP90Ms: number | undefined
  if (hasFireworksServerlessBackup(model)) {
    const fleet = await deps.getFleetHealth()
    pinnedHealth = fleet[model] ?? 'healthy'
    pinnedTtftP90Ms = deps.getDeploymentTtftP90Ms(model)
    fireworksRoute = routeForAdmission(model, fleet, pinnedTtftP90Ms)
  }
  const promoted = await deps.promoteQueuedUser({
    userId: params.userId,
    model,
    sessionLengthMs: deps.sessionLengthMs,
    now,
    fireworksRoute,
  })
  if (!promoted) return null
  // One log per fresh admission of a backup-capable model (M3) — not on
  // takeover/reclaim, which keeps the existing pin. The metric tag makes the
  // deployment-vs-serverless split chartable in the freebuff Axiom dataset, and
  // `health` shows what drove it. Gated to backup-capable models so it stays
  // low-volume.
  if (fireworksRoute) {
    logger.info(
      {
        metric: 'freebuff_fireworks_route',
        userId: params.userId,
        model,
        route: fireworksRoute,
        health: pinnedHealth,
        ttftP90Ms: pinnedTtftP90Ms,
      },
      '[FreeSession] pinned fireworks upstream at admission',
    )
  }
  await logIpSessionConcurrency(params, model, deps)
  return promoted
}

/**
 * Client calls this on CLI startup with the model they want to use. Every
 * caller is admitted immediately — there is no waiting room, FIFO queue, or
 * capacity cap; a freshly created row is `queued` only transiently within this
 * call and is promoted to `active` before returning. Semantics:
 *   - No existing session → create + admit an active session for `model`
 *   - Existing active (unexpired), same model → rotate instance_id (takeover)
 *   - Existing active (unexpired), different model → { status: 'model_locked' }
 *   - Existing expired / different model → re-admit a fresh active session
 *   - Banned / rate-limited / model unavailable → corresponding status
 *
 * `joinOrTakeOver` (when it doesn't throw) always returns a row that maps to
 * a non-null view, so the cast below is sound.
 */
export async function requestSession(params: {
  userId: string
  model: string
  accessTier?: FreebuffAccessTier
  userEmail?: string | null | undefined
  countryAccess?: FreeSessionCountryAccessMetadata
  /** True if the account is banned. Short-circuited here so banned bots never
   *  create a session row at all. */
  userBanned?: boolean
  deps?: SessionDeps
}): Promise<RequestSessionResult> {
  const deps = params.deps ?? defaultDeps
  const accessTier = params.accessTier ?? 'full'
  const model = resolveFreebuffModelForAccessTier(params.model, accessTier)
  const now = nowOf(deps)
  if (params.userBanned) {
    return { status: 'banned' }
  }

  // Traffic-driven expiry sweep: keep expired rows from accumulating without a
  // background tick. Throttled and fire-and-forget — never blocks the request.
  void deps.maybeSweepExpired?.()

  // Rate-limit check runs before joinOrTakeOver so heavy users never even
  // create a queued row. Premium models share one daily Pacific-time
  // session-unit pool; Unlimited models fall through unchanged (no session
  // quota — only the Redis free-mode limiter, which spans all models, gates
  // them).
  //
  // Takeover/reclaim exception: a user who already holds a queued or
  // active+unexpired row on this same model is re-anchoring (CLI restart,
  // same-account tab switch) rather than starting a new session. Admit
  // counts are written at promotion time, so the quota only needs to gate
  // fresh admissions — blocking a reclaim here would strand a user with an
  // active 5th session unable to reconnect after a CLI restart.
  let existing = await deps.getSessionRow(params.userId)
  if (existing && !isSessionRowCompatibleWithAccessTier(existing, accessTier)) {
    await deps.endSession({
      userId: params.userId,
      now,
      sessionLengthMs: deps.sessionLengthMs,
    })
    existing = null
  }
  const isReclaim =
    !!existing &&
    existing.model === model &&
    (existing.access_tier ?? 'full') === accessTier &&
    (existing.status === 'queued' ||
      (existing.status === 'active' &&
        !!existing.expires_at &&
        existing.expires_at.getTime() > now.getTime()))

  if (!isReclaim && !isFreebuffModelAvailable(model, now)) {
    return {
      status: 'model_unavailable',
      requestedModel: model,
      availableHours: FREEBUFF_DEPLOYMENT_HOURS_LABEL,
    }
  }

  if (!isReclaim) {
    const snapshot = await fetchRateLimitSnapshot(
      params.userId,
      model,
      accessTier,
      deps,
    )
    if (snapshot && !canStartSession(snapshot.info)) {
      const retryAfterMs = Math.max(
        0,
        snapshot.resetsAt.getTime() - now.getTime(),
      )
      return {
        ...snapshot.info,
        status: 'rate_limited',
        accessTier,
        retryAfterMs,
      }
    }
  }

  let row: InternalSessionRow
  try {
    row = await deps.joinOrTakeOver({
      userId: params.userId,
      model,
      accessTier,
      now,
      countryAccess: params.countryAccess,
    })
  } catch (err) {
    if (err instanceof FreeSessionModelLockedError) {
      return {
        status: 'model_locked',
        currentModel: err.currentModel,
        requestedModel: model,
        accessTier,
      }
    }
    throw err
  }

  // Admit immediately. There is no waiting room or capacity cap — a freshly
  // joined row is `queued` only transiently within this request; we flip it to
  // active right here. (Takeover/reclaim of an already-active row stays active
  // and skips this block, preserving its existing upstream pin.)
  if (row.status === 'queued') {
    let admitted = await admitQueuedRow(params, model, now, deps)
    if (!admitted) {
      // Our model-scoped `promoteQueuedUser` matched nothing: a concurrent
      // request for this same account changed the row between `joinOrTakeOver`
      // and the promote — e.g. a near-simultaneous model switch flipped the
      // queued row to the other model (and likely admitted it). Recover without
      // failing: if a concurrent request already made the row active, use it;
      // otherwise promote whatever queued row now exists. We never throw — every
      // queued row is promoted by some request, and a GET poll self-heals any
      // residual transient `queued`, so a 500 here would be strictly worse.
      const current = await deps.getSessionRow(params.userId)
      if (current?.status === 'active') {
        admitted = current
      } else if (current?.status === 'queued') {
        admitted = await admitQueuedRow(params, current.model, now, deps)
      }
    }
    if (admitted) row = admitted
  }

  const view = await viewForRow(params.userId, deps, row)
  if (!view) {
    throw new Error(
      `joinOrTakeOver returned a row that maps to no view (user=${params.userId})`,
    )
  }
  return attachRateLimit(params.userId, view, deps)
}

/** Thread the current quota snapshot onto active/ended views so the
 *  CLI can render "N of M sessions used" — both during the session and on
 *  the post-session banner. Other statuses pass through unchanged. Called on
 *  both POST and GET so the line stays live across polls. */
async function attachRateLimit(
  userId: string,
  view: SessionStateResponse,
  deps: SessionDeps,
): Promise<SessionStateResponse> {
  if (view.status !== 'active' && view.status !== 'ended') {
    return view
  }
  const accessTier = view.accessTier ?? 'full'
  const allRateLimitsByModel = await fetchRateLimitsByModel(
    userId,
    accessTier,
    deps,
  )
  // The ended view doesn't carry a model id, so it gets the full snapshot
  // unfiltered — the banner reads any entry's recentCount (they all share the
  // same daily premium pool). Active filters out unused models so the
  // status bar doesn't list every premium model with a "0 used today" hint.
  if (view.status === 'ended') {
    return { ...view, rateLimitsByModel: allRateLimitsByModel }
  }
  // GLM isn't in the shared snapshot (its weekly pool is kept off the per-poll
  // path). Resolve the bound model's quota directly only when the session is
  // actually on GLM — so an active GLM session carries its weekly `rateLimit`
  // (the CLI status bar then shows the 1-hour countdown instead of treating it
  // as an unlimited model). One extra query, and only for GLM sessions.
  let rateLimit: FreebuffSessionRateLimit | undefined =
    allRateLimitsByModel[view.model]
  if (!rateLimit && isFreebuffGlmV52ModelId(view.model)) {
    rateLimit = (
      await fetchRateLimitSnapshot(userId, view.model, accessTier, deps)
    )?.info
  }
  return {
    ...view,
    ...(rateLimit ? { rateLimit } : {}),
    ...nonEmptyRateLimitsByModel(
      onlyUsedRateLimitsByModel(allRateLimitsByModel),
    ),
  }
}

/**
 * Check of the caller's current state. Does not rotate `instance_id`. The CLI
 * sends its currently-held `claimedInstanceId` so we can return `superseded`
 * if a newer CLI on the same account took over. Mutates only to clear rows
 * that the current access tier can no longer use, so they don't leak queue or
 * active capacity after the CLI receives `none`.
 *
 * Returns:
 *   - `none` when the user has no row at all (or the row was swept past
 *     the grace window, or is still transiently queued)
 *   - `superseded` when the caller's id no longer matches the stored one
 *     (active sessions only)
 *   - `active` / `ended` otherwise (see `toSessionStateResponse`)
 */
export async function getSessionState(params: {
  userId: string
  accessTier?: FreebuffAccessTier
  userEmail?: string | null | undefined
  userBanned?: boolean
  claimedInstanceId?: string | null | undefined
  deps?: SessionDeps
}): Promise<FreebuffSessionServerResponse> {
  const deps = params.deps ?? defaultDeps
  const accessTier = params.accessTier ?? 'full'
  if (params.userBanned) {
    return { status: 'banned' }
  }
  const row = await deps.getSessionRow(params.userId)

  // Build a `none` response with per-user quota snapshots so exhausted models
  // are visible in the CLI's pre-join picker before POST.
  const noneResponse = async (): Promise<FreebuffSessionServerResponse> => {
    const rateLimitsByModel = await fetchRateLimitsByModel(
      params.userId,
      accessTier,
      deps,
    )
    return {
      status: 'none',
      accessTier,
      ...nonEmptyRateLimitsByModel(
        onlyUsedRateLimitsByModel(rateLimitsByModel),
      ),
    }
  }

  if (!row) return noneResponse()

  if (!isSessionRowCompatibleWithAccessTier(row, accessTier)) {
    await deps.endSession({
      userId: params.userId,
      now: nowOf(deps),
      sessionLengthMs: deps.sessionLengthMs,
    })
    return noneResponse()
  }

  if (
    row.status === 'active' &&
    params.claimedInstanceId &&
    params.claimedInstanceId !== row.active_instance_id
  ) {
    return { status: 'superseded' }
  }

  const view = await viewForRow(params.userId, deps, row)
  if (!view) return noneResponse()
  return attachRateLimit(params.userId, view, deps)
}

export async function endUserSession(params: {
  userId: string
  userEmail?: string | null | undefined
  deps?: SessionDeps
}): Promise<void> {
  const deps = params.deps ?? defaultDeps
  await deps.endSession({
    userId: params.userId,
    now: nowOf(deps),
    sessionLengthMs: deps.sessionLengthMs,
  })
}

/**
 * Reactively pin a user's free session to the official MiniMax API after the
 * Fireworks serverless API rate-limited it. Called from the chat hot path when
 * a MiniMax-family fallback model (e.g. M3) gets a 429 from Fireworks. The pin
 * is sticky for the session's life so we never re-pay the prompt-cache miss of
 * switching upstreams. Best-effort and idempotent; a no-op when no session row
 * exists (waiting room off).
 */
export async function pinFreeSessionToMinimax(
  userId: string,
  deps: SessionDeps = defaultDeps,
): Promise<void> {
  await deps.pinMinimaxUpstream({ userId, now: nowOf(deps) })
}

export type SessionGateResult =
  // `disabled` is no longer produced by `checkSessionAdmissible` (free-session
  // enforcement is always on), but kept as an "allowed, nothing to pin" result
  // so callers/tests have a neutral ok-variant.
  | { ok: true; reason: 'disabled' }
  | {
      ok: true
      reason: 'active'
      remainingMs: number
      /** Sticky upstream pin for this session (see `routeForAdmission`). The
       *  chat hot path forwards it as `useCustomDeployment` so the request
       *  goes to the same Fireworks upstream the session was admitted on.
       *  Undefined for sessions with no pin (older rows, no serverless backup). */
      fireworksRoute?: FireworksRoute
      /** Sticky MiniMax upstream pin: 'minimax' once Fireworks rate-limited this
       *  session, so M3 requests go to the official MiniMax API (warm cache).
       *  Undefined → default (Fireworks serverless). See minimax-m3-router.ts. */
      minimaxUpstream?: MiniMaxUpstream
    }
  | {
      ok: true
      reason: 'draining'
      /** Time remaining until the hard cutoff (`expires_at + grace`). */
      gracePeriodRemainingMs: number
      /** See the `active` variant — same sticky upstream pin. */
      fireworksRoute?: FireworksRoute
      /** See the `active` variant — same sticky MiniMax upstream pin. */
      minimaxUpstream?: MiniMaxUpstream
    }
  | { ok: false; code: 'waiting_room_required'; message: string }
  | { ok: false; code: 'waiting_room_queued'; message: string }
  | { ok: false; code: 'session_superseded'; message: string }
  | { ok: false; code: 'session_expired'; message: string }
  /** Active session locked to a different model than the one requested. The
   *  CLI should restart its session (DELETE then POST) to switch models. */
  | { ok: false; code: 'session_model_mismatch'; message: string }
  /** Pre-waiting-room CLI that never sends an instance id. Surfaced as a
   *  distinct code so the caller can prompt the user to restart. */
  | { ok: false; code: 'freebuff_update_required'; message: string }

/**
 * Called from the chat/completions hot path for free-mode requests. Either
 * returns `{ ok: true }` (request may proceed) or a structured rejection
 * the caller translates into a 4xx response.
 *
 * Never trusts client timestamps. The caller supplies `claimedInstanceId`
 * exactly as the CLI sent it; we compare against the server-stored
 * active_instance_id. Does a single DB read (the row); we intentionally do
 * NOT compute queue position on rejection — the client polls GET /session
 * for that detail.
 */
export async function checkSessionAdmissible(params: {
  userId: string
  accessTier?: FreebuffAccessTier
  userEmail?: string | null | undefined
  claimedInstanceId: string | null | undefined
  /** Forces a real active session row check even when the waiting room is
   *  globally disabled or the user email normally bypasses it. Use for
   *  subagent/model combinations that must be bound to trusted session state. */
  requireActiveSession?: boolean
  /** Model the chat-completions request is for. When provided, the gate
   *  rejects requests whose model doesn't match the active session's model
   *  so a stale CLI tab can't slip a request through under the wrong model. */
  requestedModel?: string | null | undefined
  deps?: SessionDeps
}): Promise<SessionGateResult> {
  const deps = params.deps ?? defaultDeps
  const accessTier = params.accessTier ?? 'full'

  // Pre-waiting-room CLIs never send a freebuff_instance_id. Classify that up
  // front so the caller gets a distinct code (→ 426 Upgrade Required) and the
  // user sees a clear "please restart" message instead of a gate reject they
  // can't interpret.
  if (!params.claimedInstanceId) {
    return {
      ok: false,
      code: 'freebuff_update_required',
      message:
        'This version of freebuff is out of date. Please restart freebuff to upgrade and continue using free mode.',
    }
  }

  const row = await deps.getSessionRow(params.userId)

  if (!row) {
    return {
      ok: false,
      code: 'waiting_room_required',
      message:
        'No active free session. Call POST /api/v1/freebuff/session first.',
    }
  }

  if (row.status === 'queued') {
    return {
      ok: false,
      code: 'waiting_room_queued',
      message:
        'You are in the waiting room. Poll GET /api/v1/freebuff/session for your position.',
    }
  }

  const now = nowOf(deps)
  const nowMs = now.getTime()
  const expiresAtMs = row.expires_at?.getTime() ?? 0
  const graceMs = deps.graceMs
  // Past the hard cutoff (`expires_at + grace`). The grace window lets the CLI
  // finish an in-flight agent run after the user's session ended; once it's
  // gone, we fall back to the same re-queue flow as a regular expiry.
  if (!row.expires_at || expiresAtMs + graceMs <= nowMs) {
    return {
      ok: false,
      code: 'session_expired',
      message:
        'Your free session has expired. Re-join the waiting room via POST /api/v1/freebuff/session.',
    }
  }

  if (params.claimedInstanceId !== row.active_instance_id) {
    return {
      ok: false,
      code: 'session_superseded',
      message:
        'Another instance of freebuff has taken over this session. Only one instance per account is allowed.',
    }
  }

  if (!isSessionRowCompatibleWithAccessTier(row, accessTier)) {
    return {
      ok: false,
      code: 'session_model_mismatch',
      message:
        'This free session is not valid for limited access. Restart freebuff to switch to a limited model.',
    }
  }

  if (
    accessTier === 'limited' &&
    params.requestedModel &&
    isSupportedFreebuffModelId(params.requestedModel) &&
    !isFreebuffModelAllowedForAccessTier(params.requestedModel, accessTier)
  ) {
    return {
      ok: false,
      code: 'session_model_mismatch',
      message:
        'Limited free access is only available with DeepSeek V4 Flash or MiMo 2.5.',
    }
  }

  // Smart freebuff models (Kimi, DeepSeek) can spawn the gemini-thinker
  // child agent which calls Gemini Pro under the hood. The cost-mode gate
  // already allowlists that combo; here we allow the request through against
  // the parent's session row instead of rejecting on model mismatch.
  const isSmartSessionGeminiThinker =
    params.requireActiveSession === true &&
    isFreebuffGeminiProModelId(params.requestedModel) &&
    canFreebuffModelSpawnGeminiThinker(row.model)

  // Reject requests for a model the session isn't bound to. Sub-agents may
  // legitimately use other models (Gemini Flash etc.) so we only enforce this
  // when the caller provides a requestedModel and it is either a supported
  // freebuff root model or the gemini-thinker model.
  if (
    params.requestedModel &&
    (isSupportedFreebuffModelId(params.requestedModel) ||
      isFreebuffGeminiProModelId(params.requestedModel)) &&
    params.requestedModel !== row.model &&
    !isSmartSessionGeminiThinker
  ) {
    return {
      ok: false,
      code: 'session_model_mismatch',
      message: `This session is bound to ${row.model}; restart freebuff to switch models.`,
    }
  }

  // Forward the session's sticky upstream pins so the chat hot path keeps every
  // request on the upstream the session was admitted on / diverted to (warm
  // prompt cache). `fireworksRoute` is the admission-time deployment pin;
  // `minimaxUpstream` is the reactive MiniMax pin set on a Fireworks rate limit.
  const fireworksRoute = row.fireworks_route ?? undefined
  const minimaxUpstream = row.minimax_upstream ?? undefined

  if (expiresAtMs > nowMs) {
    return {
      ok: true,
      reason: 'active',
      remainingMs: expiresAtMs - nowMs,
      fireworksRoute,
      minimaxUpstream,
    }
  }

  // Inside the grace window: still admit so the agent can finish, but signal
  // to the caller (and via metrics) that no new user prompts should arrive.
  return {
    ok: true,
    reason: 'draining',
    gracePeriodRemainingMs: expiresAtMs + graceMs - nowMs,
    fireworksRoute,
    minimaxUpstream,
  }
}
