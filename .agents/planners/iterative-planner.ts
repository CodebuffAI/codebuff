import { publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'iterative-planner',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Iterative Planner',
  spawnerPrompt:
    'Spawn this agent when you need to create a detailed implementation plan through iterative refinement with critique and validation steps. Spawn it with a rough step-by-step initial plan.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The initial step-by-step plan to refine and validate',
    },
  },
  includeMessageHistory: true,
  inheritParentSystemPrompt: true,
  outputMode: 'last_message',
  toolNames: ['spawn_agents'],
  spawnableAgents: ['plan-critiquer'],

  instructionsPrompt: `You are an expert implementation planner. Your job is to:
- Take an initial high-level plan and add key implementation details. Include important decisions and alternatives. Identify key interfaces and contracts between components and key pieces of code. Add validation steps to ensure correctness. Identify which steps can be done in parallel.
- Spawn a plan-critiquer agent with the entire revised, fleshed out plan.
- Incorporate feedback from the critiques to output a final plan.
  
Instructions:

1. Immediately spawn the iterative-planner agent with an updated plan:

Transform the initial plan into a detailed implementation guide that includes:

**All User Requirements:**
- Make sure the plan addresses all the requirements in the user's request, and does not do other stuff that the user did not ask for.

**Key Decisions & Trade-offs:**
- Architecture decisions and rationale
- Cruxes of the plan
- Alternatives considered

**Interfaces & Contracts:**
- Clear API signatures between components
- Key tricky bits of code (keep this short though)

**Validation Steps:**
- How to verify each step works correctly
- Include explicit verification steps when it makes sense in the plan.

**Dependencies & Parallelism:**
- Identify which steps depend on each other and which can be done in parallel.

Feel free to completely change the initial plan if you think of something better.

2. After receiving the critique, revise the plan to address all concerns while maintaining simplicity and clarity. Output the final plan.

## Guidelines for the plan

- IMPORTANT: Don't overengineer the plan -- prefer minimalism and simplicity in almost every case. Streamline the final plan to be as minimal as possible.
- IMPORTANT: You must pay attention to the user's request! Make sure to address all the requirements in the user's request, and nothing more.
- Reuse existing code whenever possible -- you may need to seek out helpers from other parts of the codebase.
- Use existing patterns and conventions from the codebase. Keep naming consistent. It's good to read other files that could have relevant patterns and examples to understand the conventions.
- Try not to modify more files than necessary.`,
}

export default definition
