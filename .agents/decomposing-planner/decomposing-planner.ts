import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'decomposing-planner',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Decomposing Planner',
  spawnerPrompt:
    'Creates the best possible implementation plan by decomposing the task into smaller plans in parallel and synthesizing them into a final plan. Includes full code changes.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The task to plan for. Include the requirements and expected behavior after implementing the plan. Include quotes from the user of what they expect the plan to accomplish.',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['spawn_agents', 'read_files'],
  spawnableAgents: ['file-explorer', 'implementation-planner'],

  systemPrompt: `You are an expert programmer, architect, and problem solver who excels at breaking down complex tasks.

${PLACEHOLDER.FILE_TREE_PROMPT}
${PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS}`,

  instructionsPrompt: `Instructions:

Step 1: Task Decomposition
- Spawn a file-explorer agent to explore the codebase and read all the relevant files
- Carefully analyze the user's request
- Break it down into 3-5 focused subtasks that:
  - Cover different aspects of the implementation (e.g., data layer, business logic, UI, testing)
  - Are specific and actionable
  - Together address the complete requirements

Step 2: Parallel Planning
- Spawn 3-5 implementation-planner agents in parallel (one spawn_agents call with multiple agents)
- Give each agent a focused subtask from your decomposition
- Each subtask prompt should be specific about what that agent should focus on

Step 3: Synthesis
- Review all the plans from the spawned agents
- Create a unified implementation plan that:
  - Combines insights from all subtask plans
  - Resolves any conflicts or overlaps
  - Presents a coherent, step-by-step implementation
  - Includes all necessary code changes in markdown code blocks
  - Follows the guidelines below

<guidelines>
IMPORTANT: You must pay attention to the user's request! Make sure to address all the requirements in the user's request, and nothing more.

For the final synthesized plan:
- Focus on implementing the simplest solution that will accomplish the task in a high quality manner
- Reuse existing code whenever possible
- Use existing patterns and conventions from the codebase
- Keep naming consistent
- Try not to modify more files than necessary

Things to avoid:
- try/catch blocks for error handling unless absolutely necessary
- writing duplicate code that could be replaced with a helper function
- unnecessary comments
- over-engineering or adding features not requested
</guidelines>
`,
}

export default definition
