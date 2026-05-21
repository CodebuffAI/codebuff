import { trackEvent } from '@codebuff/common/analytics'

import { postAdClick } from './_post'

import type { NextRequest } from 'next/server'

import { getUserInfoFromApiKey } from '@/db/user'
import { logger, loggerWithContext } from '@/util/logger'

export async function POST(req: NextRequest) {
  return postAdClick({
    req,
    getUserInfoFromApiKey,
    logger,
    loggerWithContext,
    trackEvent,
  })
}
