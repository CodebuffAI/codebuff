import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../../types/secret-agent-definition'
import { publisher } from '../../constants'

export const createBestOfNSelector = (options: {
  model: 'sonnet' | 'opus' | 'gpt-5' | 'gemini'
}): Omit<SecretAgentDefinition, 'id'> => {
  const { model } = options
  const isSonnet = model === 'sonnet'
  const isOpus = model === 'opus'
  const isGpt5 = model === 'gpt-5'
  const isGemini = model === 'gemini'
  return {
    publisher,
    model: isSonnet
      ? 'anthropic/claude-sonnet-4.5'
      : isOpus
        ? 'anthropic/claude-opus-4.5'
        : isGemini
          ? 'google/gemini-3-pro-preview'
          : 'openai/gpt-5.1',
    ...(isGpt5 && {
      reasoningOptions: {
        effort: 'high',
      },
    }),
    displayName: isGpt5
      ? 'Best-of-N GPT-5 Implementation Selector'
      : isGemini
        ? 'Best-of-N Gemini Implementation Selector'
        : isOpus
          ? 'Best-of-N Opus Implementation Selector'
          : 'Best-of-N Sonnet Implementation Selector',
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

${
  isSonnet || isOpus
    ? `Use <think> tags to write out your thoughts about the implementations as needed to pick the best implementation. IMPORTANT: You should think really really hard to make sure you pick the absolute best implementation! As soon as you know for sure which implementation is the best, you should output your choice.

Then, do not write any other explanations AT ALL. You should directly output a single tool call to set_output with the selected implementationId and short reason.`
    : `Output a single tool call to set_output with the selected implementationId. Do not write anything else.`
}`,
  }
}

const definition: SecretAgentDefinition = {
  ...createBestOfNSelector({ model: 'sonnet' }),
  id: 'best-of-n-selector',
}

export default definition
