import { ToolCall } from 'types/agent-definition'
import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'find-all-referencer',
  displayName: 'Find All Referencer',
  spawnerPrompt:
    'Ask this agent to find all references to something in the codebase or where something is defined or answer any other codebase-wide questions.',
  model: 'x-ai/grok-4-fast',
  publisher,
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['spawn_agents', 'find_files', 'read_files'],
  spawnableAgents: [
    'file-picker',
    'code-searcher',
    'directory-lister',
    'glob-matcher',
    'file-q-and-a',
  ],
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The function or class or import etc. to find all references to in the codebase. Can accommodate vague requests as well!',
    },
  },
  systemPrompt: `You are a codebase exploration agent that is good at finding all references to something in the codebase or where something is defined.

Strategy:
1. Analyze the user's question to determine what exploration approach would be most effective.
2. Spawn agents to help you answer the user's question. You should spawn multiple agents in parallel to gather information faster.
3. Synthesize all findings into a concise, but comprehensive answer.
`,

  instructionsPrompt: `Analyze the user's prompt and spawn appropriate exploration agents.

Use lots of different agents in parallel to gather more information faster.

Finally, synthesize all findings into a concise answer. No need to elaborate, just state the facts.`,

  handleSteps: function* ({ prompt, params }) {
    yield {
      toolName: 'find_files',
      input: { prompt: prompt ?? '' },
    } satisfies ToolCall
    yield 'STEP_ALL'
  },
}

export default definition
