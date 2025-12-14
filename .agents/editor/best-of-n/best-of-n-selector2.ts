import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../../types/secret-agent-definition'
import { publisher } from '../../constants'

export const createBestOfNSelector2 = (options: {
  model: 'sonnet' | 'opus' | 'gpt-5'
}): Omit<SecretAgentDefinition, 'id'> => {
  const { model } = options
  const isSonnet = model === 'sonnet'
  const isOpus = model === 'opus'
  const isGpt5 = model === 'gpt-5'
  return {
    publisher,
    model: isSonnet
      ? 'anthropic/claude-sonnet-4.5'
      : isOpus
        ? 'anthropic/claude-opus-4.5'
        : 'openai/gpt-5.1',
    ...(isGpt5 && {
      reasoningOptions: {
        effort: 'high',
      },
    }),
    displayName: isGpt5
      ? 'Best-of-N GPT-5 Diff Selector'
      : isOpus
        ? 'Best-of-N Opus Diff Selector'
        : 'Best-of-N Sonnet Diff Selector',
    spawnerPrompt:
      'Analyzes multiple implementation proposals (as unified diffs) and selects the best one',

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
                strategy: { type: 'string' },
                content: { type: 'string', description: 'Unified diff of the proposed changes' },
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
        reason: {
          type: 'string',
          description:
            'An extremely short (1 sentence) description of why this implementation was chosen',
        },
      },
      required: ['implementationId', 'reason'],
    },

    instructionsPrompt: `As part of the best-of-n workflow of agents, you are the implementation selector agent.
  
## Task Instructions

You have been provided with multiple implementation proposals via params. Each implementation shows a UNIFIED DIFF of the proposed changes.

The implementations are available in the params.implementations array, where each has:
- id: A unique identifier for the implementation (A, B, C, etc.)
- strategy: The strategy/approach used for this implementation
- content: The unified diff showing what would change

Your task is to analyze each implementation's diff carefully, compare them against the original user requirements, and select the best implementation.

Evaluate each based on (in order of importance):
- Correctness and completeness in fulfilling the user's request
- Simplicity and maintainability
- Code quality and adherence to project conventions
- Proper reuse of existing code (helper functions, libraries, etc.)
- Minimal changes to existing code (fewer files changed, fewer lines changed)
- Clarity and readability

## User Request

For context, here is the original user request again:
<user_message>
${PLACEHOLDER.USER_INPUT_PROMPT}
</user_message>

Try to select an implementation that fulfills all the requirements in the user's request.

## Response Format

${
  isSonnet || isOpus
    ? `Use <think> tags to write out your thoughts about the implementations as needed to pick the best implementation. IMPORTANT: You should think really really hard to make sure you pick the absolute best implementation! As soon as you know for sure which implementation is the best, you should output your choice.

Then, do not write any other explanations AT ALL. You should directly output a single tool call to set_output with the selected implementationId and short reason.`
    : `Output a single tool call to set_output with the selected implementationId. Do not write anything else.`
}`,
  }
}

const definition: SecretAgentDefinition = {
  ...createBestOfNSelector2({ model: 'opus' }),
  id: 'best-of-n-selector2',
}

export default definition
