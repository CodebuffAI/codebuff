import { trackEvent } from '@codebuff/common/analytics'

import { postFeedback } from './_post'

import type { NextRequest } from 'next/server'

import { getUserInfoFromApiKey } from '@/db/user'
import { logger, loggerWithContext } from '@/util/logger'

export async function POST(req: NextRequest) {
  return postFeedback({
    req,
    getUserInfoFromApiKey,
    logger,
    loggerWithContext,
    trackEvent,
  })
}
