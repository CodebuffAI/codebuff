import { NextResponse } from 'next/server'

import {
  endUserSession,
  getSessionState,
  requestSession,
} from '@/server/free-session/public-api'
import { extractApiKeyFromHeader } from '@/util/auth'

import type { SessionDeps } from '@/server/free-session/public-api'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

/** Header the CLI uses to identify which instance is polling. Used by GET to
 *  detect when another CLI on the same account has rotated the id. */
export const FREEBUFF_INSTANCE_HEADER = 'x-freebuff-instance-id'

export interface FreebuffSessionDeps {
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  sessionDeps?: SessionDeps
}

type AuthResult = { error: NextResponse } | { userId: string }

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
    fields: ['id'],
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
  return { userId: String(userInfo.id) }
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

  try {
    const state = await requestSession({
      userId: auth.userId,
      deps: deps.sessionDeps,
    })
    return NextResponse.json(state, { status: 200 })
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
    const claimedInstanceId = req.headers.get(FREEBUFF_INSTANCE_HEADER) ?? undefined
    const state = await getSessionState({
      userId: auth.userId,
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
    await endUserSession({ userId: auth.userId, deps: deps.sessionDeps })
    return NextResponse.json({ status: 'ended' }, { status: 200 })
  } catch (error) {
    return serverError(deps, 'DELETE', auth.userId, error)
  }
}
