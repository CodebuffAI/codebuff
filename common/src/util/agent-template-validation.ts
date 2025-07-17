import path from 'path'
import { AGENT_TEMPLATES_DIR } from '../constants'
import {
  AgentOverrideConfig,
  AgentOverrideConfigSchema,
} from '../types/agent-overrides'
import {
  DynamicAgentTemplate,
  DynamicAgentTemplateSchema,
} from '../types/dynamic-agent-template'
import { AgentTemplateTypes } from '../types/session-state'
import {
  normalizeAgentName,
  normalizeAgentNames,
} from './agent-name-normalization'

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
 * Validates that a path is safe and within the agent templates directory
 * @param pathValue - The path to validate
 * @param basePath - The base file path for relative resolution
 * @returns Object with validation result and error message if invalid
 */
function validateAgentTemplatePath(
  pathValue: string,
  basePath: string
): { valid: boolean; message?: string } {
  try {
    // Reject absolute paths immediately
    if (path.posix.isAbsolute(pathValue)) {
      return {
        valid: false,
        message: `Path "${pathValue}" is an absolute path. Only relative paths within the ${AGENT_TEMPLATES_DIR} directory are allowed`,
      }
    }

    // Get the directory of the base file
    const baseDir = path.posix.dirname(basePath)

    // Resolve the path relative to the base file
    const resolvedPath = path.posix.join(baseDir, pathValue)

    // Normalize the path to handle .. and . segments
    const normalizedPath = path.posix.normalize(resolvedPath)

    // Check if the resolved path is within the agent templates directory
    if (!normalizedPath.startsWith(AGENT_TEMPLATES_DIR)) {
      return {
        valid: false,
        message: `Path "${pathValue}" resolves to "${normalizedPath}" which is outside the ${AGENT_TEMPLATES_DIR} directory`,
      }
    }

    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      message: `Invalid path "${pathValue}": ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Validates paths in prompt override objects
 * @param promptOverride - The prompt override to validate
 * @param basePath - The base file path for relative resolution
 * @returns Object with validation result and error message if invalid
 */
function validatePromptOverridePaths(
  promptOverride: any,
  basePath: string
): { valid: boolean; message?: string } {
  if (promptOverride?.path) {
    return validateAgentTemplatePath(promptOverride.path, basePath)
  }
  return { valid: true }
}

/**
 * Validates paths in prompt field objects (for dynamic agent templates)
 * @param promptField - The prompt field to validate
 * @param basePath - The base file path for relative resolution
 * @returns Object with validation result and error message if invalid
 */
function validatePromptFieldPaths(
  promptField: any,
  basePath: string
): { valid: boolean; message?: string } {
  if (typeof promptField === 'object' && promptField?.path) {
    return validateAgentTemplatePath(promptField.path, basePath)
  }
  return { valid: true }
}

/**
 * Validates agent template files and returns both valid configs and validation errors
 * @param agentTemplates - Record of file paths to file contents
 * @param dynamicAgentIds - Array of dynamic agent IDs to include in validation
 * @returns Object containing valid configs and validation errors
 */
export function validateAgentTemplateConfigs(
  agentTemplates: Record<string, string>,
  dynamicAgentIds: string[] = []
): AgentTemplateValidationResult {
  const validConfigs: Array<{
    filePath: string
    config: AgentOverrideConfig | DynamicAgentTemplate
  }> = []
  const validationErrors: Array<{ filePath: string; message: string }> = []

  for (const [filePath, content] of Object.entries(agentTemplates)) {
    // Only process .json files in the agent templates directory
    if (
      !filePath.startsWith(AGENT_TEMPLATES_DIR) ||
      !filePath.endsWith('.json')
    ) {
      continue
    }

    try {
      const parsedContent = JSON.parse(content)

      // Determine if this is an override or a new agent template
      const isOverride = parsedContent.override === true
      const config = isOverride
        ? AgentOverrideConfigSchema.parse(parsedContent)
        : DynamicAgentTemplateSchema.parse(parsedContent)

      // Validate paths in the configuration
      let hasPathValidationErrors = false

      if (isOverride) {
        const overrideConfig = config as AgentOverrideConfig

        // Validate prompt override paths
        const promptFields = [
          'systemPrompt',
          'userInputPrompt',
          'agentStepPrompt',
        ] as const
        for (const field of promptFields) {
          const promptOverride = overrideConfig[field]
          if (promptOverride) {
            const pathValidation = validatePromptOverridePaths(
              promptOverride,
              filePath
            )
            if (!pathValidation.valid) {
              validationErrors.push({
                filePath,
                message: `Invalid ${field} path: ${pathValidation.message}`,
              })
              hasPathValidationErrors = true
            }
          }
        }
      } else {
        const dynamicConfig = config as DynamicAgentTemplate

        // Validate prompt field paths
        const promptFields = [
          'systemPrompt',
          'userInputPrompt',
          'agentStepPrompt',
          'initialAssistantMessage',
          'initialAssistantPrefix',
          'stepAssistantMessage',
          'stepAssistantPrefix',
        ] as const

        for (const field of promptFields) {
          const promptField = dynamicConfig[field]
          if (promptField) {
            const pathValidation = validatePromptFieldPaths(
              promptField,
              filePath
            )
            if (!pathValidation.valid) {
              validationErrors.push({
                filePath,
                message: `Invalid ${field} path: ${pathValidation.message}`,
              })
              hasPathValidationErrors = true
            }
          }
        }
      }

      // Skip further validation if path validation failed
      if (hasPathValidationErrors) {
        continue
      }

      // Additional validation for spawnable agents
      if (isOverride && 'spawnableAgents' in config && config.spawnableAgents) {
        const overrideConfig = config as AgentOverrideConfig
        if (overrideConfig.spawnableAgents) {
          const { spawnableAgents } = overrideConfig
          const agentList = Array.isArray(spawnableAgents.content)
            ? spawnableAgents.content
            : [spawnableAgents.content]

          const validation = validateSpawnableAgents(agentList, dynamicAgentIds)
          if (!validation.valid) {
            validationErrors.push({
              filePath,
              message: formatSpawnableAgentError(
                validation.invalidAgents,
                validation.availableAgents
              ),
            })
            continue
          }
        }
      } else if (!isOverride && 'spawnableAgents' in config) {
        const dynamicConfig = config as DynamicAgentTemplate
        if (
          dynamicConfig.spawnableAgents &&
          dynamicConfig.spawnableAgents.length > 0
        ) {
          const validation = validateSpawnableAgents(
            dynamicConfig.spawnableAgents,
            dynamicAgentIds
          )
          if (!validation.valid) {
            validationErrors.push({
              filePath,
              message: formatSpawnableAgentError(
                validation.invalidAgents,
                validation.availableAgents
              ),
            })
            continue
          }
        }
      }

      validConfigs.push({ filePath, config })
    } catch (error) {
      validationErrors.push({
        filePath,
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
  agentTemplateFiles: Record<string, string>,
  logger?: { warn: (obj: any, msg: string) => void }
): Record<string, string> {
  const validatedFiles: Record<string, string> = {}
  const { validConfigs, validationErrors } =
    validateAgentTemplateConfigs(agentTemplateFiles)

  // Add valid configs to validated files
  for (const { filePath } of validConfigs) {
    validatedFiles[filePath] = agentTemplateFiles[filePath]
  }

  // Log validation errors
  for (const { filePath, message } of validationErrors) {
    logger?.warn({ filePath }, message) ??
      console.warn(`${message}: ${filePath}`)
  }

  // Add non-JSON files without validation
  for (const [filePath, content] of Object.entries(agentTemplateFiles)) {
    if (!filePath.endsWith('.json')) {
      validatedFiles[filePath] = content
    }
  }

  return validatedFiles
}
