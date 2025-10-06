import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

import { buildTimelineFromMessages } from '@/app/admin/traces/utils/trace-processing'
import { checkAdminAuth } from '@/lib/admin-auth'
import { logger } from '@/util/logger'

interface RouteParams {
  params: {
    clientRequestId: string
  }
}

export interface TimelineEvent {
  id: string
  type: 'agent_step' | 'tool_call' | 'spawned_agent'
  name: string
  startTime: Date
  endTime: Date
  duration: number
  parentId?: string
  metadata: {
    model?: string
    toolName?: string
    agentType?: string
    result?: any
    isSpawnedAgent?: boolean
    fromSpawnedAgent?: string
  }
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  // Check admin authentication
  const authResult = await checkAdminAuth()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { clientRequestId } = params

  if (!clientRequestId) {
    return NextResponse.json(
      { error: 'Missing required parameter: clientRequestId' },
      { status: 400 }
    )
  }

  try {
    // First, get the main request message to find the client_id
    const mainMessage = await db
      .select()
      .from(schema.message)
      .where(eq(schema.message.client_request_id, clientRequestId))
      .limit(1)

    if (mainMessage.length === 0) {
      return NextResponse.json(
        { error: 'No messages found for this client request ID' },
        { status: 404 }
      )
    }

    const clientId = mainMessage[0].client_id

    // Query all messages with the same client_id to include spawned agents
    const allMessages = await db
      .select()
      .from(schema.message)
      .where(eq(schema.message.client_id, clientId ?? 'NULL'))
      .orderBy(schema.message.finished_at)

    // Build timeline events from messages using utility function
    const timelineEvents = buildTimelineFromMessages(
      allMessages,
      clientRequestId
    )

    logger.info(
      {
        adminId: authResult.id,
        clientRequestId,
        eventCount: timelineEvents.length,
      },
      'Admin fetched timeline events'
    )

    return NextResponse.json({ events: timelineEvents })
  } catch (error) {
    logger.error({ error, clientRequestId }, 'Error building timeline')
    return NextResponse.json(
      { error: 'Failed to build timeline' },
      { status: 500 }
    )
  }
}
