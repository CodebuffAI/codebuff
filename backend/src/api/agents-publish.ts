import {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from 'express'
import { z } from 'zod'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { DynamicAgentTemplateSchema } from '@codebuff/common/types/dynamic-agent-template'

import { getUserIdFromAuthToken } from '../websockets/auth'
import { logger } from '../util/logger'
import { dynamicAgentService } from '../templates/dynamic-agent-service'

// Schema for publishing an agent
const publishAgentRequestSchema = z.object({
  template: DynamicAgentTemplateSchema,
})

// POST /api/agents/publish
export async function publishAgentHandler(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
): Promise<void | ExpressResponse> {
  try {
    // Check authentication
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res
        .status(401)
        .json({ error: 'Missing or invalid authorization header' })
    }

    const authToken = authHeader.substring(7)
    const userId = await getUserIdFromAuthToken(authToken)

    if (!userId) {
      return res.status(401).json({ error: 'Invalid authentication token' })
    }

    // Validate request body
    const parseResult = publishAgentRequestSchema.safeParse(req.body)
    if (!parseResult.success) {
      const errorMessages = parseResult.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
        return `${path}${issue.message}`
      })

      return res.status(400).json({
        error: 'Invalid request body',
        details: errorMessages.join('; '),
        validationErrors: parseResult.error.issues,
      })
    }

    const { template } = parseResult.data

    // Extract agentId and version from template
    const agentId = template.id
    const version = template.version

    if (!version) {
      return res.status(400).json({
        error: 'Invalid template',
        details: 'Template must have an id and version.',
      })
    }

    // Validate semver format
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      return res.status(400).json({
        error: 'Invalid version format',
        details: `Version '${version}' must be in semver format (e.g., 1.0.0)`,
      })
    }

    // Use dynamic agent service to validate the template
    const validationResult = await dynamicAgentService.loadAgents({
      [agentId]: template,
    })

    if (validationResult.validationErrors.length > 0) {
      const errorDetails = validationResult.validationErrors
        .map((err) => `${err.message}${err.details ? ` (${err.details})` : ''}`)
        .join('\n')

      return res.status(400).json({
        error: 'Agent template validation failed',
        details: errorDetails,
        validationErrors: validationResult.validationErrors,
      })
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
      return res.status(403).json({
        error: 'No publisher associated with user',
        details: 'User must have a publisher to publish agents',
      })
    }

    // Check if this version already exists
    const existingAgent = await db
      .select()
      .from(schema.agentTemplate)
      .where(
        and(
          eq(schema.agentTemplate.id, agentId),
          eq(schema.agentTemplate.version, version),
          eq(schema.agentTemplate.publisher_id, publisher.id)
        )
      )
      .then((rows) => rows[0])

    if (existingAgent) {
      return res.status(409).json({
        error: 'Version already exists',
        details: `Agent '${agentId}' version '${version}' already exists for publisher '${publisher.id}'`,
      })
    }

    // Insert the new agent template
    const newAgent = await db
      .insert(schema.agentTemplate)
      .values({
        id: agentId,
        version,
        publisher_id: publisher.id,
        template: template as any, // Cast to satisfy jsonb type
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

    return res.status(201).json({
      success: true,
      agent: {
        id: newAgent.id,
        version: newAgent.version,
        publisherId: publisher.id,
        createdAt: newAgent.created_at,
      },
    })
  } catch (error) {
    logger.error({ error }, 'Error handling /api/agents/publish request')
    next(error)
    return
  }
}
