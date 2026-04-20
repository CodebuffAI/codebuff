import { NextResponse } from 'next/server'

import {
  endUserSession,
  getSessionState,
  requestSession,
} from '@/server/free-session/public-api'
import {
  FREE_MODE_ALLOWED_COUNTRIES,
  getCountryCode,
} from '@/server/free-mode-country'
import { extractApiKeyFromHeader } from '@/util/auth'

import type { SessionDeps } from '@/server/free-session/public-api'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

/** Early country gate. Mirrors the chat/completions check: if we can resolve
 *  the caller's country and it's not on the allowlist, short-circuit with a
 *  terminal `country_blocked` response so the CLI can show the warning
 *  screen without ever joining the queue. Null country (VPN / localhost)
 *  fails open — chat/completions will catch it later if it matters.
 *
 *  Returns HTTP 403 (not 200) so older CLIs — which don't know the
 *  `country_blocked` status and would tight-poll on an unrecognized 200
 *  body — fall into their existing `!resp.ok` error path and back off on
 *  the 10s error retry cadence. The new CLI parses the 403 body directly. */
function countryBlockedResponse(req: NextRequest): NextResponse | null {
  const countryCode = getCountryCode(req)
  if (!countryCode) return null
  if (FREE_MODE_ALLOWED_COUNTRIES.has(countryCode)) return null
  return NextResponse.json(
    { status: 'country_blocked', countryCode },
    { status: 403 },
  )
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
}

type AuthResult =
  | { error: NextResponse }
  | { userId: string; userEmail: string | null }

async function resolveUser(req: NextRequest, deps: FreebuffSessionDeps): Promise<AuthResult> {
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
    fields: ['id', 'email'],
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
  return { userId: String(userInfo.id), userEmail: userInfo.email ?? null }
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

  const blocked = countryBlockedResponse(req)
  if (blocked) return blocked

  const requestedModel = req.headers.get(FREEBUFF_MODEL_HEADER) ?? ''

  try {
    const state = await requestSession({
      userId: auth.userId,
      userEmail: auth.userEmail,
      model: requestedModel,
      deps: deps.sessionDeps,
    })
    // model_locked is a 409 so it's distinguishable from a normal queued/active
    // response on the client. The CLI translates it into a "switch model?"
    // confirmation prompt.
    const status = state.status === 'model_locked' ? 409 : 200
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

  const blocked = countryBlockedResponse(req)
  if (blocked) return blocked

  try {
    const claimedInstanceId = req.headers.get(FREEBUFF_INSTANCE_HEADER) ?? undefined
    const state = await getSessionState({
      userId: auth.userId,
      userEmail: auth.userEmail,
      claimedInstanceId,
      deps: deps.sessionDeps,
    })
    if (state.status === 'none') {
      return NextResponse.json(
        { status: 'none', message: 'Call POST to join the waiting room.' },
        { status: 200 },
      )
    }
    return NextResponse.json(state, { status: 200 })
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
