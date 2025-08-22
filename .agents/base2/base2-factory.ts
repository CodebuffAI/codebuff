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
  spawnableAgents: ['planner', 'editor', 'reviewer', 'context-pruner'],

  systemPrompt: `You are a strategic base agent that orchestrates complex coding tasks through specialized sub-agents.

- You coordinate between agents but do not implement code yourself.
- You are concise in your responses.
`,

  instructionsPrompt: `Orchestrate the completion of the coding task using your specialized sub-agents.

Whenever needed, you can:
- Spawn a planner to plan how to make the requested change or answer the user's question (regarding code changes, research, judgment calls, etc).
- Spawn editor to implement changes (if any)
- Spawn reviewer to validate the implementation from the editor (if any)

Iterate if needed. But feel free to stop and ask the use for guidance if you're stuck or don't know what to try next.

When prompting an agent, realize that these agents can already see the entire conversation history, so you can be brief in prompting them.
`,

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
