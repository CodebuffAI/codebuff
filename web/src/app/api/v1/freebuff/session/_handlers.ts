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

/** POST /api/v1/freebuff/session — join queue / take over as this instance. */
export async function postFreebuffSession(
  req: NextRequest,
  deps: FreebuffSessionDeps,
): Promise<NextResponse> {
  const auth = await resolveUser(req, deps)
  if ('error' in auth) return auth.error

  const state = await requestSession({
    userId: auth.userId,
    deps: deps.sessionDeps,
  })
  return NextResponse.json(state, { status: 200 })
}

/** GET /api/v1/freebuff/session — read current state without mutation. */
export async function getFreebuffSession(
  req: NextRequest,
  deps: FreebuffSessionDeps,
): Promise<NextResponse> {
  const auth = await resolveUser(req, deps)
  if ('error' in auth) return auth.error

  const state = await getSessionState({
    userId: auth.userId,
    deps: deps.sessionDeps,
  })
  if (!state) {
    return NextResponse.json(
      { status: 'none', message: 'Call POST to join the waiting room.' },
      { status: 200 },
    )
  }
  return NextResponse.json(state, { status: 200 })
}

/** DELETE /api/v1/freebuff/session — end session / leave queue immediately. */
export async function deleteFreebuffSession(
  req: NextRequest,
  deps: FreebuffSessionDeps,
): Promise<NextResponse> {
  const auth = await resolveUser(req, deps)
  if ('error' in auth) return auth.error

  await endUserSession({ userId: auth.userId, deps: deps.sessionDeps })
  return NextResponse.json({ status: 'ended' }, { status: 200 })
}
