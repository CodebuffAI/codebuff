import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import { validateAgents } from '@codebuff/common/templates/agent-validation'
import type { DynamicAgentValidationError } from '@codebuff/common/templates/agent-validation'

// Note: Database lookup is handled by the backend's TemplatesEnvironment
// This package focuses on local agent template assembly

export type AgentRegistry = Record<string, AgentTemplate>

/**
 * Assemble local agent templates from fileContext + static templates
 * This is a pure function that doesn't access external services
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
 * Get an agent template - this is a simplified version that delegates to environment
 * The actual implementation with database access is in the backend's TemplatesEnvironment
 */
export async function getAgentTemplate(
  agentId: string,
  localAgentTemplates: Record<string, AgentTemplate>,
): Promise<AgentTemplate | null> {
  // Simple local lookup - the environment handles database queries
  return localAgentTemplates[agentId] || null
}
