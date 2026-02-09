import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { feedbackRequestSchema } from '@codebuff/common/schemas/feedback'
import { NextResponse } from 'next/server'

import { parseJsonBody, requireUserFromApiKey } from '../_helpers'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

export async function postFeedback(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  loggerWithContext: LoggerWithContextFn
  trackEvent: TrackEventFn
}) {
  const {
    req,
    getUserInfoFromApiKey,
    logger: baseLogger,
    loggerWithContext,
    trackEvent,
  } = params

  // TODO: Persist feedback to a database table for durability and queryability
  // TODO: Add rate limiting (e.g., 10 requests/minute per userId)

  try {
    const userResult = await requireUserFromApiKey({
      req,
      getUserInfoFromApiKey,
      logger: baseLogger,
      loggerWithContext,
      trackEvent,
      authErrorEvent: AnalyticsEvent.FEEDBACK_AUTH_ERROR,
    })

    if (!userResult.ok) {
      return userResult.response
    }

    const { userId, logger } = userResult.data

    const bodyResult = await parseJsonBody({
      req,
      schema: feedbackRequestSchema,
      logger,
      trackEvent,
      validationErrorEvent: AnalyticsEvent.FEEDBACK_VALIDATION_ERROR,
      userId,
    })

    if (!bodyResult.ok) {
      return bodyResult.response
    }

    const feedback = bodyResult.data

    try {
      const {
        clientFeedbackId, source, messageId, messageVariant,
        completionTime, credits, agentMode, sessionCreditsUsed,
        recentMessages, text, category, type, errors,
      } = feedback

      trackEvent({
        event: AnalyticsEvent.FEEDBACK_SUBMITTED,
        userId,
        properties: {
          clientFeedbackId: clientFeedbackId ?? null,
          source: source ?? 'cli',
          messageId: messageId ?? null,
          variant: messageVariant ?? null,
          completionTime: completionTime ?? null,
          credits: credits ?? null,
          agentMode: agentMode ?? null,
          sessionCreditsUsed: sessionCreditsUsed ?? null,
          recentMessages: recentMessages ?? null,
          feedback: { text, category, type, errors: errors ?? null },
        },
        logger,
      })
    } catch (error) {
      logger.warn({ error }, 'Failed to track feedback analytics event')
    }

    logger.info(
      { userId, category: feedback.category, type: feedback.type },
      'Feedback submitted',
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    baseLogger.error({ error }, 'Error handling /api/v1/feedback request')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
