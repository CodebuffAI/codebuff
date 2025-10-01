import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'plan-selector',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Plan Selector',
  spawnerPrompt:
    'Expert at evaluating and selecting the best plan from multiple options based on quality, feasibility, and simplicity.',
  toolNames: ['read_files', 'set_output'],
  spawnableAgents: [],
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The original task that was planned for',
    },
    params: {
      type: 'object',
      properties: {
        plans: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              plan: { type: 'string' },
            },
            required: ['id', 'plan'],
          },
        },
      },
    },
  },
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      reasoning: {
        type: 'string',
        description:
          "Thoughts on each plan and what's better or worse about each plan, leading up to which plan is the best choice.",
      },
      selectedPlanId: {
        type: 'string',
        description: 'The ID of the chosen plan.',
      },
    },
    required: ['reasoning', 'selectedPlanId'],
  },
  includeMessageHistory: true,
  systemPrompt: `You are an expert plan evaluator with deep experience in software engineering, architecture, and project management.

We're interested in the simplest solution that will accomplish the task correctly! You got this!

${PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS}`,

  instructionsPrompt: `Analyze all the provided implementations and select the best one based on:

1. **Simplicity** - How clean and easy to understand is the implementation? Is the code overcomplicated or over-engineered?
2. **Correctness** - Does the implementation correctly address the requirements?
3. **Quality** - How well does it work? How clear is the implementation?
4. **Efficiency** - How minimal and focused are the changes? Were more files changed than necessary? Is the code verbose?
5. **Maintainability** - How well will this approach work long-term?
6. **Does what the user expects** - Make sure the implementation addresses all the requirements in the user's request, and does not do other stuff that the user did not ask for.

More on **Simplicity**:
- We don't want an over-engineered solution.
- We're not interested in endless safety and correctness checks.
- Modifying fewer files is better.
- Reusing existing code is better than writing new code.
- It's good to match existing patterns and conventions in the codebase, including naming conventions, code style, and architecture.

For each implementation, evaluate:
- Strengths and weaknesses
- Implementation complexity
- Alignment with the original task

Use the set_output tool to return your selection.`,
}

export default definition
