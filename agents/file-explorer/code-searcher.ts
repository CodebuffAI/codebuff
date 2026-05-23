import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { JSONValue } from '../types/util-types'

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
            description: `Optional ripgrep flags to customize the search (e.g., "-i" for case-insensitive, "-g *.ts -g *.js" for TypeScript and JavaScript files only, "-g !*.test.ts" to exclude Typescript test files, "-A 3" for 3 lines after match, "-B 2" for 2 lines before match). Use with multiple patterns to get comprehensive results. For regex searches, prefix with -P flag`,
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
    `Mechanically runs multiple code search queries (using ripgrep line-oriented search) and returns up to 250 results across all source files, showing each line that matches the search pattern. Excludes git-ignored files. You MUST pass searchQueries in params. Example input: { "params": { "searchQueries": [{ "pattern": "createUser", "flags": "-g *.ts" }, { "pattern": "deleteUser", "flags": "-g *.ts" }, { "pattern": "UserSchema", "maxResults": 5 }] } }

Best practice: spawn code-searcher with 3-5 focused search queries rather than 1 broad query. Each query targets a different aspect of what you're looking for. Use appropriate flags to narrow results to relevant file types.`,
  model: 'anthropic/claude-sonnet-4.5',
  publisher,
  includeMessageHistory: false,
  toolNames: ['code_search', 'set_output'],
  spawnableAgents: [],
  inputSchema: {
    params: paramsSchema,
  },
  outputMode: 'structured_output',
  handleSteps: function* ({ params }) {
    const searchQueries: SearchQuery[] = params?.searchQueries ?? []

    const toolResults: JSONValue[] = []
    for (const query of searchQueries) {
      const { toolResult } = yield {
        toolName: 'code_search',
        input: {
          pattern: query.pattern,
          flags: query.flags,
          cwd: query.cwd,
          maxResults: query.maxResults,
        },
      }
      if (toolResult) {
        toolResults.push(
          ...toolResult
            .filter((result) => result.type === 'json')
            .map((result) => result.value),
        )
      }
    }

    yield {
      toolName: 'set_output',
      input: {
        message: '',
        results: toolResults,
      },
      includeToolCall: false,
    }
  },
}

export default codeSearcher
