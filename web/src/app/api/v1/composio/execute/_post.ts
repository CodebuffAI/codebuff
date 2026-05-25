import { getErrorObject } from '@codebuff/common/util/error'
import { COMPOSIO_META_TOOL_NAMES } from '@codebuff/common/constants/composio'
import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { CodebuffPgDatabase } from '@codebuff/internal/db/types'
import type { NextRequest } from 'next/server'

import { executeComposioTool, isComposioConfigured } from '@/server/composio'
import { checkComposioRateLimit } from '@/server/composio-rate-limiter'

import { requireComposioUser } from '../_auth'

type ExecuteComposioToolFn = typeof executeComposioTool
type CheckComposioRateLimitFn = typeof checkComposioRateLimit
type IsComposioConfiguredFn = typeof isComposioConfigured

const composioExecuteBodySchema = z.object({
  toolName: z.enum(COMPOSIO_META_TOOL_NAMES),
  input: z.record(z.string(), z.unknown()).default({}),
})

export async function postComposioExecute(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  db: CodebuffPgDatabase
  logger: Logger
  loggerWithContext: LoggerWithContextFn
  executeTool?: ExecuteComposioToolFn
  checkRateLimit?: CheckComposioRateLimitFn
  isConfigured?: IsComposioConfiguredFn
}) {
  const {
    db,
    executeTool = executeComposioTool,
    checkRateLimit = checkComposioRateLimit,
    isConfigured = isComposioConfigured,
  } = params
  const auth = await requireComposioUser(params)
  if (!auth.ok) return auth.response
  const { userInfo, logger } = auth
  const { req } = params

  if (!isConfigured()) {
    return NextResponse.json(
      { error: 'Composio is not configured' },
      { status: 503 },
    )
  }

  const rateLimit = checkRateLimit(userInfo.id)
  if (rateLimit.limited) {
    const retryAfterSeconds = Math.ceil(rateLimit.retryAfterMs / 1000)
    logger.warn(
      {
        userId: userInfo.id,
        retryAfterSeconds,
        windowName: rateLimit.windowName,
      },
      'Rate limited Composio execute request',
    )
    return NextResponse.json(
      { error: 'Rate limited', retryAfterSeconds },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds) },
      },
    )
  }

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 },
    )
  }

  const parsed = composioExecuteBodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.format() },
      { status: 400 },
    )
  }

  try {
    logger.info(
      { userId: userInfo.id, toolName: parsed.data.toolName },
      'Executing Composio tool',
    )
    const output = await executeTool({
      db,
      userId: userInfo.id,
      logger,
      ...parsed.data,
    })
    if (!output) {
      return NextResponse.json(
        { error: 'Composio is not configured' },
        { status: 503 },
      )
    }

    logger.info(
      {
        userId: userInfo.id,
        toolName: parsed.data.toolName,
        outputCount: output.length,
      },
      'Executed Composio tool',
    )
    return NextResponse.json({ output })
  } catch (error) {
    logger.error(
      { error: getErrorObject(error), userId: userInfo.id },
      'Failed to execute Composio tool',
    )
    return NextResponse.json(
      { error: 'Failed to execute Composio tool' },
      { status: 502 },
    )
  }
}
