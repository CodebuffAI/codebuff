import { validateAgents } from '@codebuff/common/templates/agent-validation'

import { agentTemplates as staticTemplates } from './agent-list'
import { logger } from '../util/logger'

import type { DynamicAgentValidationError } from '@codebuff/common/templates/agent-validation'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { ProjectFileContext } from '@codebuff/common/util/file'

export type AgentRegistry = Record<string, AgentTemplate>

export async function getAllAgentTemplates({
  fileContext,
}: {
  fileContext: ProjectFileContext
}): Promise<{
  agentRegistry: AgentRegistry
  validationErrors: DynamicAgentValidationError[]
}> {
  const { templates: dynamicTemplates, validationErrors } = validateAgents(
    fileContext.agentTemplates || {},
  )

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

  const configuredBaseAgent = fileContext.codebuffConfig?.baseAgent
  const configuredSubagents = fileContext.codebuffConfig?.subagents

  for (const baseType of baseAgentTypes) {
    if (agentRegistry[baseType] || baseType === configuredBaseAgent) {
      const baseTemplate = agentRegistry[baseType]

      // Use configured subagents list if present, otherwise use the base agent's subagents list plus user-defined agents
      const updatedSubagents = configuredSubagents ?? [
        ...baseTemplate.subagents,
        ...userDefinedAgentTypes,
      ]

      agentRegistry[baseType] = {
        ...baseTemplate,
        subagents: updatedSubagents as any[],
      }
    }
  }

  if (validationErrors.length > 0) {
    logger.warn(
      { errors: validationErrors },
      'Dynamic agent template validation errors',
    )
  }

  return { agentRegistry, validationErrors }
}

export const agentRegistry: AgentRegistry = {}
