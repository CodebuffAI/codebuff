import { trackEvent } from '@codebuff/common/analytics'
import { processAndGrantCredit } from '@codebuff/billing/grant-credits'

import { postAdImpression } from './_post'

import type { NextRequest } from 'next/server'

import { getUserInfoFromApiKey } from '@/db/user'
import { logger, loggerWithContext } from '@/util/logger'

export async function POST(req: NextRequest) {
  return postAdImpression({
    req,
    getUserInfoFromApiKey,
    logger,
    loggerWithContext,
    trackEvent,
    processAndGrantCredit,
    fetch,
  })
}
