import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import {
  validateAgents,
  validateSingleAgent,
} from '@codebuff/common/templates/agent-validation'
import { parsePublishedAgentId } from '@codebuff/common/util/agent-id-parsing'
import { DEFAULT_ORG_PREFIX } from '@codebuff/common/util/agent-name-normalization'
import { and, desc, eq } from 'drizzle-orm'

import type { DynamicAgentValidationError } from '@codebuff/common/templates/agent-validation'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { FetchAgentFromDatabaseFn } from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { DynamicAgentTemplate } from '@codebuff/common/types/dynamic-agent-template'
import type { ParamsOf } from '@codebuff/common/types/function-params'
import type { ProjectFileContext } from '@codebuff/common/util/file'

export type AgentRegistry = Record<string, AgentTemplate>

// Global database cache - only state in the system
const databaseAgentCache = new Map<string, AgentTemplate | null>()

/**
 * Fetch and validate an agent from the database by publisher/agent-id[@version] format
 */
export async function fetchAgentFromDatabase(
  params: ParamsOf<FetchAgentFromDatabaseFn>,
): ReturnType<FetchAgentFromDatabaseFn> {
  const { parsedAgentId, logger } = params
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
    const validationResult = validateSingleAgent({
      template: { ...rawAgentData, id: agentId, version: agentConfig.version },
      filePath: `${publisherId}/${agentId}@${agentConfig.version}`,
    })

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
        parsedAgentId,
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
export async function getAgentTemplate(params: {
  agentId: string
  localAgentTemplates: Record<string, AgentTemplate>
  fetchAgentFromDatabase: FetchAgentFromDatabaseFn
  logger: Logger
}): Promise<AgentTemplate | null> {
  const { agentId, localAgentTemplates, fetchAgentFromDatabase, logger } =
    params
  // 1. Check localAgentTemplates first (dynamic agents + static templates)
  if (localAgentTemplates[agentId]) {
    return localAgentTemplates[agentId]
  }
  // 2. Check database cache
  if (databaseAgentCache.has(agentId)) {
    return databaseAgentCache.get(agentId) || null
  }

  const parsed = parsePublishedAgentId(agentId)
  if (!parsed) {
    // If agentId doesn't parse as publisher/agent format, try as codebuff/agentId
    const codebuffParsed = parsePublishedAgentId(
      `${DEFAULT_ORG_PREFIX}${agentId}`,
    )
    if (codebuffParsed) {
      const dbAgent = await fetchAgentFromDatabase({
        parsedAgentId: codebuffParsed,
        logger,
      })
      if (dbAgent) {
        databaseAgentCache.set(dbAgent.id, dbAgent)
        return dbAgent
      }
    }
    logger.debug({ agentId }, 'getAgentTemplate: Failed to parse agent ID')
    return null
  }

  // 3. Query database (only for publisher/agent-id format)
  const dbAgent = await fetchAgentFromDatabase({
    parsedAgentId: parsed,
    logger,
  })
  if (dbAgent && parsed.version && parsed.version !== 'latest') {
    // Cache only specific versions to avoid stale 'latest' results
    databaseAgentCache.set(dbAgent.id, dbAgent)
  }
  return dbAgent
}

/**
 * Assemble local agent templates from fileContext + static templates
 */
export function assembleLocalAgentTemplates(params: {
  fileContext: ProjectFileContext
  logger: Logger
}): {
  agentTemplates: Record<string, AgentTemplate>
  validationErrors: DynamicAgentValidationError[]
} {
  const { fileContext, logger } = params
  // Load dynamic agents using the service
  const { templates: dynamicTemplates, validationErrors } = validateAgents({
    agentTemplates: fileContext.agentTemplates,
    logger,
  })

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
