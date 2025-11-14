import type { AgentDefinition } from '../types/agent-definition'
import { publisher } from '../constants'

const definition: AgentDefinition = {
  id: 'gpt5-thinker',
  displayName: 'GPT-5 Quick Thinker',
  publisher,
  model: 'openai/gpt-5.1',
  reasoningOptions: {
    enabled: true,
    effort: 'low',
    exclude: false,
  },

  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The topic or question to think about deeply and thoroughly',
    },
  },

  includeMessageHistory: true,

  outputMode: 'last_message',

  spawnerPrompt:
    'Spawn this agent when you need quick thinking on a topic using GPT-5 with focused reasoning effort.',

  instructionsPrompt:
    'You are a deep thinker using GPT-5 with focused reasoning. Think hard about the given prompt and provide insightful analysis. Dive deep into the topic, explore multiple angles, and generate meaningful insights. Your goal is to offer a perspective that contributes valuable depth to the overall analysis.',
}
export default definition
