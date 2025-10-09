import { schemaToJsonStr } from '@codebuff/common/util/zod-schema'

import { getAgentTemplate } from './agent-registry'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { AgentTemplateType } from '@codebuff/common/types/session-state'
import type { Logger } from '@codebuff/types/logger'
import { buildArray } from '@codebuff/common/util/array'

export async function buildSpawnableAgentsDescription(params: {
  spawnableAgents: AgentTemplateType[]
  agentTemplates: Record<string, AgentTemplate>
  logger: Logger
}): Promise<string> {
  const { spawnableAgents, agentTemplates, logger } = params
  if (spawnableAgents.length === 0) {
    return ''
  }

  const subAgentTypesAndTemplates = await Promise.all(
    spawnableAgents.map(async (agentType) => {
      return [
        agentType,
        await getAgentTemplate({ agentId: agentType, localAgentTemplates: agentTemplates, logger }),
      ] as const
    }),
  )

  const agentsDescription = subAgentTypesAndTemplates
    .map(([agentType, agentTemplate]) => {
      if (!agentTemplate) {
        // Fallback for unknown agents
        return `- ${agentType}: Dynamic agent (description not available)
prompt: {"description": "A coding task to complete", "type": "string"}
params: None`
      }
      const { inputSchema } = agentTemplate
      const inputSchemaStr = inputSchema
        ? [
            `prompt: ${schemaToJsonStr(inputSchema.prompt)}`,
            `params: ${schemaToJsonStr(inputSchema.params)}`,
          ].join('\n')
        : ['prompt: None', 'params: None'].join('\n')

      return buildArray(
        `- ${agentType}: ${agentTemplate.spawnerPrompt}`,
        agentTemplate.includeMessageHistory &&
          'This agent can see the current message history.',
        agentTemplate.inheritParentSystemPrompt &&
          "This agent inherits the parent's system prompt for prompt caching.",
        inputSchemaStr,
      ).join('\n')
    })
    .filter(Boolean)
    .join('\n\n')

  return `\n\n## Spawnable Agents

Use the spawn_agents tool to spawn agents to help you complete the user request. Below are the *only* available agents by their agent_type. Other agents may be referenced earlier in the conversation, but they are not available to you. Spawn only the below agents:

${agentsDescription}`
}
