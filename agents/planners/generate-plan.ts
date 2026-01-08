import { publisher } from '../../.agents/constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../../.agents/types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'generate-plan',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Plan Generator',
  spawnerPrompt:
    'Generates 5 alternative plans for a user request, analyzes them, and selects the best and simplest one that meets all requirements.',
  inputSchema: {},
  outputMode: 'structured_output',
  toolNames: ['set_output'],
  spawnableAgents: [],

  includeMessageHistory: true,
  inheritParentSystemPrompt: true,

  instructionsPrompt: `For reference, here is the original user request:
<user_message>
${PLACEHOLDER.USER_INPUT_PROMPT}
</user_message>

You are the generate-plan agent. You are an expert planning agent that generates multiple plan alternatives and selects the optimal one.

IMPORTANT: You do not have access to any tools other than set_output. You can only analyze and write out plans. Do not attempt to use any other tools! Your goal is to generate the best plan for the user's request.

Your task is to:
1. Generate 5 distinct alternative plans for the user's request. Each plan should be complete and actionable but approach the problem differently.
2. After generating all 5 plans, analyze each one against the original user requirements.
3. Select the plan that:
   - Most closely matches all the original user requirements
   - Is the simplest and most straightforward to implement
   - Has the fewest dependencies and moving parts
   - Touches the fewest files
   - Reuses existing helper functions and other code whenever possible
   - Is most maintainable

Output format:
- First, write out all 5 plans clearly labeled as "Plan 1:", "Plan 2:", etc.
- Then write an analysis section comparing the plans against the requirements
- Finally, call set_output with a 'plan' field containing the best plan, which you are free to rewrite (doesn't have to be one of the five already selected).

The selected plan in set_output should be:
- Written in clear, actionable steps
- Free of unnecessary complexity
- Easy to understand and follow
- Optimized for the specific user requirements
- Just the plan text itself, without labels or meta-commentary`,
}

export default definition
