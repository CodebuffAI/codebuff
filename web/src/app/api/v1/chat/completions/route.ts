import { insertMessageBigquery } from '@codebuff/bigquery'
import { ensureSubscriberBlockGrant } from '@codebuff/billing/subscription'
import { getUserUsageData } from '@codebuff/billing/usage-service'
import { trackEvent } from '@codebuff/common/analytics'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'

import { postChatCompletions } from './_post'

import type { GetUserPreferencesFn } from './_post'
import type { NextRequest } from 'next/server'

import { getAgentRunFromId } from '@/db/agent-run'
import { getUserInfoFromApiKey } from '@/db/user'
import { logger, loggerWithContext } from '@/util/logger'

const getUserPreferences: GetUserPreferencesFn = async ({ userId }) => {
  const userPrefs = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { fallback_to_a_la_carte: true },
  })
  return {
    fallbackToALaCarte: userPrefs?.fallback_to_a_la_carte ?? false,
  }
}

export async function POST(req: NextRequest) {
  return postChatCompletions({
    req,
    getUserInfoFromApiKey,
    logger,
    loggerWithContext,
    trackEvent,
    getUserUsageData,
    getAgentRunFromId,
    fetch,
    insertMessageBigquery,
    ensureSubscriberBlockGrant,
    getUserPreferences,
  })
}
