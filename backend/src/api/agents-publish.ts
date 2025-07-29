import {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from 'express'
import { z } from 'zod'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq, and } from 'drizzle-orm'
import { DynamicAgentTemplateSchema } from '@codebuff/common/types/dynamic-agent-template'

import { getUserIdFromAuthToken } from '../websockets/auth'
import { logger } from '../util/logger'

// Schema for publishing an agent
const publishAgentRequestSchema = z.object({
  publisherId: z.string().min(1),
  agentId: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be in semver format (e.g., 1.0.0)'),
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
      return res.status(401).json({ error: 'Missing or invalid authorization header' })
    }
    
    const authToken = authHeader.substring(7)
    const userId = await getUserIdFromAuthToken(authToken)
    
    if (!userId) {
      return res.status(401).json({ error: 'Invalid authentication token' })
    }

    // Validate request body
    const { publisherId, agentId, version, template } = publishAgentRequestSchema.parse(req.body)
    
    // Verify the template's id matches the agentId
    if (template.id !== agentId) {
      return res.status(400).json({ 
        error: 'Agent ID mismatch', 
        details: `Template id '${template.id}' does not match agentId '${agentId}'` 
      })
    }
    
    // Verify the template's version matches the version
    if (template.version !== version) {
      return res.status(400).json({ 
        error: 'Version mismatch', 
        details: `Template version '${template.version}' does not match version '${version}'` 
      })
    }

    // Check if publisher exists and user has access
    const publisher = await db
      .select()
      .from(schema.publisher)
      .where(eq(schema.publisher.slug, publisherId))
      .then(rows => rows[0])
    
    if (!publisher) {
      return res.status(404).json({ error: 'Publisher not found' })
    }
    
    // For now, we'll allow any authenticated user to publish to any publisher
    // In the future, we might want to add publisher ownership/permissions
    
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
      .then(rows => rows[0])
    
    if (existingAgent) {
      return res.status(409).json({ 
        error: 'Version already exists', 
        details: `Agent '${agentId}' version '${version}' already exists for publisher '${publisherId}'` 
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
      .then(rows => rows[0])

    logger.info(
      { 
        userId, 
        publisherId, 
        agentId, 
        version, 
        agentTemplateId: newAgent.id 
      }, 
      'Agent template published successfully'
    )

    return res.status(201).json({
      success: true,
      agent: {
        id: newAgent.id,
        version: newAgent.version,
        publisherId,
        createdAt: newAgent.created_at,
      },
    })
  } catch (error) {
    logger.error({ error }, 'Error handling /api/agents/publish request')
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid request body', issues: error.errors })
    }
    next(error)
    return
  }
}