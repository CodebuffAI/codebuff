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
  allLocalAgentIds?: string[]
  logger: Logger
}): Promise<{
  templates: Record<string, AgentTemplate>
  dynamicTemplates: Record<string, DynamicAgentTemplate>
  validationErrors: DynamicAgentValidationError[]
}> {
  const { allLocalAgentIds = [] } = params
  const { agentIds, spawnableAgentIds } = collectAgentIds(params)
  // Include both the agents being validated AND all local agent IDs from the client
  // This allows referencing local agents that aren't being published
  const allKnownAgentIds = [...new Set([...agentIds, ...allLocalAgentIds])]
  const { validationErrors } = await validateSpawnableAgents({
    spawnableAgents: spawnableAgentIds,
    dynamicAgentIds: allKnownAgentIds,
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
