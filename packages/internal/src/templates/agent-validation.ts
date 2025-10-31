import {
  collectAgentIds,
  validateAgents,
} from '@codebuff/common/templates/agent-validation'

import { validateSpawnableAgents } from '../util/agent-template-validation'

import type { DynamicAgentValidationError } from '@codebuff/common/templates/agent-validation'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { DynamicAgentTemplate } from '@codebuff/common/types/dynamic-agent-template'

export async function validateAgentsWithSpawnableAgents(params: {
  agentTemplates?: Record<string, any>
  logger: Logger
}): Promise<{
  templates: Record<string, AgentTemplate>
  dynamicTemplates: Record<string, DynamicAgentTemplate>
  validationErrors: DynamicAgentValidationError[]
}> {
  const { agentIds, spawnableAgentIds } = collectAgentIds(params)
  const { validationErrors } = await validateSpawnableAgents({
    spawnableAgents: spawnableAgentIds,
    dynamicAgentIds: agentIds,
  })
  if (validationErrors.length > 0) {
    return {
      templates: {},
      dynamicTemplates: {},
      validationErrors,
    }
  }
  return validateAgents(params)
}
