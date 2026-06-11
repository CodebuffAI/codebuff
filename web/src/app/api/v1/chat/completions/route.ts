import {
  insertChatCompletionTraceBigquery,
  insertMessageBigquery,
} from '@codebuff/bigquery'
import { evaluateReferralForReferredUser } from '@codebuff/billing/referral-program'
import { ensureSubscriberBlockGrant } from '@codebuff/billing/subscription'
import { getUserUsageData } from '@codebuff/billing/usage-service'
import { trackEvent } from '@codebuff/common/analytics'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'

import { postChatCompletions } from './_post'

import type { GetUserPreferencesFn, RecordFreebuffUsageDayFn } from './_post'
import type { NextRequest } from 'next/server'

import { getAgentRunFromId } from '@/db/agent-run'
import { recordFreebuffUsageDay } from '@/db/freebuff-streak'
import { getUserInfoFromApiKey } from '@/db/user'
import { logger, loggerWithContext } from '@/util/logger'

/**
 * Record the freebuff usage day, then kick off referral evaluation without
 * blocking the completion response. Evaluation runs only when a NEW usage day
 * was recorded (first message of the day — the moment a pending referral's
 * activation gate can flip), so the hot path pays nothing on subsequent
 * requests. Missed flips (e.g. GitHub API down at that moment) are caught by
 * the evaluatePendingReferrals sweep.
 */
const recordUsageAndEvaluateReferral: RecordFreebuffUsageDayFn = async (
  params,
) => {
  const newUsageDay = await recordFreebuffUsageDay(params)
  if (newUsageDay) {
    void evaluateReferralForReferredUser({
      userId: params.userId,
      logger,
    }).catch((error: unknown) => {
      logger.error(
        { error, userId: params.userId },
        'Post-usage referral evaluation failed',
      )
    })
  }
}

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
    insertChatCompletionTraceBigquery,
    ensureSubscriberBlockGrant,
    getUserPreferences,
    recordFreebuffUsageDay: recordUsageAndEvaluateReferral,
  })
}
