import { logger } from '../util/logger'
import { validateSingleAgent } from './agent-validation'

import type { AgentTemplate } from '../types/agent-template'
import type { DynamicAgentTemplate } from '../types/dynamic-agent-template'

export interface DynamicAgentValidationError {
  filePath: string
  message: string
  details?: string
}

export interface DynamicAgentLoadResult {
  templates: Record<string, AgentTemplate>
  validationErrors: DynamicAgentValidationError[]
}

/**
 * Collect all agent IDs from template files without full validation
 */
export function collectAgentIds(
  agentTemplates: Record<string, DynamicAgentTemplate> = {},
): string[] {
  const agentIds: string[] = []
  const jsonFiles = Object.keys(agentTemplates)

  for (const filePath of jsonFiles) {
    try {
      const content = agentTemplates[filePath]
      if (!content) {
        continue
      }

      // Extract the agent ID if it exists
      if (content.id && typeof content.id === 'string') {
        agentIds.push(content.id)
      }
    } catch (error) {
      // Log but don't fail the collection process for other errors
      logger.debug(
        { filePath, error },
        'Failed to extract agent ID during collection phase',
      )
    }
  }

  return agentIds
}

/**
 * Validate and load dynamic agent templates from user-provided agentTemplates
 */
export function validateAgents(
  agentTemplates: Record<string, DynamicAgentTemplate> = {},
): DynamicAgentLoadResult {
  const templates: Record<string, AgentTemplate> = {}
  const validationErrors: DynamicAgentValidationError[] = []

  const hasAgentTemplates = Object.keys(agentTemplates).length > 0

  if (!hasAgentTemplates) {
    return {
      templates,
      validationErrors,
    }
  }

  try {
    const agentKeys = Object.keys(agentTemplates)

    // Pass 1: Collect all agent IDs from template files
    const dynamicAgentIds = collectAgentIds(agentTemplates)

    // Pass 2: Load and validate each agent template
    for (const agentKey of agentKeys) {
      try {
        const content = agentTemplates[agentKey]
        if (!content) {
          continue
        }

        const validationResult = validateSingleAgent(content, {
          dynamicAgentIds,
          filePath: agentKey,
        })

        if (!validationResult.success) {
          validationErrors.push({
            filePath: agentKey,
            message: validationResult.error!,
          })
          continue
        }

        if (templates[content.id]) {
          validationErrors.push({
            filePath: agentKey,
            message: `Duplicate agent ID: ${content.id}`,
          })
          continue
        }
        templates[content.id] = validationResult.agentTemplate!
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'

        validationErrors.push({
          filePath: agentKey,
          message: `Error in agent template ${agentKey}: ${errorMessage}`,
        })

        logger.warn(
          { filePath: agentKey, error: errorMessage },
          'Failed to load dynamic agent template',
        )
      }
    }
  } catch (error) {
    logger.error({ error }, 'Failed to process agent templates')
    validationErrors.push({
      filePath: 'agentTemplates',
      message: 'Failed to process agent templates',
    })
  }

  return {
    templates,
    validationErrors,
  }
}
