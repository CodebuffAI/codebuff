import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../../types/secret-agent-definition'
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

  instructionsPrompt: `As part of the best-of-n workflow of agents, you are the implementation selector agent.
  
## Task Instructions

You have been provided with multiple implementation proposals via params.

The implementations are available in the params.implementations array, where each has:
- id: A unique identifier for the implementation
- content: The full implementation text with tool calls

Your task is to analyze each implementation proposal carefully, compare them against the original user requirements, and select the best implementation.
Evaluate each based on (in order of importance):
- Correctness and completeness in fulfilling the user's request.
- Simplicity and maintainability.
- Code quality and adherence to project conventions.
- Proper reuse of existing code (helper functions, libraries, etc.)
- Minimal changes to existing code (fewer files changed, fewer lines changed, etc.)
- Clarity and readability.

## User Request

For context, here is the original user request again:
<user_message>
${PLACEHOLDER.USER_INPUT_PROMPT}
</user_message>

Try to select an implementation that fulfills all the requirements in the user's request.

## Response Format

If needed, use <think> tags to briefly consider the implementations and their strengths and weaknesses.

Then, do not write any other explanations AT ALL. You should directly output a single tool call to set_output with the selected implementationId.`,
}

export default definition
