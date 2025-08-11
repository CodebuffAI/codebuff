import { AgentTemplateTypes } from '../types/session-state'

export interface SubagentValidationResult {
  valid: boolean
  invalidAgents: string[]
}

/**
 * Centralized validation for spawnable agents.
 * Validates that all spawnable agents reference valid agent types.
 */
export function validateSpawnableAgents(
  spawnableAgents: string[],
  dynamicAgentIds: string[],
): SubagentValidationResult & { availableAgents: string[] } {
  // Build complete list of available agent types (normalized)
  const availableAgentTypes = [
    ...Object.values(AgentTemplateTypes),
    ...dynamicAgentIds,
  ]

  // Find invalid agents (those not in available types after normalization)
  const invalidAgents = spawnableAgents.filter(
    (agent, index) => !availableAgentTypes.includes(spawnableAgents[index]),
  )

  return {
    valid: invalidAgents.length === 0,
    invalidAgents,
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
