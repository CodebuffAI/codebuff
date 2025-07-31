import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { validateAgents } from '@codebuff/common/templates/agent-validation'
import { DynamicAgentTemplateSchema } from '@codebuff/common/types/dynamic-agent-template'
import {
  determineNextVersion,
  stringifyVersion,
  versionExists,
} from '@codebuff/internal'
import { desc, eq, and, or } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'

import { authOptions } from '../../auth/[...nextauth]/auth-options'

import type { Version } from '@codebuff/internal'
import type { NextRequest } from 'next/server'

import { logger } from '@/util/logger'

// Schema for publishing an agent
const publishAgentRequestSchema = z.object({
  data: DynamicAgentTemplateSchema,
  publisherId: z.string().optional(),
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

    const { data, publisherId } = parseResult.data
    const agentId = data.id

    const validationResult = validateAgents({
      [agentId]: data,
    })

    if (validationResult.validationErrors.length > 0) {
      const errorDetails = validationResult.validationErrors
        .map((err) => err.message)
        .join('\n')

      return NextResponse.json(
        {
          error: 'Agent config validation failed',
          details: errorDetails,
          validationErrors: validationResult.validationErrors,
        },
        { status: 400 }
      )
    }

    // Look up publishers the user has access to (owned by user or their organizations)
    const publishers = await db
      .select({
        publisher: schema.publisher,
        organization: schema.org,
      })
      .from(schema.publisher)
      .leftJoin(schema.org, eq(schema.publisher.org_id, schema.org.id))
      .leftJoin(
        schema.orgMember,
        and(
          eq(schema.orgMember.org_id, schema.publisher.org_id),
          eq(schema.orgMember.user_id, userId)
        )
      )
      .where(
        or(
          eq(schema.publisher.user_id, userId),
          and(
            eq(schema.orgMember.user_id, userId),
            or(
              eq(schema.orgMember.role, 'owner'),
              eq(schema.orgMember.role, 'admin')
            )
          )
        )
      )
      .orderBy(desc(schema.publisher.updated_at))
    if (publishers.length === 0) {
      return NextResponse.json(
        {
          error: 'No publisher associated with user',
          details: 'User must have a publisher to publish agents',
        },
        { status: 403 }
      )
    }

    // If a specific publisher is requested, find it
    let selectedPublisher
    if (publisherId) {
      const matchingPublisher = publishers.find(
        ({ publisher }) => publisher.id === publisherId
      )
      if (!matchingPublisher) {
        // Format available publishers for error message
        const availablePublishers = publishers.map(
          ({ publisher, organization }) => ({
            id: publisher.id,
            name: publisher.name,
            ownershipType: publisher.user_id ? 'user' : 'organization',
            organizationName: organization?.name,
          })
        )

        return NextResponse.json(
          {
            error: 'Specified publisher not found or not accessible',
            details: `Publisher '${publisherId}' not found. You have access to: ${availablePublishers
              .map(
                (p) =>
                  `${p.id} (${p.name}${p.organizationName ? ` - ${p.organizationName}` : ''})`
              )
              .join(', ')}`,
            availablePublishers,
          },
          { status: 403 }
        )
      }
      selectedPublisher = matchingPublisher.publisher
    } else if (publishers.length > 1) {
      // Multiple publishers available, need to specify which one
      const availablePublishers = publishers.map(
        ({ publisher, organization }) => ({
          id: publisher.id,
          name: publisher.name,
          ownershipType: publisher.user_id ? 'user' : 'organization',
          organizationName: organization?.name,
        })
      )

      return NextResponse.json(
        {
          error: 'Multiple publishers available',
          details:
            'You have access to multiple publishers. Please specify which one to use with the --publisher flag.',
          availablePublishers,
        },
        { status: 403 }
      )
    } else {
      // Use the only available publisher
      selectedPublisher = publishers[0].publisher
    }

    const publisher = selectedPublisher

    // Determine the version to use (auto-increment if not provided)
    let version: Version
    try {
      version = await determineNextVersion(agentId, publisher.id, data.version)
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

    // Insert the new agent config with the determined version
    const dataWithVersion = { ...data, version }
    const newAgent = await db
      .insert(schema.agentConfig)
      .values({
        id: agentId,
        version: stringifyVersion(version),
        publisher_id: publisher.id,
        data: dataWithVersion,
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
      'Agent published successfully'
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
