import { NextRequest, NextResponse } from 'next/server'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { logger } from '@/util/logger'

interface RouteParams {
  params: {
    publisherId: string
    agentId: string
  }
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
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
      .from(schema.agentTemplate)
      .where(
        and(
          eq(schema.agentTemplate.id, agentId),
          eq(schema.agentTemplate.publisher_id, publisher.id)
        )
      )
      .orderBy(
        desc(schema.agentTemplate.major),
        desc(schema.agentTemplate.minor),
        desc(schema.agentTemplate.patch)
      )
      .limit(1)
      .then((rows) => rows[0])

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: agent.id,
      version: agent.version,
      publisherId,
      template: agent.template,
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