import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

import { extractApiKeyFromHeader } from '@/util/auth'

const agentRunsStartSchema = z.object({
  action: z.literal('START'),
  agentId: z.string(),
  ancestorRunIds: z.array(z.string()).optional(),
})

const agentRunsPostBodySchema = z.discriminatedUnion('action', [
  agentRunsStartSchema,
  // agentRunsFinishSchema,
])

export async function agentRunsPost(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
}) {
  const { req, getUserInfoFromApiKey, logger } = params

  const apiKey = extractApiKeyFromHeader(req)

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing or invalid Authorization header' },
      { status: 401 }
    )
  }

  // Get user info
  const userInfo = await getUserInfoFromApiKey({ apiKey, fields: ['id'] })

  if (!userInfo) {
    return NextResponse.json(
      { error: 'Invalid API key or user not found' },
      { status: 404 }
    )
  }

  // Parse and validate request body
  let body: unknown
  try {
    body = await req.json()
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    )
  }

  const parseResult = agentRunsPostBodySchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parseResult.error.format() },
      { status: 400 }
    )
  }

  const { agentId, ancestorRunIds } = parseResult.data
  const validatedAncestorRunIds = ancestorRunIds || []

  // Generate runId (never accept from input)
  const runId = crypto.randomUUID()

  // Skip database insertion for test user
  if (userInfo.id === TEST_USER_ID) {
    return NextResponse.json({ runId: 'test-run-id' })
  }

  try {
    await db.insert(schema.agentRun).values({
      id: runId,
      user_id: userInfo.id,
      agent_id: agentId,
      ancestor_run_ids:
        validatedAncestorRunIds.length > 0 ? validatedAncestorRunIds : null,
      status: 'running',
      created_at: new Date(),
    })

    return NextResponse.json({ runId })
  } catch (error) {
    logger.error(
      {
        error,
        runId,
        userId: userInfo.id,
        agentId,
        ancestorRunIds: validatedAncestorRunIds,
      },
      'Failed to start agent run'
    )
    return NextResponse.json(
      { error: 'Failed to create agent run' },
      { status: 500 }
    )
  }
}
