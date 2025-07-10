import { AGENT_TEMPLATES_DIR } from '../constants'
import { AgentOverrideConfig, AgentOverrideConfigSchema } from '../types/agent-overrides'
import { AgentTemplateTypes } from '../types/session-state'
import { normalizeAgentNames } from './agent-name-normalization'

export interface AgentTemplateValidationResult {
  validConfigs: Array<{ filePath: string; config: AgentOverrideConfig }>
  validationErrors: Array<{ filePath: string; message: string }>
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
 * @returns Object containing valid configs and validation errors
 */
export function validateAgentTemplateConfigs(
  agentTemplates: Record<string, string>
): AgentTemplateValidationResult {
  const validConfigs: Array<{ filePath: string; config: AgentOverrideConfig }> = []
  const validationErrors: Array<{ filePath: string; message: string }> = []
  const availableAgentTypes = Object.values(AgentTemplateTypes)

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
      const config = AgentOverrideConfigSchema.parse(parsedContent)

      // Additional validation for spawnable agents
      if (config.override.spawnableAgents) {
        const { spawnableAgents } = config.override
        const agentList = Array.isArray(spawnableAgents.content)
          ? spawnableAgents.content
          : [spawnableAgents.content]

        // Strip CodebuffAI/ prefix before validation
        const normalizedAgents = normalizeAgentNames(agentList)
        const invalidAgents = normalizedAgents.filter(
          (agent) => !availableAgentTypes.includes(agent as any)
        )

        if (invalidAgents.length > 0) {
          validationErrors.push({
            filePath,
            message: `Invalid spawnable agents: ${invalidAgents.join(', ')}.`,
          })
          continue
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
  const { validConfigs, validationErrors } = validateAgentTemplateConfigs(agentTemplateFiles)

  // Add valid configs to validated files
  for (const { filePath } of validConfigs) {
    validatedFiles[filePath] = agentTemplateFiles[filePath]
  }

  // Log validation errors
  for (const { filePath, message } of validationErrors) {
    logger?.warn({ filePath }, message) ?? console.warn(`${message}: ${filePath}`)
  }

  // Add non-JSON files without validation
  for (const [filePath, content] of Object.entries(agentTemplateFiles)) {
    if (!filePath.endsWith('.json')) {
      validatedFiles[filePath] = content
    }
  }

  return validatedFiles
}
