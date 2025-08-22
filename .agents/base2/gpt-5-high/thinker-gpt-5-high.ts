import type { AgentDefinition } from '../../types/agent-definition'

import gpt5Thinker from '../../deep-thinking/gpt5-thinker'

const definition: AgentDefinition = {
  ...gpt5Thinker,
  id: 'thinker-gpt-5-high',
  displayName: 'GPT-5 Deep Thinker',
  model: 'openai/gpt-5',
  reasoningOptions: {
    enabled: true,
    effort: 'high',
    exclude: true,
  },
  spawnerPrompt:
    'Spawn this agent when you need deep thinking on a topic using GPT-5 with high reasoning effort.',
}
export default definition
