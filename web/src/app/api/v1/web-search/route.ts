import { getUserUsageData } from '@codebuff/billing/usage-service'
import { consumeCreditsWithFallback } from '@codebuff/billing/credit-delegation'
import { trackEvent } from '@codebuff/common/analytics'

import { postWebSearch } from './_post'

import type { NextRequest } from 'next/server'

import { getUserInfoFromApiKey } from '@/db/user'
import { logger, loggerWithContext } from '@/util/logger'

export async function POST(req: NextRequest) {
  return postWebSearch({
    req,
    getUserInfoFromApiKey,
    logger,
    loggerWithContext,
    trackEvent,
    getUserUsageData,
    consumeCreditsWithFallback,
    fetch,
  })
}
