import { trackEvent } from '@codebuff/common/analytics'
import db from '@codebuff/internal/db'

import { postAgentRunsSteps } from './_post'

import type { NextRequest } from 'next/server'

import { getUserInfoFromApiKey } from '@/db/user'
import { logger } from '@/util/logger'

export async function POST(
  req: NextRequest,
  { params }: { params: { runId: string } },
) {
  const { runId } = params
  return postAgentRunsSteps({
    req,
    runId,
    getUserInfoFromApiKey,
    logger,
    trackEvent,
    db,
  })
}
