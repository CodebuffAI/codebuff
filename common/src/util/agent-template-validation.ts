import { AgentOverrideConfigSchema } from '../types/agent-overrides'

/**
 * Validates agent template override files and returns only valid ones
 */
export function validateAgentTemplateFiles(
  agentTemplateFiles: Record<string, string>,
  logger?: { warn: (obj: any, msg: string) => void }
): Record<string, string> {
  const validatedFiles: Record<string, string> = {}

  for (const [filePath, content] of Object.entries(agentTemplateFiles)) {
    // Non-JSON files pass through without validation
    if (!filePath.endsWith('.json')) {
      validatedFiles[filePath] = content
      continue
    }

    try {
      AgentOverrideConfigSchema.parse(JSON.parse(content))
      validatedFiles[filePath] = content
    } catch (error) {
      const message = 'Invalid agent template override file, skipping'
      logger?.warn({ error, filePath }, message) ?? 
        console.warn(`${message}: ${filePath}`, error)
    }
  }

  return validatedFiles
}
