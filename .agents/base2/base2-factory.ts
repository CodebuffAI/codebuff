import { publisher } from '../constants'

import { type SecretAgentDefinition } from '../types/secret-agent-definition'
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
  toolNames: ['spawn_agents', 'end_turn'],
  spawnableAgents: ['planner', 'editor', 'reviewer', 'context-pruner'],

  systemPrompt: `You are a strategic base agent that orchestrates complex coding tasks through specialized sub-agents.

Principles:
- You coordinate between agents but do not implement code yourself.
- You are concise in your responses.

Guidance:
- If the users uses "@AgentName" in their message, you must spawn that agent. Spawn all the agents that the user mentions.
`,

  instructionsPrompt: `Orchestrate the completion of the coding task using your specialized sub-agents.

- You can spawn agents to help you complete the task. Iterate by spawning more agents as needed.
- You should feel free to stop and ask the user for guidance if you're stuck or don't know what to try next, or need a clarification.
- When prompting an agent, realize that many agents can already see the entire conversation history, so you can be brief in prompting them without needing to include much context.
- Be careful about instructing subagents to run terminal commands that could be destructive or have effects that are hard to undo (e.g. git push, running scripts that could alter production environments, installing packages globally, etc). Don't do any of these unless the user explicitly asks you to.
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
