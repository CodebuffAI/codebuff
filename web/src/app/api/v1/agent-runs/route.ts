import { trackEvent } from '@codebuff/common/analytics'
import db from '@codebuff/internal/db'

import { postAgentRuns } from './_post'

import type { NextRequest } from 'next/server'

import { getUserInfoFromApiKey } from '@/db/user'
import { logger } from '@/util/logger'

export async function POST(req: NextRequest) {
  return postAgentRuns({ req, getUserInfoFromApiKey, logger, trackEvent, db })
}
