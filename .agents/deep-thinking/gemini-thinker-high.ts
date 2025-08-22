import type { AgentDefinition } from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'gemini-thinker-high',
  displayName: 'Gemini Pro High Thinker',
  model: 'google/gemini-2.5-pro',
  reasoningOptions: {
    enabled: true,
    effort: 'high',
    exclude: true,
  },

  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The topic or question to analyze',
    },
  },

  includeMessageHistory: true,

  outputMode: 'last_message',

  spawnerPrompt:
    'Spawn this agent when you need deep thinking on a topic using Gemini Pro.',

  instructionsPrompt:
    'You are a deep thinker using Gemini Pro. Approach the given prompt with deep analysis and creativity. Generate fresh insights and consider alternative solutions while maintaining logical coherence. Do not make any tool calls. Favor simple solutions when possible.',

  handleSteps: function* ({ prompt, params }) {
    // One step only
    yield 'STEP'
  },
}

export default definition
