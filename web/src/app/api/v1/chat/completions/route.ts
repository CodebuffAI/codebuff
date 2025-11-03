import { insertMessageBigquery } from '@codebuff/bigquery'
import { getUserUsageData } from '@codebuff/billing/usage-service'
import { trackEvent } from '@codebuff/common/analytics'

import { postChatCompletions } from './_post'

import type { NextRequest } from 'next/server'

import { getAgentRunFromId } from '@/db/agent-run'
import { getUserInfoFromApiKey } from '@/db/user'
import { logger } from '@/util/logger'

export async function POST(req: NextRequest) {
  return postChatCompletions({
    req,
    getUserInfoFromApiKey,
    logger,
    trackEvent,
    getUserUsageData,
    getAgentRunFromId,
    fetch,
    insertMessageBigquery,
  })
}
