import { trackEvent } from '@codebuff/common/analytics'
import { env } from '@codebuff/internal/env'

import { postAds } from './_post'

import type { NextRequest } from 'next/server'

import { getUserInfoFromApiKey } from '@/db/user'
import { logger, loggerWithContext } from '@/util/logger'

export async function POST(req: NextRequest) {
  return postAds({
    req,
    getUserInfoFromApiKey,
    logger,
    loggerWithContext,
    trackEvent,
    fetch,
    serverEnv: { GRAVITY_API_KEY: env.GRAVITY_API_KEY, CB_ENVIRONMENT: env.NEXT_PUBLIC_CB_ENVIRONMENT },
  })
}
