import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

interface SearchQuery {
  pattern: string
  flags?: string
  cwd?: string
  maxResults?: number
}

const paramsSchema = {
  type: 'object' as const,
  properties: {
    searchQueries: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          pattern: { type: 'string' as const },
          flags: { type: 'string' as const },
          cwd: { type: 'string' as const },
          maxResults: { type: 'number' as const },
        },
        required: ['pattern'],
      },
      description: 'Array of code search queries to execute',
    },
  },
  required: ['searchQueries'],
}

const codeSearcher: SecretAgentDefinition = {
  id: 'code-searcher',
  displayName: 'Code Searcher',
  spawnerPrompt:
    'Mechanically runs multiple code search queries and returns all results',
  model: 'anthropic/claude-sonnet-4.5',
  publisher,
  outputMode: 'all_messages',
  includeMessageHistory: false,
  toolNames: ['code_search'],
  spawnableAgents: [],
  inputSchema: {
    params: paramsSchema,
  },
  systemPrompt:
    'You are a code searcher agent that executes multiple code search queries and compiles the results. Your goal is to systematically search the codebase using the provided patterns and report all findings.',
  instructionsPrompt: `
Execute each code search query provided in the parameters and compile all results.

For each search query, run the code_search tool with the specified pattern, flags, cwd, and maxResults.

After all searches complete, provide a comprehensive summary of the findings, organizing results by search query.
`.trim(),

  handleSteps: function* ({ params }) {
    const searchQueries: SearchQuery[] = params?.searchQueries ?? []

    for (const query of searchQueries) {
      yield {
        toolName: 'code_search',
        input: {
          pattern: query.pattern,
          flags: query.flags,
          cwd: query.cwd,
          maxResults: query.maxResults,
        },
      }
    }
  },
}

export default codeSearcher
