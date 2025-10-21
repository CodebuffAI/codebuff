import { trackEvent } from '@codebuff/common/analytics'

import type { NextRequest } from 'next/server'

import { meGet } from '@/api/v1/me'
import { getUserInfoFromApiKey } from '@/db/user'
import { logger } from '@/util/logger'

export async function GET(req: NextRequest) {
  return meGet({ req, getUserInfoFromApiKey, logger, trackEvent })
}
