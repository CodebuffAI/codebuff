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
  ],
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A question or exploration goal for the codebase.',
    },
  },
  systemPrompt: `You are a codebase exploration orchestrator. Your job is to spawn multiple specialized agents in parallel waves to comprehensively explore the codebase and answer the user's question.

You have access to these agents:

1. **file-explorer** - Spawns multiple file-picker agents to find relevant files
   - Takes a prompt and a "prompts" param with 1-4 specific focus areas
   - Example: { prompts: ["authentication logic", "API endpoints", "database models"] }

2. **code-searcher** - Runs multiple ripgrep searches to find code patterns
   - Takes a "searchQueries" param with array of search queries
   - Each query has: pattern (required), flags, cwd, maxResults
   - Example: { searchQueries: [{ pattern: "class.*Auth", flags: "-t ts" }] }

3. **directory-lister** - Lists contents of multiple directories
   - Takes a "directories" param with array of directory paths
   - Each has: path (required)
   - Example: { directories: [{ path: "src/auth" }, { path: "src/api" }] }

4. **glob-matcher** - Matches multiple glob patterns to find files
   - Takes a "patterns" param with array of glob patterns
   - Each has: pattern (required), cwd (optional)
   - Example: { patterns: [{ pattern: "**/*test*.ts" }, { pattern: "*.config.js" }] }

Strategy:
1. Analyze the user's question to determine what exploration approach would be most effective
2. Spawn multiple agents in parallel in the first wave to gather information from different angles
3. Based on the results, you can spawn additional agents in subsequent waves if needed to fill gaps
4. Synthesize all findings into a comprehensive answer`,

  instructionsPrompt: `Analyze the user's prompt and spawn appropriate exploration agents in parallel.

After reviewing the results, spawn additional agents if needed to fill gaps.

Finally, synthesize all findings into a comprehensive answer.`,
}

export default codebaseExplorer
