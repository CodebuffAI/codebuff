import type { SecretAgentDefinition } from '../../types/secret-agent-definition'
import { publisher } from '../../constants'

const definition: SecretAgentDefinition = {
  id: 'base2-selector',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Implementation Selector',
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
      reasoning: { type: 'string' },
      implementationId: { id: 'string' },
    },
    required: ['reasoning', 'implementationId'],
  },

  instructionsPrompt: `You are the implementation selector agent. You have been provided with multiple implementation proposals via params.

The implementations are available in the params.implementations array, where each has:
- id: A unique identifier for the implementation
- content: The full implementation text with tool calls

Your task is to:
1. Analyze each implementation proposal carefully
2. Compare them against the original user requirements
3. Evaluate each based on:
   - Correctness and completeness
   - Simplicity and maintainability
   - Code quality and adherence to project conventions
   - Minimal changes to existing code
   - Proper reuse of existing helpers and patterns
   - Clarity and readability

4. Select the best implementation
5. Call set_output with the selected implementation

Format your set_output call with:
{
  "reasoning": "Brief explanation of why this implementation was selected"
  "implementationId": "The id of the chosen implementation",
}`,
}

export default definition
