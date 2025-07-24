import type { DynamicAgentValidationError } from './dynamic-agent-service'
import type { AgentTemplate } from './types'

import { ProjectFileContext } from '@codebuff/common/util/file'
import { logger } from '../util/logger'
import { agentTemplates as staticTemplates } from './agent-list'
import { dynamicAgentService } from './dynamic-agent-service'

export type AgentRegistry = Record<string, AgentTemplate>

export async function getAllAgentTemplates({
  fileContext,
}: {
  fileContext: ProjectFileContext
}): Promise<{
  agentRegistry: AgentRegistry
  validationErrors: DynamicAgentValidationError[]
}> {
  // Load dynamic agents using the service
  const { templates: dynamicTemplates, validationErrors } =
    await dynamicAgentService.loadAgents(fileContext)

  // Combine static and dynamic templates
  const agentRegistry = { ...staticTemplates, ...dynamicTemplates }

  // Get user-defined agent types (dynamic agents with override=false)
  const userDefinedAgentTypes = Object.keys(dynamicTemplates)

  // Update base agent templates to include all available agents
  const baseAgentTypes = [
    'base',
    'base_lite',
    'base_max',
    'base_experimental',
    'claude4_gemini_thinking',
    'ask',
  ]
  for (const baseType of baseAgentTypes) {
    if (agentRegistry[baseType]) {
      const baseTemplate = agentRegistry[baseType]
      // Add user-defined agents to the base agent's spawnable agents list
      const updatedSpawnableAgents = [
        ...baseTemplate.spawnableAgents,
        ...userDefinedAgentTypes,
      ]
      agentRegistry[baseType] = {
        ...baseTemplate,
        spawnableAgents: updatedSpawnableAgents as any[],
      }
    }
  }

  if (validationErrors.length > 0) {
    logger.warn(
      { errors: validationErrors },
      'Dynamic agent template validation errors'
    )
  }

  return { agentRegistry, validationErrors }
}

export const agentRegistry: AgentRegistry = {}
