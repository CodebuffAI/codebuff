import { schemaToJsonStr } from '@codebuff/common/util/zod-schema'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { AgentTemplateType } from '@codebuff/common/types/session-state'
import { getAgentTemplate } from './agent-registry'

export async function buildSpawnableAgentsDescription(
  spawnableAgents: AgentTemplateType[],
  agentTemplates: Record<string, AgentTemplate>,
): Promise<string> {
  if (spawnableAgents.length === 0) {
    return ''
  }

  const subAgentTypesAndTemplates = await Promise.all(
    spawnableAgents.map(async (agentType) => {
      return [
        agentType,
        await getAgentTemplate(agentType, agentTemplates),
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
      if (!inputSchema) {
        return `- ${agentType}: ${agentTemplate.spawnPurposePrompt}
prompt: None
params: None`
      }
      const { prompt, params } = inputSchema
      return `- ${agentType}: ${agentTemplate.spawnPurposePrompt}
prompt: ${schemaToJsonStr(prompt)}
params: ${schemaToJsonStr(params)}`
    })
    .filter(Boolean)
    .join('\n\n')

  return `\n\n## Spawnable Agents

Use the spawn_agents tool to spawn agents to help you complete the user request. Here are the available agents by their agent_type:

${agentsDescription}`
}
