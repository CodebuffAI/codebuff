import { publisher } from '../constants'
import type { AgentDefinition } from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'gemini-thinker',
  displayName: 'Gemini Pro Creative Thinker',
  publisher,
  model: 'google/gemini-2.5-pro',
  reasoningOptions: {
    enabled: true,
    effort: 'low',
    exclude: false,
  },

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The topic or question to explore with creative and innovative thinking',
    },
  },

  includeMessageHistory: true,

  outputMode: 'last_message',

  spawnerPrompt:
    'Spawn this agent when you need creative, innovative thinking on a topic using Gemini Pro.',

  instructionsPrompt:
    'You are a creative thinker using Gemini Pro. Approach the given prompt with innovation and creativity. Think outside the box, consider unconventional angles, and explore novel connections. Generate fresh insights and imaginative solutions while maintaining logical coherence. Your goal is to bring a unique creative perspective to complement other analytical approaches.',
}

export default definition
