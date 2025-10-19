import { getAgentTemplate } from '@codebuff/agent-runtime/templates/agent-registry'
import { buildArray } from '@codebuff/common/util/array'
import { schemaToJsonStr } from '@codebuff/common/util/zod-schema'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { AgentTemplateType } from '@codebuff/common/types/session-state'

export async function buildSpawnableAgentsDescription(
  params: {
    spawnableAgents: AgentTemplateType[]
    agentTemplates: Record<string, AgentTemplate>
    logger: Logger
  } & ParamsExcluding<
    typeof getAgentTemplate,
    'agentId' | 'localAgentTemplates'
  >,
): Promise<string> {
  const { spawnableAgents, agentTemplates, logger } = params
  if (spawnableAgents.length === 0) {
    return ''
  }

  const subAgentTypesAndTemplates = await Promise.all(
    spawnableAgents.map(async (agentType) => {
      return [
        agentType,
        await getAgentTemplate({
          ...params,
          agentId: agentType,
          localAgentTemplates: agentTemplates,
        }),
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
