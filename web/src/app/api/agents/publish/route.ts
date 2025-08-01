import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { validateAgents } from '@codebuff/common/templates/agent-validation'
import { publishAgentsRequestSchema } from '@codebuff/common/types/api/agents/publish'
import {
  checkAuthToken,
  determineNextVersion,
  stringifyVersion,
  versionExists,
} from '@codebuff/internal'
import { desc, eq, and, or } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '../../auth/[...nextauth]/auth-options'

import type { DynamicAgentTemplate } from '@codebuff/common/types/dynamic-agent-template'
import type { Version } from '@codebuff/internal'
import type { NextRequest } from 'next/server'

import { logger } from '@/util/logger'

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json()
    const parseResult = publishAgentsRequestSchema.safeParse(body)
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

    const { data, publisherId, authToken } = parseResult.data
    const agents = data as DynamicAgentTemplate[] // data is now an array of agents

    // Try cookie-based auth first, then fall back to authToken validation using proper function
    let userId: string | undefined
    const session = await getServerSession(authOptions)

    if (session?.user?.id) {
      userId = session.user.id
    } else if (authToken) {
      const authResult = await checkAuthToken({ authToken })
      if (authResult.success && authResult.user) {
        userId = authResult.user.id
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate all agents
    const agentMap = agents.reduce(
      (
        acc: Record<string, DynamicAgentTemplate>,
        agent: DynamicAgentTemplate
      ) => {
        acc[agent.id] = agent
        return acc
      },
      {} as Record<string, DynamicAgentTemplate>
    )

    const validationResult = validateAgents(agentMap)

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

    // Process all agents atomically
    const agentVersions: { id: string; version: Version; data: any }[] = []

    // First, determine versions for all agents and check for conflicts
    for (const agent of agents) {
      try {
        const version = await determineNextVersion(
          agent.id,
          publisher.id,
          agent.version
        )

        // Check if this version already exists
        const versionAlreadyExists = await versionExists(
          agent.id,
          version,
          publisher.id
        )
        if (versionAlreadyExists) {
          return NextResponse.json(
            {
              error: 'Version already exists',
              details: `Agent '${agent.id}' version '${version}' already exists for publisher '${publisher.id}'`,
            },
            { status: 409 }
          )
        }

        agentVersions.push({
          id: agent.id,
          version,
          data: { ...agent, version },
        })
      } catch (error) {
        return NextResponse.json(
          {
            error: 'Version determination failed',
            details: `Failed for agent '${agent.id}': ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
          { status: 400 }
        )
      }
    }

    // If we get here, all agents can be published. Insert them all in a transaction
    const newAgents = await db.transaction(async (tx) => {
      const results = []
      for (const { id, version, data } of agentVersions) {
        const newAgent = await tx
          .insert(schema.agentConfig)
          .values({
            id,
            version: stringifyVersion(version),
            publisher_id: publisher.id,
            data,
          })
          .returning()
          .then((rows) => rows[0])
        results.push(newAgent)
      }
      return results
    })

    logger.info(
      {
        userId,
        publisherId: publisher.id,
        agentIds: newAgents.map((a) => a.id),
        agentCount: newAgents.length,
      },
      'Agents published successfully'
    )

    return NextResponse.json(
      {
        success: true,
        publisherId: publisher.id,
        agents: newAgents.map((agent) => ({
          id: agent.id,
          version: agent.version,
          displayName: (agent.data as any).displayName,
        })),
      },
      { status: 201 }
    )
  } catch (error: any) {
    logger.error(
      { name: error.name, message: error.message, stack: error.stack },
      'Error handling /api/agents/publish request'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
