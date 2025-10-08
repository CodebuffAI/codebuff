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
          pattern: {
            type: 'string' as const,
            description: 'The pattern to search for',
          },
          flags: {
            type: 'string' as const,
            description:
              'Optional ripgrep flags to customize the search (e.g., "-i" for case-insensitive, "-t ts" for TypeScript files only, "-A 3" for 3 lines after match, "-B 2" for 2 lines before match, "--type-not test" to exclude test files)',
          },
          cwd: {
            type: 'string' as const,
            description:
              'Optional working directory to search within, relative to the project root. Defaults to searching the entire project',
          },
          maxResults: {
            type: 'number' as const,
            description:
              'Maximum number of results to return per file. Defaults to 15. There is also a global limit of 250 results across all files',
          },
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
    'Mechanically runs multiple code search queries (using ripgrep line-oriented search) and returns all results',
  model: 'anthropic/claude-sonnet-4.5',
  publisher,
  outputMode: 'all_messages',
  includeMessageHistory: false,
  toolNames: ['code_search'],
  spawnableAgents: [],
  inputSchema: {
    params: paramsSchema,
  },
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
