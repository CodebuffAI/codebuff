import { publisher } from '../../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../../types/secret-agent-definition'

export const createCodeReviewerSelector = (options: {
  model: 'sonnet' | 'gpt-5' | 'gemini'
}): Omit<SecretAgentDefinition, 'id'> => {
  const { model } = options
  const isSonnet = model === 'sonnet'
  const isGpt5 = model === 'gpt-5'
  const isGemini = model === 'gemini'

  return {
    publisher,
    model: isSonnet
      ? 'anthropic/claude-sonnet-4.5'
      : isGpt5
        ? 'openai/gpt-5.1'
        : 'google/gemini-3-pro-preview',
    ...((isGpt5 || isGemini) && {
      reasoningOptions: {
        effort: 'medium',
      },
    }),
    displayName: 'Best-of-N Code Review Selector',
    spawnerPrompt:
      'Analyzes multiple code review proposals and selects the best one',

    includeMessageHistory: true,
    inheritParentSystemPrompt: true,

    toolNames: ['set_output'],
    spawnableAgents: [],

    inputSchema: {
      params: {
        type: 'object',
        properties: {
          reviews: {
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
        required: ['reviews'],
      },
    },
    outputMode: 'structured_output',
    outputSchema: {
      type: 'object',
      properties: {
        reviewId: {
          type: 'string',
          description: 'The id of the chosen review',
        },
      },
      required: ['reviewId'],
    },

    instructionsPrompt: `As part of the best-of-n code reviewer workflow, you are the review selector agent.
  
## Task Instructions

You have been provided with multiple code review proposals via params.

The reviews are available in the params.reviews array, where each has:
- id: A unique identifier for the review
- content: The full review text with feedback

Your task is to analyze each review proposal carefully, compare them against the original user requirements and the code changes made, and select the best review.

Evaluate each based on (in order of importance):
- **Critical feedback quality**: How well the review identifies real issues that need to be addressed
- **Completeness**: How thoroughly the review covers all aspects of the changes
- **Actionability**: How specific and actionable the feedback is
- **User advocacy**: How well the review advocates for the user's requirements
- **Clarity and conciseness**: How clearly the feedback is communicated
- **Technical accuracy**: How accurate the technical feedback is

Code guidelines:
- Try to keep any changes to the codebase as minimal as possible.
- Simplify any logic that can be simplified.
- Where a function can be reused, reuse it and do not create a new one.
- Make sure that no new dead code is introduced.
- Make sure there are no missing imports.
- Make sure no sections were deleted that weren't supposed to be deleted.
- Make sure the new code matches the style of the existing code.
- Make sure there are no unnecessary try/catch blocks. Prefer to remove those.
- Mak sure there are no unnecessary type casts. Prefer to remove those.

## User Request

For context, here is the original user request again:
<user_message>
${PLACEHOLDER.USER_INPUT_PROMPT}
</user_message>

Try to select a review that provides the most valuable, actionable, and high signal feedback that will help improve the code changes.

## Response Format

${
  isSonnet
    ? `Use <think> tags to briefly consider the reviews as needed to pick the best one.

If the best one is obvious or the reviews are very similar, you may not need to think very much (a few words suffice) or you may not need to use think tags at all, just pick the best one and output it. You have a dual goal of picking the best review and being fast (using as few words as possible).

Then, do not write any other explanations AT ALL. You should directly output a single tool call to set_output with the selected reviewId and reasoning.`
    : `Output a single tool call to set_output with the selected reviewId and reasoning. Do not write anything else.`
}`,
  }
}

const definition: SecretAgentDefinition = {
  ...createCodeReviewerSelector({ model: 'sonnet' }),
  id: 'code-reviewer-selector',
}

export default definition
