import {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from 'express'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq, and, desc } from 'drizzle-orm'

import { logger } from '../util/logger'

// GET /api/agents/:publisherId/:agentId/:version
export async function getAgentHandler(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
): Promise<void | ExpressResponse> {
  try {
    const { publisherId, agentId, version } = req.params

    if (!publisherId || !agentId || !version) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    // Find the publisher
    const publisher = await db
      .select()
      .from(schema.publisher)
      .where(eq(schema.publisher.id, publisherId))
      .then((rows) => rows[0])

    if (!publisher) {
      return res.status(404).json({ error: 'Publisher not found' })
    }

    // Find the agent template
    const agent = await db
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

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' })
    }

    return res.status(200).json({
      id: agent.id,
      version: agent.version,
      publisherId,
      template: agent.template,
      createdAt: agent.created_at,
      updatedAt: agent.updated_at,
    })
  } catch (error) {
    logger.error({ error }, 'Error handling agent retrieval request')
    next(error)
    return
  }
}

// GET /api/agents/:publisherId/:agentId/latest
export async function getLatestAgentHandler(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
): Promise<void | ExpressResponse> {
  try {
    const { publisherId, agentId } = req.params

    if (!publisherId || !agentId) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    // Find the publisher
    const publisher = await db
      .select()
      .from(schema.publisher)
      .where(eq(schema.publisher.id, publisherId))
      .then((rows) => rows[0])

    if (!publisher) {
      return res.status(404).json({ error: 'Publisher not found' })
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
      return res.status(404).json({ error: 'Agent not found' })
    }

    return res.status(200).json({
      id: agent.id,
      version: agent.version,
      publisherId,
      template: agent.template,
      createdAt: agent.created_at,
      updatedAt: agent.updated_at,
    })
  } catch (error) {
    logger.error({ error }, 'Error handling latest agent retrieval request')
    next(error)
    return
  }
}
