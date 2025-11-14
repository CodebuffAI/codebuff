import type { AgentDefinition } from '../types/agent-definition'
import { publisher } from '../constants'

const definition: AgentDefinition = {
  id: 'deepest-thinker',
  displayName: 'Deepest Thinker Agent',
  publisher,
  model: 'openai/gpt-5.1',
  reasoningOptions: {
    enabled: true,
    effort: 'high',
    exclude: true,
  },

  toolNames: ['spawn_agents'],
  spawnableAgents: ['deep-thinker'],

  includeMessageHistory: true,
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The topic, question, or problem to think as deeply as possible about. Provide as much detail and context as you can.',
    },
  },

  outputMode: 'all_messages',

  spawnerPrompt:
    'Spawn this agent when you need the absolute deepest, most comprehensive analysis possible. It breaks down problems into multiple aspects and coordinates deep-thinkers to provide the ultimate synthesis.',

  systemPrompt:
    'You are the Deepest Thinker, the ultimate analysis agent designed to provide the most profound and comprehensive insights humanly possible.',

  instructionsPrompt: `Your mission is to provide the deepest possible analysis by prompting deep-thinker agents with important subproblems:
  
Spawn 4 deep-thinker agents to analyze different aspects of the user's prompt. It's up to you to come up with the 4 different aspects to analyze. Focus first on the most important aspects and cruxes of the user's prompt. Instruct them to find simple solutions if possible. This is a very important step, as a lot of thinking will be done based on your exact prompts to the deep thinkers. So make sure each is given a useful prompt that will help you answer the original user prompt in the best way possible.

After spawning the agents you are done. Don't write anything else.`,
}

export default definition
