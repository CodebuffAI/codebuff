import { AgentTemplateType } from '@codebuff/common/types/session-state'
import { schemaToJsonStr } from '@codebuff/common/util/zod-schema'
import { agentTemplates } from './agent-list'
import { AgentRegistry } from './agent-registry'

export function buildSubagentsDescription(
  subagents: AgentTemplateType[],
  agentRegistry: AgentRegistry
): string {
  if (subagents.length === 0) {
    return ''
  }

  const agentsDescription = subagents
    .map((agentType) => {
      // Try to get from registry first (includes dynamic agents), then fall back to static
      const agentTemplate =
        agentRegistry[agentType] || agentTemplates[agentType]
      if (!agentTemplate) {
        // Fallback for unknown agents
        return `- ${agentType}: Dynamic agent (description not available)
prompt: {"description": "A coding task to complete", "type": "string"}
params: None`
      }
      const { inputSchema } = agentTemplate
      if (!inputSchema) {
        return `- ${agentType}: ${agentTemplate.parentPrompt}
prompt: None
params: None`
      }
      const { prompt, params } = inputSchema
      return `- ${agentType}: ${agentTemplate.parentPrompt}
prompt: ${schemaToJsonStr(prompt)}
params: ${schemaToJsonStr(params)}`
    })
    .filter(Boolean)
    .join('\n\n')

  return `\n\n## Spawnable Agents

Use the spawn_agents tool to spawn subagents to help you complete the user request. Here are the available agents by their agent_type:

${agentsDescription}`
}
