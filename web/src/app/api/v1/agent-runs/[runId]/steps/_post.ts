import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { getErrorObject } from '@codebuff/common/util/error'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { CodebuffPgDatabase } from '@codebuff/internal/db/types'
import type { NextRequest } from 'next/server'

import { extractApiKeyFromHeader } from '@/util/auth'

const addAgentStepSchema = z.object({
  stepNumber: z.number().int().nonnegative(),
  credits: z.number().nonnegative().optional(),
  childRunIds: z.array(z.string()).optional(),
  messageId: z.string().nullable().optional(),
  status: z.enum(['running', 'completed', 'skipped']).optional(),
  errorMessage: z.string().optional(),
  startTime: z.string().datetime().optional(),
})

export async function postAgentRunsSteps(params: {
  req: NextRequest
  runId: string
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  trackEvent: TrackEventFn
  db: CodebuffPgDatabase
}) {
  const { req, runId, getUserInfoFromApiKey, logger, trackEvent, db } = params

  const apiKey = extractApiKeyFromHeader(req)

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing or invalid Authorization header' },
      { status: 401 },
    )
  }

  // Get user info
  const userInfo = await getUserInfoFromApiKey({
    apiKey,
    fields: ['id'],
    logger,
  })

  if (!userInfo) {
    return NextResponse.json(
      { error: 'Invalid API key or user not found' },
      { status: 404 },
    )
  }

  // Parse and validate request body
  let body: unknown
  try {
    body = await req.json()
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 },
    )
  }

  const parseResult = addAgentStepSchema.safeParse(body)
  if (!parseResult.success) {
    trackEvent({
      event: AnalyticsEvent.AGENT_RUN_VALIDATION_ERROR,
      userId: userInfo.id,
      properties: {
        errors: parseResult.error.format(),
      },
      logger,
    })
    return NextResponse.json(
      { error: 'Invalid request body', details: parseResult.error.format() },
      { status: 400 },
    )
  }

  const data = parseResult.data
  const {
    stepNumber,
    credits,
    childRunIds,
    messageId,
    status = 'completed',
    errorMessage,
    startTime,
  } = data

  // Skip database insert for test user
  if (userInfo.id === TEST_USER_ID) {
    return NextResponse.json({ stepId: 'test-step-id' })
  }

  // Verify the run belongs to the authenticated user
  const agentRun = await db
    .select({ user_id: schema.agentRun.user_id })
    .from(schema.agentRun)
    .where(eq(schema.agentRun.id, runId))
    .limit(1)

  if (agentRun.length === 0) {
    return NextResponse.json({ error: 'Agent run not found' }, { status: 404 })
  }

  if (agentRun[0].user_id !== userInfo.id) {
    return NextResponse.json(
      { error: 'Unauthorized to add steps to this run' },
      { status: 403 },
    )
  }

  const stepId = crypto.randomUUID()

  try {
    await db.insert(schema.agentStep).values({
      id: stepId,
      agent_run_id: runId,
      step_number: stepNumber,
      status,
      credits: credits?.toString(),
      child_run_ids: childRunIds,
      message_id: messageId,
      error_message: errorMessage,
      created_at: startTime ? new Date(startTime) : new Date(),
      completed_at: new Date(),
    })

    trackEvent({
      event: AnalyticsEvent.AGENT_RUN_API_REQUEST,
      userId: userInfo.id,
      properties: {
        runId,
        stepNumber,
      },
      logger,
    })

    return NextResponse.json({ stepId })
  } catch (error) {
    logger.error({ error, runId, stepNumber }, 'Failed to add agent step')
    trackEvent({
      event: AnalyticsEvent.AGENT_RUN_API_REQUEST,
      userId: userInfo.id,
      properties: {
        runId,
        stepNumber,
        error: getErrorObject(error),
      },
      logger,
    })
    return NextResponse.json(
      { error: 'Failed to add agent step' },
      { status: 500 },
    )
  }
}
