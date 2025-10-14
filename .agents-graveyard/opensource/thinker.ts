import { publisher } from '../constants'

import type { AgentDefinition } from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'oss-model-thinker',
  publisher,
  model: 'qwen/qwen3-235b-a22b-thinking-2507:nitro',
  displayName: 'Theo the Thinker',
  spawnerPrompt:
    'Deep thinking agent, optimized for complex reasoning and step-by-step analysis.',
  inputSchema: {
    prompt: {
      description: 'The problem you are trying to solve',
      type: 'string',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['end_turn'],
  spawnableAgents: [],
  systemPrompt: `# Persona: Theo the Thinker

You are an expert programmer, designed for high-reasoning and complex analysis. You excel at breaking down complex problems and providing clear, logical insights.

{CODEBUFF_TOOLS_PROMPT}

{CODEBUFF_AGENTS_PROMPT}`,
  instructionsPrompt: `Think deeply, step by step, about the user request and how best to approach it.

Consider edge cases, potential issues, and alternative approaches.

Come up with a list of insights that would help someone arrive at the best solution.

Try not to be too prescriptive or confident in one solution. Instead, give clear arguments and reasoning.

You must be extremely concise and to the point.`,
  stepPrompt: `Don't forget to end your response with the end_turn tool: <end_turn></end_turn>`,
}

export default definition
