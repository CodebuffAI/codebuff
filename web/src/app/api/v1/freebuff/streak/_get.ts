import {
  calculateFreebuffStreak,
  FREEBUFF_STREAK_TIME_ZONE,
  getFreebuffUsageDateKey,
} from '@codebuff/common/util/freebuff-streak'
import { NextResponse } from 'next/server'

import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { FreebuffStreakResponse } from '@codebuff/common/types/freebuff-streak'
import type { NextRequest } from 'next/server'

import { extractApiKeyFromHeader } from '@/util/auth'

export type ListFreebuffUsageDatesForUserFn = (params: {
  userId: string
}) => Promise<string[]>

export async function getFreebuffStreak(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  listFreebuffUsageDatesForUser: ListFreebuffUsageDatesForUserFn
  logger: Logger
  now?: Date
}) {
  const {
    req,
    getUserInfoFromApiKey,
    listFreebuffUsageDatesForUser,
    logger,
    now = new Date(),
  } = params

  const apiKey = extractApiKeyFromHeader(req)
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing or invalid Authorization header' },
      { status: 401 },
    )
  }

  const userInfo = await getUserInfoFromApiKey({
    apiKey,
    fields: ['id'],
    logger,
  })

  if (!userInfo) {
    return NextResponse.json(
      { error: 'Invalid API key or user not found' },
      { status: 401 },
    )
  }

  const usageDates = await listFreebuffUsageDatesForUser({
    userId: userInfo.id,
  })
  const streak = calculateFreebuffStreak({
    usageDates,
    todayDateKey: getFreebuffUsageDateKey(now),
  })

  const response: FreebuffStreakResponse = {
    ...streak,
    timeZone: FREEBUFF_STREAK_TIME_ZONE,
  }

  return NextResponse.json(response)
}
