import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { validateSingleAgent } from '@codebuff/common/templates/agent-validation'
import { and, desc, eq } from 'drizzle-orm'

import type { FetchAgentFromDatabaseFn } from '@codebuff/common/types/contracts/database'
import type { DynamicAgentTemplate } from '@codebuff/common/types/dynamic-agent-template'
import type { ParamsOf } from '@codebuff/common/types/function-params'

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
