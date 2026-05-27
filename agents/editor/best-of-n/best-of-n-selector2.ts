import { publisher } from '../../constants'
import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

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
      ? 'anthropic/claude-sonnet-4.6'
      : isOpus
        ? 'anthropic/claude-opus-4.7'
        : 'openai/gpt-5.5',
    ...(isGpt5 && {
      reasoningOptions: {
        effort: 'high',
      },
    }),
    ...(isOpus && {
      providerOptions: {
        only: ['amazon-bedrock'],
      },
    }),
    displayName: isGpt5
      ? 'Best-of-N GPT-5 Diff Selector'
      : isOpus
        ? 'Best-of-N Opus Diff Selector'
        : 'Best-of-N Sonnet Diff Selector',
    spawnerPrompt:
      'Analyzes multiple implementation proposals (as unified diffs) and selects the best one',

    includeMessageHistory: false,
    inheritParentSystemPrompt: false,

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
                content: {
                  type: 'string',
                  description: 'Unified diff of the proposed changes',
                },
              },
              required: ['id', 'content'],
            },
          },
          requestContext: {
            type: 'string',
            description:
              'Compact original user request and relevant context. Use this as the requirements source when comparing implementations.',
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
        suggestedImprovements: {
          type: 'string',
          description:
            'Optional short notes about important risks or follow-up improvements. Leave empty when the selected implementation is safe to apply as-is.',
        },
      },
      required: ['implementationId', 'reason', 'suggestedImprovements'],
    },

    instructionsPrompt: `As part of the best-of-n workflow of agents, you are the implementation selector agent.
  
## Task Instructions

You have been provided with multiple implementation proposals via params. Each implementation shows a UNIFIED DIFF of the proposed changes. The parent best-of-N workflow intentionally does not pass full conversation history to you, so rely on params.requestContext for the original user request and any relevant context.

The implementations are available in the params.implementations array, where each has:
- id: A selector-local identifier for the implementation (for example candidate-1, candidate-2)
- strategy: The strategy/approach used for this implementation
- content: The unified diff showing what would change

The original request/context is available in params.requestContext. If it is empty, infer requirements from the implementation diffs and strategies only; do not assume access to previous parent conversation history.

The array order is intentionally arbitrary. Do not prefer earlier candidates or candidate-1; choose only by how well the diff satisfies the request.

Your task is to:
1. Analyze each implementation's diff carefully, compare them against the original user requirements
2. Select the best implementation
3. Do not ask the parent workflow to synthesize or rerun proposals. Choose the best captured proposal bundle that satisfies the request most completely, and put only short diagnostic notes in suggestedImprovements when needed.

Evaluate each based on (in order of importance):
- Correctness and completeness in fulfilling the user's request
- Simplicity and maintainability
- Code quality and adherence to project conventions
- Proper reuse of existing code (helper functions, libraries, etc.)
- Minimal changes to existing code (fewer files changed, fewer lines changed)
- Clarity and readability

Some proposal content may end with a "Proposal status:" metadata note. Treat that note as workflow metadata, not source code. A captured-but-unconfirmed proposal is not automatically worse than a clean proposal: prefer the clean proposal only when coverage and correctness are comparable. If a captured multi-file bundle covers the requested files/features substantially better than a narrow clean proposal, select the captured multi-file bundle; the parent workflow may complete, repair, or apply it from captured edit evidence without rerunning proposals.

## Analyzing Non-Chosen Implementations

After selecting the best implementation, look at each non-chosen implementation and identify only aspects that are required before the selected implementation is safe to apply. These might include:
- More elegant code patterns or abstractions
- Simplified logic or reuse of existing code
- Additional edge case handling
- Better naming or organization
- Useful comments or documentation
- Additional features that align with the user's request

Only include notes that are concrete and compatible with the selected implementation. Do not use suggestedImprovements to request another proposal pass, synthesis pass, or broad follow-up work. If the selected implementation is good enough to apply, leave suggestedImprovements empty even if another proposal has optional polish, better wording, nicer comments, or cosmetic ideas.

Do not prefix suggestedImprovements with SYNTHESIZE or REQUIRES_SYNTHESIS. The parent workflow will not run a selector-driven synthesis pass.

## User Request / Context

Use params.requestContext as the source of the user's requirements. Select an implementation that fulfills all of those requirements.

## Response Format

${
  isSonnet || isOpus
    ? `Use <think> tags to write out your thoughts about the implementations as needed to pick the best implementation. IMPORTANT: You should think really really hard to make sure you pick the absolute best implementation! Also analyze the non-chosen implementations for any valuable techniques or approaches that could improve the selected one.

Then, do not write any other explanations AT ALL. You should directly output a single tool call to set_output with the selected implementationId, short reason, and suggestedImprovements string.`
    : `Output a single tool call to set_output with the selected implementationId, reason, and suggestedImprovements. Do not write anything else.`
}`,
  }
}

const definition: SecretAgentDefinition = {
  ...createBestOfNSelector2({ model: 'gpt-5' }),
  id: 'best-of-n-selector2',
}

export default definition
