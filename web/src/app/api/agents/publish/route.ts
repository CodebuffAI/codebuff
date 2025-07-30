import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq, desc } from 'drizzle-orm'
import { DynamicAgentTemplateSchema } from '@codebuff/common/types/dynamic-agent-template'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth/[...nextauth]/auth-options'
import { dynamicAgentService } from '@codebuff/common/templates/dynamic-agent-service'
import { logger } from '@/util/logger'
import { determineNextVersion, versionExists } from '@codebuff/internal'

// Schema for publishing an agent
const publishAgentRequestSchema = z.object({
  template: DynamicAgentTemplateSchema,
})

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Parse request body
    const body = await request.json()
    const parseResult = publishAgentRequestSchema.safeParse(body)
    if (!parseResult.success) {
      const errorMessages = parseResult.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
        return `${path}${issue.message}`
      })

      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: errorMessages.join('; '),
          validationErrors: parseResult.error.issues,
        },
        { status: 400 }
      )
    }

    const { template } = parseResult.data
    const agentId = template.id

    // Use dynamic agent service to validate the template
    const validationResult = await dynamicAgentService.loadAgents({
      [agentId]: template,
    })

    if (validationResult.validationErrors.length > 0) {
      const errorDetails = validationResult.validationErrors
        .map((err) => `${err.message}${err.details ? ` (${err.details})` : ''}`)
        .join('\n')

      return NextResponse.json(
        {
          error: 'Agent template validation failed',
          details: errorDetails,
          validationErrors: validationResult.validationErrors,
        },
        { status: 400 }
      )
    }

    // Look up the user's latest publisher (by updated_at)
    const publisher = await db
      .select()
      .from(schema.publisher)
      .where(eq(schema.publisher.user_id, userId))
      .orderBy(desc(schema.publisher.updated_at))
      .limit(1)
      .then((rows) => rows[0])

    if (!publisher) {
      return NextResponse.json(
        {
          error: 'No publisher associated with user',
          details: 'User must have a publisher to publish agents',
        },
        { status: 403 }
      )
    }

    // Determine the version to use (auto-increment if not provided)
    let version: string
    try {
      version = await determineNextVersion(
        agentId,
        publisher.id,
        template.version
      )
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Version determination failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 400 }
      )
    }

    // Check if this version already exists
    const versionAlreadyExists = await versionExists(
      agentId,
      version,
      publisher.id
    )
    if (versionAlreadyExists) {
      return NextResponse.json(
        {
          error: 'Version already exists',
          details: `Agent '${agentId}' version '${version}' already exists for publisher '${publisher.id}'`,
        },
        { status: 409 }
      )
    }

    // Insert the new agent template with the determined version
    const templateWithVersion = { ...template, version }
    const newAgent = await db
      .insert(schema.agentTemplate)
      .values({
        id: agentId,
        version,
        publisher_id: publisher.id,
        template: templateWithVersion,
      })
      .returning()
      .then((rows) => rows[0])

    logger.info(
      {
        userId,
        publisherId: publisher.id,
        agentId,
        version,
        agentTemplateId: newAgent.id,
      },
      'Agent template published successfully'
    )

    return NextResponse.json(
      {
        success: true,
        agent: {
          id: newAgent.id,
          version: newAgent.version,
          publisherId: publisher.id,
          createdAt: newAgent.created_at,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    logger.error({ error }, 'Error handling /api/agents/publish request')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
