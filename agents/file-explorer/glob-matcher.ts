import { JSONValue } from '@codebuff/common/types/json'
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
  outputMode: 'structured_output',
  includeMessageHistory: false,
  toolNames: ['glob', 'set_output'],
  spawnableAgents: [],
  inputSchema: {
    params: paramsSchema,
  },
  handleSteps: function* ({ params }) {
    const patterns: GlobQuery[] = params?.patterns ?? []

    const toolResults: JSONValue[] = []
    for (const query of patterns) {
      const { toolResult } = yield {
        toolName: 'glob',
        input: {
          pattern: query.pattern,
          cwd: query.cwd,
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
        results: toolResults,
      },
      includeToolCall: false,
    }
  },
}

export default globMatcher
