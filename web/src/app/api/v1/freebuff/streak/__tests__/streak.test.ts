import { describe, expect, mock, test } from 'bun:test'

import { getFreebuffStreak } from '../_get'

import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger

function makeReq(apiKey: string | null): NextRequest {
  const headers = new Headers()
  if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`)
  return { headers } as unknown as NextRequest
}

describe('GET /api/v1/freebuff/streak', () => {
  test('requires an API key', async () => {
    const response = await getFreebuffStreak({
      req: makeReq(null),
      getUserInfoFromApiKey: mock() as unknown as GetUserInfoFromApiKeyFn,
      listFreebuffUsageDatesForUser: mock(async () => []),
      logger,
    })

    expect(response.status).toBe(401)
  })

  test('returns the authenticated user streak', async () => {
    const getUserInfoFromApiKey = mock(async () => ({
      id: 'user-1',
    })) as unknown as GetUserInfoFromApiKeyFn
    const listFreebuffUsageDatesForUser = mock(async () => [
      '2026-05-26',
      '2026-05-25',
      '2026-05-24',
    ])

    const response = await getFreebuffStreak({
      req: makeReq('key-1'),
      getUserInfoFromApiKey,
      listFreebuffUsageDatesForUser,
      logger,
      now: new Date('2026-05-27T12:00:00.000Z'),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      streak: 3,
      todayUsed: false,
      lastUsageDate: '2026-05-26',
      timeZone: 'America/Los_Angeles',
    })
    expect(listFreebuffUsageDatesForUser).toHaveBeenCalledWith({
      userId: 'user-1',
    })
  })
})
