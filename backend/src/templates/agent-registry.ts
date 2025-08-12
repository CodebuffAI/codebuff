import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { and, desc, eq } from 'drizzle-orm'

import { ProjectFileContext } from '@codebuff/common/util/file'
import { logger } from '../util/logger'
import {
  DynamicAgentValidationError,
  validateAgents,
  validateSingleAgent,
} from '@codebuff/common/templates/agent-validation'
import { DynamicAgentTemplate } from '@codebuff/common/types/dynamic-agent-template'

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
async function fetchAgentFromDatabase(parsedAgentId: {
  publisherId: string
  agentId: string
  version?: string
}): Promise<AgentTemplate | null> {
  const { publisherId, agentId, version } = parsedAgentId

  try {
    let agentConfig

    if (version && version !== 'latest') {
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
        'fetchAgentFromDatabase: Agent not found in database',
      )
      return null
    }

    const rawAgentData = agentConfig.data as DynamicAgentTemplate

    // Validate the raw agent data with the original agentId (not full identifier)
    const validationResult = validateSingleAgent(
      { ...rawAgentData, id: agentId },
      {
        filePath: `${publisherId}/${agentId}@${agentConfig.version}`,
        skipSubagentValidation: true,
      },
    )

    if (!validationResult.success) {
      logger.error(
        {
          publisherId,
          agentId,
          version: agentConfig.version,
          error: validationResult.error,
        },
        'fetchAgentFromDatabase: Agent validation failed',
      )
      return null
    }

    // Set the correct full agent ID for the final template
    const agentTemplate = {
      ...validationResult.agentTemplate!,
      id: `${publisherId}/${agentId}@${agentConfig.version}`,
    }

    logger.debug(
      {
        publisherId,
        agentId,
        version: agentConfig.version,
        fullAgentId: agentTemplate.id,
      },
      'fetchAgentFromDatabase: Successfully loaded and validated agent from database',
    )

    return agentTemplate
  } catch (error) {
    logger.error(
      { publisherId, agentId, version, error },
      'fetchAgentFromDatabase: Error fetching agent from database',
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

  const parsed = parseAgentId(agentId)
  if (!parsed) {
    logger.debug({ agentId }, 'getAgentTemplate: Failed to parse agent ID')
    return null
  }

  // 3. Query database (only for publisher/agent-id format)
  const dbAgent = await fetchAgentFromDatabase(parsed)
  if (dbAgent && parsed.version && parsed.version !== 'latest') {
    // Cache only specific versions to avoid stale 'latest' results
    databaseAgentCache.set(cacheKey, dbAgent)
  }
  return dbAgent
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

  // Use dynamic templates only

  const agentTemplates = { ...dynamicTemplates }
  return { agentTemplates, validationErrors }
}

/**
 * Clear the database agent cache (useful for testing)
 */
export function clearDatabaseCache(): void {
  databaseAgentCache.clear()
}
