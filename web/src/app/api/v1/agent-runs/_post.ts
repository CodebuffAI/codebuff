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

const agentRunsStartSchema = z.object({
  action: z.literal('START'),
  agentId: z.string(),
  ancestorRunIds: z.array(z.string()).optional(),
})

const agentRunsFinishSchema = z.object({
  action: z.literal('FINISH'),
  runId: z.string(),
  status: z.enum(['completed', 'failed', 'cancelled']),
  totalSteps: z.number().int().nonnegative(),
  directCredits: z.number().nonnegative(),
  totalCredits: z.number().nonnegative(),
  errorMessage: z.string().optional(),
})

const agentRunsPostBodySchema = z.discriminatedUnion('action', [
  agentRunsStartSchema,
  agentRunsFinishSchema,
])

async function handleStartAction(params: {
  data: z.infer<typeof agentRunsStartSchema>
  userId: string
  logger: Logger
  trackEvent: TrackEventFn
  db: CodebuffPgDatabase
}) {
  const { data, userId, logger, trackEvent, db } = params
  const { agentId, ancestorRunIds } = data
  const validatedAncestorRunIds = ancestorRunIds || []

  // Generate runId (never accept from input)
  const runId = crypto.randomUUID()

  try {
    await db.insert(schema.agentRun).values({
      id: runId,
      user_id: userId,
      agent_id: agentId,
      ancestor_run_ids: validatedAncestorRunIds,
      status: 'running',
      created_at: new Date(),
    })

    trackEvent({
      event: AnalyticsEvent.AGENT_RUN_CREATED,
      userId,
      properties: {
        agentId,
        ancestorRunIds: validatedAncestorRunIds,
      },
      logger,
    })

    return NextResponse.json({ runId })
  } catch (error) {
    logger.error(
      {
        error,
        runId,
        userId,
        agentId,
        ancestorRunIds: validatedAncestorRunIds,
      },
      'Failed to start agent run',
    )
    trackEvent({
      event: AnalyticsEvent.AGENT_RUN_CREATION_ERROR,
      userId,
      properties: {
        agentId,
        errorMessage: getErrorObject(error),
      },
      logger,
    })
    return NextResponse.json(
      { error: 'Failed to create agent run' },
      { status: 500 },
    )
  }
}

async function handleFinishAction(params: {
  data: z.infer<typeof agentRunsFinishSchema>
  userId: string
  logger: Logger
  trackEvent: TrackEventFn
  db: CodebuffPgDatabase
}) {
  const { data, userId, logger, trackEvent, db } = params
  const {
    runId,
    status,
    totalSteps,
    directCredits,
    totalCredits,
    errorMessage,
  } = data

  // Skip database update for test user
  if (userId === TEST_USER_ID) {
    return NextResponse.json({ success: true })
  }

  try {
    await db
      .update(schema.agentRun)
      .set({
        status,
        completed_at: new Date(),
        total_steps: totalSteps,
        direct_credits: directCredits.toString(),
        total_credits: totalCredits.toString(),
        error_message: errorMessage,
      })
      .where(eq(schema.agentRun.id, runId))

    trackEvent({
      event: AnalyticsEvent.AGENT_RUN_COMPLETED,
      userId,
      properties: {
        runId,
        status,
        totalSteps,
        directCredits,
        totalCredits,
        hasError: !!errorMessage,
      },
      logger,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error({ error, runId, status }, 'Failed to finish agent run')
    trackEvent({
      event: AnalyticsEvent.AGENT_RUN_COMPLETION_ERROR,
      userId,
      properties: {
        runId,
        errorMessage: getErrorObject(error),
      },
      logger,
    })
    return NextResponse.json(
      { error: 'Failed to finish agent run' },
      { status: 500 },
    )
  }
}

export async function postAgentRuns(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  trackEvent: TrackEventFn
  db: CodebuffPgDatabase
}) {
  const { req, getUserInfoFromApiKey, logger, trackEvent, db } = params

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

  // Track API request
  trackEvent({
    event: AnalyticsEvent.AGENT_RUN_API_REQUEST,
    userId: userInfo.id,
    logger,
  })

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

  const parseResult = agentRunsPostBodySchema.safeParse(body)
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

  // Route to appropriate handler
  if (data.action === 'START') {
    return handleStartAction({
      data,
      userId: userInfo.id,
      logger,
      trackEvent,
      db,
    })
  }

  if (data.action === 'FINISH') {
    return handleFinishAction({
      data,
      userId: userInfo.id,
      logger,
      trackEvent,
      db,
    })
  }

  // Unreachable due to discriminated union
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
