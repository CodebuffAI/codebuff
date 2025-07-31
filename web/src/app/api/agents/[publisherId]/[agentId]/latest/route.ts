import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

import { logger } from '@/util/logger'

interface RouteParams {
  params: {
    publisherId: string
    agentId: string
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { publisherId, agentId } = params

    if (!publisherId || !agentId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // Find the publisher
    const publisher = await db
      .select()
      .from(schema.publisher)
      .where(eq(schema.publisher.id, publisherId))
      .then((rows) => rows[0])

    if (!publisher) {
      return NextResponse.json(
        { error: 'Publisher not found' },
        { status: 404 }
      )
    }

    // Find the latest version of the agent template
    const agent = await db
      .select()
      .from(schema.agentConfig)
      .where(
        and(
          eq(schema.agentConfig.id, agentId),
          eq(schema.agentConfig.publisher_id, publisher.id)
        )
      )
      .orderBy(
        desc(schema.agentConfig.major),
        desc(schema.agentConfig.minor),
        desc(schema.agentConfig.patch)
      )
      .limit(1)
      .then((rows) => rows[0])

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: agent.id,
      version: agent.version,
      publisherId,
      data: agent.data,
      createdAt: agent.created_at,
      updatedAt: agent.updated_at,
    })
  } catch (error) {
    logger.error({ error }, 'Error handling latest agent retrieval request')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
