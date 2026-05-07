import { NextResponse } from 'next/server'
import { env } from '@codebuff/internal/env'

import {
  endUserSession,
  getSessionState,
  requestSession,
} from '@/server/free-session/public-api'
import { getSessionRow as getStoredSessionRow } from '@/server/free-session/store'
import {
  FREE_MODE_ALLOWED_COUNTRIES,
  getFreeModeCountryAccess,
  IPINFO_PRIVACY_CACHE_TTL_MS,
} from '@/server/free-mode-country'
import { extractApiKeyFromHeader } from '@/util/auth'

import type { FreeModeCountryAccess } from '@/server/free-mode-country'
import type {
  FreeSessionCountryAccessMetadata,
  InternalSessionRow,
} from '@/server/free-session/types'
import type { SessionDeps } from '@/server/free-session/public-api'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

/** Early country gate. Mirrors the chat/completions check: require a resolved
 *  allowlisted country before joining the queue. Unknown/anonymized locations
 *  are treated as blocked because they commonly indicate VPN, Tor, localhost,
 *  or proxy traffic.
 *
 *  Returns HTTP 403 (not 200) so older CLIs — which don't know the
 *  `country_blocked` status and would tight-poll on an unrecognized 200
 *  body — fall into their existing `!resp.ok` error path and back off on
 *  the 10s error retry cadence. The new CLI parses the 403 body directly. */
type GetCountryAccessFn = (req: NextRequest) => Promise<FreeModeCountryAccess>

async function getCountryAccess(
  req: NextRequest,
  deps: FreebuffSessionDeps,
): Promise<FreeModeCountryAccess> {
  return (
    deps.getCountryAccess?.(req) ??
    getFreeModeCountryAccess(req, {
      ipinfoToken: env.IPINFO_TOKEN,
      ipHashSecret: env.NEXTAUTH_SECRET,
      allowLocalhost: env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev',
    })
  )
}

function toSessionCountryAccess(
  countryAccess: FreeModeCountryAccess,
): FreeSessionCountryAccessMetadata {
  return {
    countryCode: countryAccess.countryCode,
    cfCountry: countryAccess.cfCountry,
    geoipCountry: countryAccess.geoipCountry,
    blockReason: countryAccess.blockReason,
    ipPrivacySignals: countryAccess.ipPrivacy?.signals ?? null,
    clientIpHash: countryAccess.clientIpHash,
    checkedAt: new Date(),
  }
}

async function countryBlockedResponse(
  req: NextRequest,
  deps: FreebuffSessionDeps,
): Promise<{
  response: NextResponse | null
  countryAccess: FreeModeCountryAccess
}> {
  const countryAccess = await getCountryAccess(req, deps)
  if (countryAccess.allowed) {
    return { response: null, countryAccess }
  }
  return {
    response: NextResponse.json(
      {
        status: 'country_blocked',
        countryCode: countryAccess.countryCode ?? 'UNKNOWN',
        countryBlockReason: countryAccess.blockReason,
        ipPrivacySignals: countryAccess.ipPrivacy?.signals,
      },
      { status: 403 },
    ),
    countryAccess,
  }
}

function hasRecentAllowedCountryCheck(
  row: InternalSessionRow | null,
  now: Date,
): boolean {
  if (!row?.country_checked_at || row.country_block_reason !== null) {
    return false
  }
  if (!row.country_code || !FREE_MODE_ALLOWED_COUNTRIES.has(row.country_code)) {
    return false
  }
  return (
    now.getTime() - row.country_checked_at.getTime() <
    IPINFO_PRIVACY_CACHE_TTL_MS
  )
}

async function shouldSkipGetCountryCheck(
  userId: string,
  deps: FreebuffSessionDeps,
): Promise<boolean> {
  const getSessionRow = deps.sessionDeps?.getSessionRow ?? getStoredSessionRow
  const row = await getSessionRow(userId)
  const now = deps.sessionDeps?.now?.() ?? new Date()
  return hasRecentAllowedCountryCheck(row, now)
}

/** Header the CLI uses to identify which instance is polling. Used by GET to
 *  detect when another CLI on the same account has rotated the id. */
export const FREEBUFF_INSTANCE_HEADER = 'x-freebuff-instance-id'
/** Header the CLI sends on POST to pick which model's queue to join. */
export const FREEBUFF_MODEL_HEADER = 'x-freebuff-model'

export interface FreebuffSessionDeps {
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  sessionDeps?: SessionDeps
  getCountryAccess?: GetCountryAccessFn
}

type AuthResult =
  | { error: NextResponse }
  | { userId: string; userEmail: string | null; userBanned: boolean }

