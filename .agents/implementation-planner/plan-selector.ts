import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'plan-selector',
  publisher,
  model: 'openai/gpt-5',
  reasoningOptions: {
    enabled: true,
    effort: 'low',
  },
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
  includeMessageHistory: false,
  systemPrompt: `You are an expert plan evaluator with deep experience in software engineering, architecture, and project management.

Your task is to analyze multiple plans and select the best one based on:
1. **Feasibility** - How realistic and achievable is the plan?
2. **Quality** - How well does it address the requirements?
3. **Efficiency** - How minimal and focused are the changes?
4. **Maintainability** - How well will this approach work long-term?
5. **Risk** - What are the potential downsides or failure points?

${PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS}`,

  instructionsPrompt: `Analyze all the provided plans and select the best one.

For each plan, evaluate:
- Strengths and weaknesses
- Implementation complexity
- Alignment with the original task
- Potential risks or issues

Use the set_output tool to return your selection.`,
}

export default definition
