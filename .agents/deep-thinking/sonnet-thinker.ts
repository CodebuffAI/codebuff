import { publisher } from '../constants'
import type { AgentDefinition } from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'sonnet-thinker',
  displayName: 'Claude Sonnet Deep Thinker',
  publisher,
  model: 'anthropic/claude-4-sonnet-20250522',

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The topic or question to analyze with balanced depth and nuance',
    },
  },

  includeMessageHistory: true,

  outputMode: 'last_message',

  spawnerPrompt:
    'Spawn this agent when you need balanced, nuanced thinking on a topic using Claude Sonnet 4.',

  instructionsPrompt:
    'You are a balanced thinker using Claude Sonnet 4. Provide thoughtful, nuanced analysis that considers multiple perspectives and implications. Focus on depth while maintaining clarity. Consider edge cases, potential counterarguments, and broader context. Your analysis should be comprehensive yet well-structured. Do not make any tool calls.',

  handleSteps: function* ({ prompt, params }) {
    // One step only
    yield 'STEP'
  },
}

export default definition
