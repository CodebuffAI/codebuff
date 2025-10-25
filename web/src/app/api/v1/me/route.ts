import { trackEvent } from '@codebuff/common/analytics'

import { meGet } from './impl/_get'

import type { NextRequest } from 'next/server'

import { getUserInfoFromApiKey } from '@/db/user'
import { logger } from '@/util/logger'

export async function GET(req: NextRequest) {
  return meGet({ req, getUserInfoFromApiKey, logger, trackEvent })
}
