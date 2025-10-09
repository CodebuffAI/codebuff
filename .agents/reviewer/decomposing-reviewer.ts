import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'decomposing-reviewer',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Decomposing Reviewer',
  spawnerPrompt:
    'Creates comprehensive code review by decomposing the review into multiple focused review aspects and synthesizing insights from parallel reviewer agents.',
  inputSchema: {
    params: {
      type: 'object',
      properties: {
        prompts: {
          type: 'array',
          items: {
            type: 'string',
            description: 'A specific review aspect or concern to analyze',
          },
          description: 'A list of 2-8 specific review aspects to analyze',
        },
      },
      required: ['prompts'],
    },
  },
  inheritParentSystemPrompt: true,
  includeMessageHistory: true,
  outputMode: 'structured_output',
  toolNames: ['spawn_agents', 'set_output'],
  spawnableAgents: ['reviewer'],

  handleSteps: function* ({ params }) {
    const prompts: string[] = params?.prompts ?? []
    const { toolResult } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: prompts.map((promptText) => ({
          agent_type: 'reviewer',
          prompt: promptText,
        })),
      },
    }

    const reviews = toolResult
      ? toolResult.map((result) =>
          result.type === 'json' ? result.value : '',
        )[0]
      : []
    yield {
      toolName: 'set_output',
      input: { reviews },
    }
  },
}

export default definition
