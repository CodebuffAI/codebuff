import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const codebaseExplorer: SecretAgentDefinition = {
  id: 'codebase-explorer',
  displayName: 'Codebase Explorer',
  spawnerPrompt:
    'Orchestrates multiple exploration agents to comprehensively analyze the codebase and answer questions.',
  model: 'anthropic/claude-sonnet-4.5',
  publisher,
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['spawn_agents'],
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
      description: 'A question or exploration goal for the codebase.',
    },
  },
  systemPrompt: `You are a codebase exploration orchestrator. Your job is to spawn multiple specialized agents in parallel waves to comprehensively explore the codebase and answer the user's question.

Strategy:
1. Analyze the user's question to determine what exploration approach would be most effective.
2. You may spawn agents to help you answer the user's question. Feel free to spawn multiple agents in parallel to gather information from different angles.
3. Synthesize all findings into a comprehensive answer.`,

  instructionsPrompt: `Analyze the user's prompt and spawn appropriate exploration agents.

Finally, synthesize all findings into a comprehensive answer.`,
}

export default codebaseExplorer
