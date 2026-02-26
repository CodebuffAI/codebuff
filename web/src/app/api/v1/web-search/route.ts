import { consumeCreditsWithFallback } from '@codebuff/billing/credit-delegation'
import { ensureSubscriberBlockGrant } from '@codebuff/billing/subscription'
import { getUserUsageData } from '@codebuff/billing/usage-service'
import { trackEvent } from '@codebuff/common/analytics'
import { env } from '@codebuff/internal/env'

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
    serverEnv: { LINKUP_API_KEY: env.LINKUP_API_KEY },
    ensureSubscriberBlockGrant,
  })
}
