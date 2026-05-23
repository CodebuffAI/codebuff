import { NextResponse } from 'next/server'

import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

import { extractApiKeyFromHeader } from '@/util/auth'

type ComposioUser = {
  id: string
  email: string
  discord_id: string | null
}

export async function requireComposioUser(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  loggerWithContext: LoggerWithContextFn
}): Promise<
  | { ok: true; userInfo: ComposioUser; logger: Logger }
  | { ok: false; response: NextResponse }
> {
  const { req, getUserInfoFromApiKey, logger, loggerWithContext } = params

  const apiKey = extractApiKeyFromHeader(req)
  if (!apiKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401 },
      ),
    }
  }

  const userInfo = await getUserInfoFromApiKey({
    apiKey,
    fields: ['id', 'email', 'discord_id'],
    logger,
  })
  if (!userInfo) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid API key or user not found' },
        { status: 401 },
      ),
    }
  }

  return {
    ok: true,
    userInfo,
    logger: loggerWithContext({ userInfo }),
  }
}
