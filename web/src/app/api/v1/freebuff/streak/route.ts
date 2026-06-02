import { getFreebuffStreak } from './_get'

import { listFreebuffUsageDatesForUser } from '@/db/freebuff-streak'
import { getUserInfoFromApiKey } from '@/db/user'
import { logger } from '@/util/logger'

import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  return getFreebuffStreak({
    req,
    getUserInfoFromApiKey,
    listFreebuffUsageDatesForUser,
    logger,
  })
}
