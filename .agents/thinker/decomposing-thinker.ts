import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'decomposing-thinker',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Decomposing Thinker',
  spawnerPrompt:
    'Creates comprehensive analysis by decomposing problems into multiple thinking angles and synthesizing insights from parallel thinker-sonnet agents.',
  inputSchema: {
    params: {
      type: 'object',
      properties: {
        prompts: {
          type: 'array',
          items: {
            type: 'string',
            description: 'A specific problem or topic to analyze',
          },
          description: 'A list of 2-10 specific problems or topics to analyze',
        },
      },
      required: ['prompts'],
    },
  },
  inheritParentSystemPrompt: true,
  includeMessageHistory: true,
  outputMode: 'structured_output',
  toolNames: ['spawn_agents', 'set_output'],
  spawnableAgents: ['thinker-sonnet'],

  handleSteps: function* ({ params }) {
    const prompts: string[] = params?.prompts ?? []
    const { toolResult } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: prompts.map((promptText) => ({
          agent_type: 'thinker-sonnet',
          prompt: promptText,
        })),
      },
    }

    const thoughts = toolResult
      ? toolResult.map((result) => (result.type === 'json' ? result.value : ''))
      : []
    yield {
      toolName: 'set_output',
      input: { results: thoughts },
    }
  },
}

export default definition
