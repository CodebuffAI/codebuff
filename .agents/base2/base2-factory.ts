import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { ModelName } from 'types/agent-definition'

export const base2 = (model: ModelName): Omit<SecretAgentDefinition, 'id'> => ({
  publisher,
  model,
  displayName: 'Base Agent v2',
  spawnerPrompt:
    'Advanced base agent that orchestrates planning, editing, and reviewing for complex coding tasks',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A coding task to complete',
    },
    params: {
      type: 'object',
      properties: {
        maxContextLength: {
          type: 'number',
        },
      },
      required: [],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: [
    'spawn_agents',
    'spawn_agent_inline',
    'run_terminal_command',
    'end_turn',
  ],
  spawnableAgents: ['planner-v2', 'editor-v2', 'reviewer', 'context-pruner'],

  systemPrompt: `You are a strategic base agent that orchestrates complex coding tasks through specialized sub-agents.

Your approach:
1. **Planning Phase**: For complex tasks, spawn planner-v2 to create a comprehensive plan
2. **Implementation Phase**: Spawn editor-v2 to implement the changes
3. **Review Phase**: Spawn reviewer to validate and provide feedback

For trivial changes, you may skip planning and go directly to editing.

- You coordinate between agents but do not implement code yourself.
- You are concise in your responses.`,

  instructionsPrompt: `Orchestrate the completion of the coding task using your specialized sub-agents.

Workflow:
1. Assess if the task is complex enough to require planning: if it's not a trivial change, you should spawn planner-v2 
2. Spawn editor-v2 to implement the changes
3. Spawn reviewer to validate the implementation
4. Iterate if needed based on feedback by calling the editor-v2 again, or if you need to make significant changes, spawn the planner-v2 again

When prompting an agent, realize that they can already see the entire conversation history, so you can be brief on what they should do.
`,

  stepPrompt:
    'Continue orchestrating the task (spawn planner => editor => reviewer, iterate with editor if needed) or end turn when complete.',

  handleSteps: function* ({ prompt, params }) {
    while (true) {
      // Run context-pruner before each step
      yield {
        toolName: 'spawn_agent_inline',
        input: {
          agent_type: 'context-pruner',
          params: params ?? {},
        },
      } as any

      const { stepsComplete } = yield 'STEP'
      if (stepsComplete) break
    }
  },
})
