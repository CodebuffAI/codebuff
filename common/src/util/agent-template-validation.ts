import { AgentOverrideConfig } from '../types/agent-overrides'
import {
  DynamicAgentTemplate,
  DynamicAgentTemplateSchema,
} from '../types/dynamic-agent-template'
import { AgentTemplateTypes } from '../types/session-state'
import { normalizeAgentNames } from './agent-name-normalization'

export interface SpawnableAgentValidationResult {
  valid: boolean
  invalidAgents: string[]
}

export interface AgentTemplateValidationResult {
  validConfigs: Array<{
    filePath: string
    config: AgentOverrideConfig | DynamicAgentTemplate
  }>
  validationErrors: Array<{ filePath: string; message: string }>
}

/**
 * Centralized validation for spawnable agents.
 * Validates that all spawnable agents reference valid agent types.
 */
export function validateSpawnableAgents(
  spawnableAgents: string[],
  dynamicAgentIds: string[]
): SpawnableAgentValidationResult & { availableAgents: string[] } {
  // Normalize dynamic agent IDs to allow users to reference them without org prefixes
  const normalizedDynamicAgentIds = normalizeAgentNames(dynamicAgentIds)

  // Build complete list of available agent types (normalized)
  const availableAgentTypes = [
    ...Object.values(AgentTemplateTypes),
    ...normalizedDynamicAgentIds,
  ]

  // Normalize spawnable agents for comparison
  const normalizedSpawnableAgents = normalizeAgentNames(spawnableAgents)

  // Find invalid agents (those not in available types after normalization)
  const invalidAgents = spawnableAgents.filter(
    (agent, index) =>
      !availableAgentTypes.includes(normalizedSpawnableAgents[index])
  )

  return {
    valid: invalidAgents.length === 0,
    invalidAgents,
    availableAgents: availableAgentTypes,
  }
}

/**
 * Centralized validation for parent instructions.
 * Validates that all parent instruction keys reference valid agent types.
 */
export function validateParentInstructions(
  parentInstructions: Record<string, string>,
  dynamicAgentIds: string[]
): SpawnableAgentValidationResult & { availableAgents: string[] } {
  // Normalize dynamic agent IDs to allow users to reference them without org prefixes
  const normalizedDynamicAgentIds = normalizeAgentNames(dynamicAgentIds)

  // Build complete list of available agent types (normalized)
  const availableAgentTypes = [
    ...Object.values(AgentTemplateTypes),
    ...normalizedDynamicAgentIds,
  ]

  // Get the keys (agent IDs) from parentInstructions
  const parentInstructionKeys = Object.keys(parentInstructions)

  // Normalize parent instruction keys for comparison
  const normalizedParentInstructionKeys = normalizeAgentNames(
    parentInstructionKeys
  )

  // Find invalid agents (those not in available types after normalization)
  const invalidAgents = parentInstructionKeys.filter(
    (agent, index) =>
      !availableAgentTypes.includes(normalizedParentInstructionKeys[index])
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
  availableAgents: string[]
): string {
  let message = `Invalid spawnable agents: ${invalidAgents.join(', ')}. Double check the id, including the org prefix if applicable.`

  message += `\n\nAvailable agents: ${availableAgents.join(', ')}`

  return message
}

/**
 * Formats a validation error message for parent instructions
 */
export function formatParentInstructionsError(
  invalidAgents: string[],
  availableAgents: string[]
): string {
  let message = `Invalid parent instruction agent IDs: ${invalidAgents.join(', ')}. Double check the id, including the org prefix if applicable.`

  message += `\n\nAvailable agents: ${availableAgents.join(', ')}`

  return message
}

/**
 * Formats validation errors into a user-friendly error message
 * @param validationErrors - Array of validation errors
 * @returns Formatted error message string or undefined if no errors
 */
export function formatValidationErrorMessage(
  validationErrors: Array<{ filePath: string; message: string }>
): string | undefined {
  if (validationErrors.length === 0) return undefined

  return validationErrors
    .map((error) => `❌ ${error.filePath}: ${error.message}`)
    .join('\n')
}

/**
 * Validates agent template files and returns both valid configs and validation errors
 * @param agentTemplates - Record of file paths to file contents
 * @param dynamicAgentIds - Array of dynamic agent IDs to include in validation
 * @returns Object containing valid configs and validation errors
 */
export function validateAgentTemplateConfigs(
  agentTemplates: Record<string, DynamicAgentTemplate>,
  dynamicAgentIds: string[] = []
): AgentTemplateValidationResult {
  const validConfigs: Array<{
    filePath: string
    config: AgentOverrideConfig | DynamicAgentTemplate
  }> = []
  const validationErrors: Array<{ filePath: string; message: string }> = []

  for (const [agentId, content] of Object.entries(agentTemplates)) {
    try {
      const config = DynamicAgentTemplateSchema.parse(content)

      // Additional validation for spawnable agents
      if (config.spawnableAgents && config.spawnableAgents.length > 0) {
        const validation = validateSpawnableAgents(
          config.spawnableAgents,
          dynamicAgentIds
        )
        if (!validation.valid) {
          validationErrors.push({
            filePath: agentId,
            message: formatSpawnableAgentError(
              validation.invalidAgents,
              validation.availableAgents
            ),
          })
          continue
        }
      }

      validConfigs.push({ filePath: agentId, config })
    } catch (error) {
      validationErrors.push({
        filePath: agentId,
        message: `Invalid JSON or schema: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  return { validConfigs, validationErrors }
}

/**
 * Validates agent template override files and returns only valid ones
 */
export function validateAgentTemplateFiles(
  agentTemplates: Record<string, DynamicAgentTemplate>,
  logger?: { warn: (obj: any, msg: string) => void }
): Record<string, DynamicAgentTemplate> {
  const validatedAgents: Record<string, DynamicAgentTemplate> = {}
  const { validConfigs, validationErrors } =
    validateAgentTemplateConfigs(agentTemplates)

  // Add valid configs to validated files
  for (const { filePath } of validConfigs) {
    validatedAgents[filePath] = agentTemplates[filePath]
  }

  // Log validation errors
  for (const { filePath, message } of validationErrors) {
    logger?.warn({ filePath }, message) ??
      console.warn(`${message}: ${filePath}`)
  }

  // Add non-JSON files without validation
  for (const [filePath, content] of Object.entries(agentTemplates)) {
    if (!filePath.endsWith('.json')) {
      validatedAgents[filePath] = content
    }
  }

  return validatedAgents
}
