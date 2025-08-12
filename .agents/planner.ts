import { publisher } from './constants'

import type { AgentDefinition } from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'planner',
  publisher,
  model: 'x-ai/grok-4-07-09',
  displayName: 'Peter Plan the Planner',
  toolNames: ['think_deeply', 'spawn_agents', 'end_turn'],
  spawnableAgents: [],
  inputSchema: {
    prompt: {
      description:
        'What problem you to solve and a few ideas and suggestions for the plan',
      type: 'string',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,

  spawnerPrompt: 'Agent that formulates a comprehensive plan to a prompt.',
  systemPrompt: `You are an expert software architect. You are good at creating comprehensive plans to tackle the user request.`,
  instructionsPrompt: `Steps for your response:
1. Use the <think_deeply> tool to think through cruxes for the plan, and tricky cases. Consider alternative approaches. Be sure to close the tool call with </think_deeply>.
2. Write out your plan in a concise way.
3. Spawn 1-5 dry run agents to sketch portions of the implementation of the plan. (Important: do not forget to close the tool call with "</spawn_agents>"!)
4. Synthesize all the information and rewrite the full plan to be the best it can be. Use the end_turn tool.`,
}

export default definition
