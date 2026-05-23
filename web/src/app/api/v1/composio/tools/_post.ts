import { getErrorObject } from '@codebuff/common/util/error'
import { NextResponse } from 'next/server'

import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { CodebuffPgDatabase } from '@codebuff/internal/db/types'
import type { NextRequest } from 'next/server'

import { getComposioToolsForUser } from '@/server/composio'
import { checkComposioRateLimit } from '@/server/composio-rate-limiter'

import { requireComposioUser } from '../_auth'

type GetComposioToolsForUserFn = typeof getComposioToolsForUser
type CheckComposioRateLimitFn = typeof checkComposioRateLimit

export async function postComposioTools(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  db: CodebuffPgDatabase
  logger: Logger
  loggerWithContext: LoggerWithContextFn
  getToolsForUser?: GetComposioToolsForUserFn
  checkRateLimit?: CheckComposioRateLimitFn
}) {
  const {
    db,
    getToolsForUser = getComposioToolsForUser,
    checkRateLimit = checkComposioRateLimit,
  } = params
  const auth = await requireComposioUser(params)
  if (!auth.ok) return auth.response
  const { userInfo, logger } = auth

  const rateLimit = checkRateLimit(userInfo.id, 'tools')
  if (rateLimit.limited) {
    const retryAfterSeconds = Math.ceil(rateLimit.retryAfterMs / 1000)
    logger.warn(
      {
        userId: userInfo.id,
        retryAfterSeconds,
        windowName: rateLimit.windowName,
      },
      'Rate limited Composio tools request',
    )
    return NextResponse.json(
      { error: 'Rate limited', retryAfterSeconds },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds) },
      },
    )
  }

  try {
    const tools = await getToolsForUser({
      db,
      userId: userInfo.id,
      logger,
    })
    if (!tools) {
      return NextResponse.json(
        { error: 'Composio is not configured' },
        { status: 503 },
      )
    }

    logger.info(
      { userId: userInfo.id, toolCount: tools.tools.length },
      'Loaded Composio tools',
    )
    return NextResponse.json(tools)
  } catch (error) {
    logger.error(
      { error: getErrorObject(error), userId: userInfo.id },
      'Failed to load Composio tools',
    )
    return NextResponse.json(
      { error: 'Failed to load Composio tools' },
      { status: 502 },
    )
  }
}
