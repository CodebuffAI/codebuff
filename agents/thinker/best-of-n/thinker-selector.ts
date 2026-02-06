import { publisher } from '../../constants'
import { type SecretAgentDefinition } from '../../types/secret-agent-definition'

export function createThinkerSelector(
  model: 'sonnet' | 'opus',
): Omit<SecretAgentDefinition, 'id'> {
  const isOpus = model === 'opus'

  return {
    publisher,
    model: isOpus
      ? 'anthropic/claude-opus-4.6'
      : 'anthropic/claude-sonnet-4.5',
    displayName: isOpus
      ? 'Opus Thinker Output Selector'
      : 'Thinker Output Selector',
    spawnerPrompt: 'Analyzes multiple thinking outputs and selects the best one',

    includeMessageHistory: true,
    inheritParentSystemPrompt: true,

    toolNames: ['set_output'],
    spawnableAgents: [],

    inputSchema: {
      params: {
        type: 'object',
        properties: {
          thoughts: {
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
        required: ['thoughts'],
      },
    },
    outputMode: 'structured_output',
    outputSchema: {
      type: 'object',
      properties: {
        thoughtId: {
          type: 'string',
          description: 'The id of the chosen thinking output',
        },
      },
      required: ['thoughtId'],
    },

    instructionsPrompt: `As part of the best-of-n workflow for thinking agents, you are the thinking selector agent.
  
## Task Instructions

You have been provided with multiple thinking outputs via params.

The thoughts are available in the params.thoughts array, where each has:
- id: A unique identifier for the thinking output
- content: The full thinking text

Your task is to analyze each thinking output carefully, compare them against the original user question, and select the best thinking.
Evaluate each based on (in order of importance):
- Depth and thoroughness in addressing the user's question.
- Correctness and accuracy of insights.
- Clarity and organization of thoughts.
- Practical actionability of recommendations.
- Consideration of edge cases and alternatives.

## User Request

Try to select the thinking output that best answers the user's problem.

## Response Format

Use <think> tags to consider the thinking outputs as needed to pick the best one.

Then, do not write any other explanations AT ALL. You should directly output a single tool call to set_output with the selected thoughtId.`,
  }
}

const definition: SecretAgentDefinition = {
  ...createThinkerSelector('sonnet'),
  id: 'thinker-selector',
}

export default definition
