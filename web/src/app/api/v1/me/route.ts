import { trackEvent } from '@codebuff/common/analytics'

import { getMe } from './_get'

import type { NextRequest } from 'next/server'

import { getUserInfoFromApiKey } from '@/db/user'
import { logger } from '@/util/logger'

export async function GET(req: NextRequest) {
  return getMe({ req, getUserInfoFromApiKey, logger, trackEvent })
}
