import { parseAgentId } from '@codebuff/common/util/agent-id-parsing'
import { fetchAgent } from '../templates/fetch-agent'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'

import type { DynamicAgentValidationError } from '@codebuff/common/templates/agent-validation'

export interface SubagentValidationResult {
  valid: boolean
  invalidAgents: string[]
}

/**
 * Centralized validation for spawnable agents.
 * Validates that all spawnable agents reference valid agent types.
 */
export async function validateSpawnableAgents(params: {
  spawnableAgents: string[]
  dynamicAgentIds: string[]
}): Promise<
  SubagentValidationResult & {
    availableAgents: string[]
    validationErrors: DynamicAgentValidationError[]
  }
> {
  const { spawnableAgents, dynamicAgentIds } = params

  // Build complete list of available agent types (normalized)
  const availableAgentTypes = [
    ...Object.values(AgentTemplateTypes),
    ...dynamicAgentIds,
  ]
  const parsedIds = spawnableAgents.map((id) => parseAgentId(id))
  const invalidIds: string[] = []
  const validationErrors: DynamicAgentValidationError[] = []
  for (const id of parsedIds) {
    const { publisherId, agentId, version, givenAgentId } = id

    if (availableAgentTypes.includes(givenAgentId)) {
      // Agent provided by dynamic definitions.
      continue
    }
    if (!publisherId || !agentId || !version) {
      invalidIds.push(givenAgentId)
      validationErrors.push({
        filePath: givenAgentId,
        message: `Invalid agent ID: ${givenAgentId}. Not found. You must include the publisher, agent id, and version if the agent is not defined locally.`,
      })
      continue
    }

    // Check if agent exists in database.
    const agent = await fetchAgent(agentId, version, publisherId)
    if (!agent) {
      if (process.env.NODE_ENV !== 'development') {
        invalidIds.push(givenAgentId)
        validationErrors.push({
          filePath: givenAgentId,
          message: `Invalid agent ID: ${givenAgentId}. Agent not found in database.`,
        })
      }
      continue
    }
    availableAgentTypes.push(givenAgentId)
  }

  return {
    valid: validationErrors.length === 0,
    invalidAgents: invalidIds,
    validationErrors,
    availableAgents: availableAgentTypes,
  }
}

/**
 * Formats a validation error message for spawnable agents
 */
export function formatSpawnableAgentError(
  invalidAgents: string[],
  availableAgents: string[],
): string {
  let message = `Invalid spawnable agents: ${invalidAgents.join(', ')}. Double check the id, including the org prefix if applicable.`

  message += `\n\nAvailable agents: ${availableAgents.join(', ')}`

  return message
}

/**
 * Formats validation errors into a user-friendly error message
 * @param validationErrors - Array of validation errors
 * @returns Formatted error message string or undefined if no errors
 */
export function formatValidationErrorMessage(
  validationErrors: Array<{ filePath: string; message: string }>,
): string | undefined {
  if (validationErrors.length === 0) return undefined

  return validationErrors
    .map((error) => `❌ ${error.filePath}: ${error.message}`)
    .join('\n')
}
