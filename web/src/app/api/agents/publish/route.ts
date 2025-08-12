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
import { eq, and, or } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '../../auth/[...nextauth]/auth-options'

import type { DynamicAgentTemplate } from '@codebuff/common/types/dynamic-agent-template'
import type { Version } from '@codebuff/internal'
import type { NextRequest } from 'next/server'

import { logger } from '@/util/logger'

async function getPublishedAgentIds(publisherId: string) {
  const agents = await db
    .select({
      id: schema.agentConfig.id,
      version: schema.agentConfig.version,
    })
    .from(schema.agentConfig)
    .where(eq(schema.agentConfig.publisher_id, publisherId))

  return new Set(agents.map((a) => `${publisherId}/${a.id}@${a.version}`))
}

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

    const { data, authToken } = parseResult.data
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

    // Check that all agents have publisher field set
    const agentsWithoutPublisher = agents.filter((agent) => !agent.publisher)
    if (agentsWithoutPublisher.length > 0) {
      const agentIds = agentsWithoutPublisher
        .map((agent) => agent.id)
        .join(', ')
      return NextResponse.json(
        {
          error: 'Publisher field required',
          details: `All agents must have the "publisher" field set. Missing for agents: ${agentIds}`,
        },
        { status: 400 }
      )
    }

    // Check that all agents use the same publisher
    const publisherIds = [...new Set(agents.map((agent) => agent.publisher))]
    if (publisherIds.length > 1) {
      return NextResponse.json(
        {
          error: 'Multiple publishers not allowed',
          details: `All agents in a single request must use the same publisher. Found: ${publisherIds.join(', ')}`,
        },
        { status: 400 }
      )
    }

    const requestedPublisherId = publisherIds[0]!

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

    // Verify user has access to the requested publisher
    const publisherResult = await db
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
        and(
          eq(schema.publisher.id, requestedPublisherId),
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
      )
      .limit(1)

    if (publisherResult.length === 0) {
      return NextResponse.json(
        {
          error: 'Publisher not found or not accessible',
          details: `Publisher '${requestedPublisherId}' not found or you don't have permission to publish to it`,
        },
        { status: 403 }
      )
    }

    const publisher = publisherResult[0].publisher

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
              details: `Agent '${agent.id}' version '${stringifyVersion(version)}' already exists for publisher '${publisher.id}'`,
            },
            { status: 409 }
          )
        }

        agentVersions.push({
          id: agent.id,
          version,
          data: { ...agent, version: stringifyVersion(version) },
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

    // Transform and validate subagent references
    const publishingAgentIds = new Set(
      agentVersions.map(
        (agent) =>
          `${requestedPublisherId}/${agent.id}@${stringifyVersion(agent.version)}`
      )
    )
    const publishedAgentIds = await getPublishedAgentIds(requestedPublisherId)

    // Transform subagent names to full format and validate
    for (const agentVersion of agentVersions) {
      const agent = agentVersion.data
      if (agent.subagents) {
        const transformedSubagents: string[] = []

        for (const subagent of agent.subagents) {
          // Check if already in full format
          const versionMatch = subagent.match(/^([^/]+)\/(.+)@(.+)$/)
          if (versionMatch) {
            // Already in full format, validate it exists
            if (
              !publishingAgentIds.has(subagent) &&
              !publishedAgentIds.has(subagent)
            ) {
              return NextResponse.json(
                {
                  error: 'Invalid spawnable agent',
                  details: `Agent '${agent.id}' references spawnable agent '${subagent}' which is not published and not included in this request.`,
                },
                { status: 400 }
              )
            }
            transformedSubagents.push(subagent)
          } else {
            // Transform simple name to full format
            const transformedName = `${requestedPublisherId}/${subagent}@${stringifyVersion(agentVersion.version)}`

            // Check if the transformed name exists
            if (
              !publishingAgentIds.has(transformedName) &&
              !publishedAgentIds.has(transformedName)
            ) {
              return NextResponse.json(
                {
                  error: 'Invalid spawnable agent',
                  details: `Agent '${agent.id}' references spawnable agent '${subagent}' which resolves to '${transformedName}' but is not published and not included in this request.`,
                },
                { status: 400 }
              )
            }
            transformedSubagents.push(transformedName)
          }
        }

        // Update the agent data with transformed subagent names
        agent.subagents = transformedSubagents
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
