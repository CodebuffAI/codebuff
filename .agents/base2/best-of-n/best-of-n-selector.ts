import type { SecretAgentDefinition } from '../../types/secret-agent-definition'
import { publisher } from '../../constants'

const definition: SecretAgentDefinition = {
  id: 'best-of-n-selector',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Best-of-N Implementation Selector',
  spawnerPrompt:
    'Analyzes multiple implementation proposals and selects the best one',

  includeMessageHistory: true,
  inheritParentSystemPrompt: true,

  toolNames: ['set_output'],
  spawnableAgents: [],

  inputSchema: {
    params: {
      type: 'object',
      properties: {
        implementations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['id', 'content'],
          },
        },
      },
      required: ['implementations'],
    },
  },
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      implementationId: {
        type: 'string',
        description: 'The id of the chosen implementation',
      },
    },
    required: ['implementationId'],
  },

  instructionsPrompt: `As part of the best-of-n workflow of agents, you are the implementation selector agent. You have been provided with multiple implementation proposals via params.

The implementations are available in the params.implementations array, where each has:
- id: A unique identifier for the implementation
- content: The full implementation text with tool calls

Your task is to analyze each implementation proposal carefully, compare them against the original user requirements, and select the best implementation.
Evaluate each based on:
- Correctness and completeness
- Simplicity and maintainability
- Code quality and adherence to project conventions
- Minimal changes to existing code
- Proper reuse of existing helpers and patterns
- Clarity and readability

Do not write any explanations AT ALL.

Your response should be only a single tool call to set_output with the selected implementationId.`,
}

export default definition
