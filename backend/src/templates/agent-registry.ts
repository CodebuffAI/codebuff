import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { and, desc, eq } from 'drizzle-orm'

import { ProjectFileContext } from '@codebuff/common/util/file'
import { logger } from '../util/logger'
import { agentTemplates as staticTemplates } from './agent-list'
import {
  DynamicAgentValidationError,
  validateAgents,
} from '@codebuff/common/templates/agent-validation'

export type AgentRegistry = Record<string, AgentTemplate>

// Global database cache - only state in the system
const databaseAgentCache = new Map<string, AgentTemplate | null>()

/**
 * Parse agent ID to extract publisher, agent name, and version
 */
function parseAgentId(fullAgentId: string): {
  publisherId: string
  agentId: string
  version?: string
} | null {
  // Check if it's in the publisher/agent-id[@version] format
  const parts = fullAgentId.split('/')
  if (parts.length !== 2) {
    return null
  }

  const [publisherId, agentNameWithVersion] = parts

  // Check for version suffix
  const versionMatch = agentNameWithVersion.match(/^(.+)@(.+)$/)
  if (versionMatch) {
    const [, agentId, version] = versionMatch
    return { publisherId, agentId, version }
  }

  return { publisherId, agentId: agentNameWithVersion }
}

/**
 * Fetch an agent from the database by publisher/agent-id[@version] format
 */
async function fetchAgentFromDatabase(
  fullAgentId: string,
): Promise<AgentTemplate | null> {
  const parsed = parseAgentId(fullAgentId)
  if (!parsed) {
    return null
  }

  const { publisherId, agentId, version } = parsed

  try {
    let agentConfig

    if (version) {
      // Query for specific version
      agentConfig = await db
        .select()
        .from(schema.agentConfig)
        .where(
          and(
            eq(schema.agentConfig.id, agentId),
            eq(schema.agentConfig.publisher_id, publisherId),
            eq(schema.agentConfig.version, version),
          ),
        )
        .then((rows) => rows[0])
    } else {
      // Query for latest version
      agentConfig = await db
        .select()
        .from(schema.agentConfig)
        .where(
          and(
            eq(schema.agentConfig.id, agentId),
            eq(schema.agentConfig.publisher_id, publisherId),
          ),
        )
        .orderBy(
          desc(schema.agentConfig.major),
          desc(schema.agentConfig.minor),
          desc(schema.agentConfig.patch),
        )
        .limit(1)
        .then((rows) => rows[0])
    }

    if (!agentConfig) {
      logger.debug(
        { publisherId, agentId, version },
        'Agent not found in database',
      )
      return null
    }

    // Convert database agent config to AgentTemplate format
    const agentTemplate = agentConfig.data as AgentTemplate

    // Ensure the agent has the full publisher/agent-id as its ID (without version)
    const fullAgentTemplate: AgentTemplate = {
      ...agentTemplate,
      id: `${publisherId}/${agentId}`,
    }

    logger.debug(
      { publisherId, agentId, version: agentConfig.version },
      'Successfully loaded agent from database',
    )

    return fullAgentTemplate
  } catch (error) {
    logger.error(
      { publisherId, agentId, version, error },
      'Error fetching agent from database',
    )
    return null
  }
}

/**
 * Single function to look up an agent template with clear priority order:
 * 1. localAgentTemplates (dynamic agents + static templates)
 * 2. Database cache
 * 3. Database query
 */
export async function getAgentTemplate(
  agentId: string,
  localAgentTemplates: Record<string, AgentTemplate>,
): Promise<AgentTemplate | null> {
  // 1. Check localAgentTemplates first (dynamic agents + static templates)
  if (localAgentTemplates[agentId]) {
    return localAgentTemplates[agentId]
  }
  // 2. Check database cache
  const cacheKey = agentId
  if (databaseAgentCache.has(cacheKey)) {
    return databaseAgentCache.get(cacheKey) || null
  }

  // 3. Query database (only for publisher/agent-id format)
  if (agentId.includes('/')) {
    const dbAgent = await fetchAgentFromDatabase(agentId)
    // Cache the result (including null for non-existent agents)
    databaseAgentCache.set(cacheKey, dbAgent)
    return dbAgent
  }

  return null
}

/**
 * Assemble local agent templates from fileContext + static templates
 */
export function assembleLocalAgentTemplates(fileContext: ProjectFileContext): {
  agentTemplates: Record<string, AgentTemplate>
  validationErrors: DynamicAgentValidationError[]
} {
  // Load dynamic agents using the service
  const { templates: dynamicTemplates, validationErrors } = validateAgents(
    fileContext.agentTemplates || {},
  )

  // Combine static and dynamic templates
  const agentTemplates = { ...staticTemplates, ...dynamicTemplates }

  return { agentTemplates, validationErrors }
}

/**
 * Clear the database agent cache (useful for testing)
 */
export function clearDatabaseCache(): void {
  databaseAgentCache.clear()
}
