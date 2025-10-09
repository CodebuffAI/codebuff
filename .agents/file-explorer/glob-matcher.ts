import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

interface GlobQuery {
  pattern: string
  cwd?: string
}

const paramsSchema = {
  type: 'object' as const,
  properties: {
    patterns: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          pattern: { type: 'string' as const },
          cwd: { type: 'string' as const },
        },
        required: ['pattern'],
      },
      description: 'Array of glob patterns to match',
    },
  },
  required: ['patterns'],
}

const globMatcher: SecretAgentDefinition = {
  id: 'glob-matcher',
  displayName: 'Glob Matcher',
  spawnerPrompt:
    'Mechanically runs multiple glob pattern matches and returns all matching files',
  model: 'anthropic/claude-sonnet-4.5',
  publisher,
  outputMode: 'all_messages',
  includeMessageHistory: false,
  toolNames: ['glob'],
  spawnableAgents: [],
  inputSchema: {
    params: paramsSchema,
  },
  handleSteps: function* ({ params }) {
    const patterns: GlobQuery[] = params?.patterns ?? []

    for (const query of patterns) {
      yield {
        toolName: 'glob',
        input: {
          pattern: query.pattern,
          cwd: query.cwd,
        },
      }
    }
  },
}

export default globMatcher
