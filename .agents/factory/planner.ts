import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { closeXml } from '@codebuff/common/util/xml'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { Model } from '@codebuff/common/constants'
export const planner = (model: Model): Omit<SecretAgentDefinition, 'id'> => ({
  model,
  displayName: AGENT_PERSONAS.planner.displayName,
  spawnerPrompt: AGENT_PERSONAS.planner.purpose,
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'What problem you to solve and a few ideas and suggestions for the plan',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['think_deeply', 'spawn_agents', 'end_turn'],
  spawnableAgents: [], // ARCHIVED: [AgentTemplateTypes.dry_run],

  systemPrompt: `You are an expert software architect. You are good at creating comprehensive plans to tackle the user request.`,

  instructionsPrompt: `Steps for your response:
1. Use the <think_deeply> tool to think through cruxes for the plan, and tricky cases. Consider alternative approaches. Be sure to close the tool call with ${closeXml('think_deeply')}.
2. Write out your plan in a concise way.
3. Spawn 1-5 dry run agents to sketch portions of the implementation of the plan. (Important: do not forget to close the tool call with "${closeXml('spawn_agents')}"!)
4. Synthesize all the information and rewrite the full plan to be the best it can be. Use the end_turn tool.`,

  stepPrompt:
    'Do not forget to use the end_turn tool to end your response. Make sure the final plan is the best it can be.',
})
