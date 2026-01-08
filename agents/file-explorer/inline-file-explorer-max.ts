import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'inline-file-explorer-max',
  displayName: 'Inline File Explorer Max',
  spawnerPrompt:
    'Ask this agent to explore area of the codebase and read all relevant files. Spawn this agent inline',
  model: 'anthropic/claude-sonnet-4.5',
  publisher,
  outputMode: 'last_message',
  includeMessageHistory: true,
  inheritParentSystemPrompt: true,
  toolNames: ['spawn_agents', 'read_files', 'end_turn'],
  spawnableAgents: ['file-explorer', 'find-all-referencer'],
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The area(s) of the codebase to explore and read all relevant files. Give as much detail as possible.',
    },
  },
  instructionsPrompt: `You are a codebase exploration agent that is good at exploring area of the codebase and reading all relevant files.

Repeat the following steps in multiple rounds:
1. Spawn a file explorer and a find-all-referencer or two to explore the codebase
2. Read all relevant files
3. Go back to step 1 and repeat

The goal is to maximize the amount of context you can gather. Once you have read 20+ files or are sure you have read **all** relevant files use the end_turn tool to end the turn.
You must use this end_turn tool as soon as you have read all relevant files.`,
}

export default definition
