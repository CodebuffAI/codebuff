import { trackEvent } from '@codebuff/common/analytics'
import db from '@codebuff/common/db'

import type { NextRequest } from 'next/server'

import { agentRunsStepsPost } from '@/api/v1/agent-runs/[runId]/steps'
import { getUserInfoFromApiKey } from '@/db/user'
import { logger } from '@/util/logger'

export async function POST(
  req: NextRequest,
  { params }: { params: { runId: string } }
) {
  const { runId } = params
  return agentRunsStepsPost({
    req,
    runId,
    getUserInfoFromApiKey,
    logger,
    trackEvent,
    db,
  })
}