async function resolveUser(
  req: NextRequest,
  deps: FreebuffSessionDeps,
): Promise<AuthResult> {
  const apiKey = extractApiKeyFromHeader(req)
  if (!apiKey) {
    return {
      error: NextResponse.json(
        {
          error: 'unauthorized',
          message: 'Missing or invalid Authorization header',
        },
        { status: 401 },
      ),
    }
  }
  const userInfo = await deps.getUserInfoFromApiKey({
    apiKey,
    fields: ['id', 'email', 'banned'],
    logger: deps.logger,
  })
  if (!userInfo?.id) {
    return {
      error: NextResponse.json(
        { error: 'unauthorized', message: 'Invalid API key' },
        { status: 401 },
      ),
    }
  }
  return {
    userId: String(userInfo.id),
    userEmail: userInfo.email ?? null,
    userBanned: Boolean(userInfo.banned),
  }
}

function serverError(
  deps: FreebuffSessionDeps,
  route: string,
  userId: string | null,
  error: unknown,
): NextResponse {
  const err = error instanceof Error ? error : new Error(String(error))
  deps.logger.error(
    {
      route,
      userId,
      errorName: err.name,
      errorMessage: err.message,
      errorCode: (err as any).code,
      cause:
        (err as any).cause instanceof Error
          ? {
              name: (err as any).cause.name,
              message: (err as any).cause.message,
              code: (err as any).cause.code,
            }
          : (err as any).cause,
      stack: err.stack,
    },
    '[freebuff/session] handler failed',
  )
  return NextResponse.json(
    { error: 'internal_error', message: err.message },
    { status: 500 },
  )
}

/** POST /api/v1/freebuff/session — join queue / take over as this instance. */
export async function postFreebuffSession(
  req: NextRequest,
  deps: FreebuffSessionDeps,
): Promise<NextResponse> {
  const auth = await resolveUser(req, deps)
  if ('error' in auth) return auth.error

  const { response: blocked, countryAccess } = await countryBlockedResponse(
    req,
    deps,
  )
  if (blocked) return blocked

  const requestedModel = req.headers.get(FREEBUFF_MODEL_HEADER) ?? ''

  try {
    const state = await requestSession({
      userId: auth.userId,
      userEmail: auth.userEmail,
      userBanned: auth.userBanned,
      model: requestedModel,
      countryAccess: toSessionCountryAccess(countryAccess),
      deps: deps.sessionDeps,
    })
    // model_locked / model_unavailable are 409 so they're distinguishable
    // from normal queued/active responses on the client. banned is a 403
    // (terminal, mirrors country_blocked) so older CLIs that don't know the
    // status fall into their `!resp.ok` error path and back off instead of
    // tight-polling on the unrecognized 200 body. rate_limited uses 429 for
    // the same reason as banned — older CLIs back off, newer CLIs parse the
    // structured body.
    const status =
      state.status === 'model_locked' || state.status === 'model_unavailable'
        ? 409
        : state.status === 'banned'
          ? 403
          : state.status === 'rate_limited'
            ? 429
            : 200
    return NextResponse.json(state, { status })
  } catch (error) {
    return serverError(deps, 'POST', auth.userId, error)
  }
}

/** GET /api/v1/freebuff/session — read current state without mutation. The
 *  caller's instance id (via X-Freebuff-Instance-Id) is used to detect
 *  takeover by another CLI on the same account. */
export async function getFreebuffSession(
  req: NextRequest,
  deps: FreebuffSessionDeps,
): Promise<NextResponse> {
  const auth = await resolveUser(req, deps)
  if ('error' in auth) return auth.error

  try {
    if (!(await shouldSkipGetCountryCheck(auth.userId, deps))) {
      const { response: blocked } = await countryBlockedResponse(req, deps)
      if (blocked) return blocked
    }

    const claimedInstanceId =
      req.headers.get(FREEBUFF_INSTANCE_HEADER) ?? undefined
    const state = await getSessionState({
      userId: auth.userId,
      userEmail: auth.userEmail,
      userBanned: auth.userBanned,
      claimedInstanceId,
      deps: deps.sessionDeps,
    })
    if (state.status === 'none') {
      return NextResponse.json(
        {
          status: 'none',
          message: 'Call POST to join the waiting room.',
          queueDepthByModel: state.queueDepthByModel,
          rateLimitsByModel: state.rateLimitsByModel,
        },
        { status: 200 },
      )
    }
    // banned is terminal; 403 for the same reason as country_blocked — older
    // CLIs that don't know this status treat it as a generic error.
    const status = state.status === 'banned' ? 403 : 200
    return NextResponse.json(state, { status })
  } catch (error) {
    return serverError(deps, 'GET', auth.userId, error)
  }
}

/** DELETE /api/v1/freebuff/session — end session / leave queue immediately. */
export async function deleteFreebuffSession(
  req: NextRequest,
  deps: FreebuffSessionDeps,
): Promise<NextResponse> {
  const auth = await resolveUser(req, deps)
  if ('error' in auth) return auth.error

  try {
    await endUserSession({
      userId: auth.userId,
      userEmail: auth.userEmail,
      deps: deps.sessionDeps,
    })
    return NextResponse.json({ status: 'ended' }, { status: 200 })
  } catch (error) {
    return serverError(deps, 'DELETE', auth.userId, error)
  }
}
