import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import { JSONObject, JSONValue } from 'types/util-types'

interface ListDirectoryQuery {
  path: string
}

const paramsSchema = {
  type: 'object' as const,
  properties: {
    directories: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          path: { type: 'string' as const },
        },
        required: ['path'],
      },
      description: 'Array of directory paths to list',
    },
  },
  required: ['directories'],
}

const directoryLister: SecretAgentDefinition = {
  id: 'directory-lister',
  displayName: 'Directory Lister',
  spawnerPrompt:
    'Mechanically lists multiple directories and returns their contents',
  model: 'anthropic/claude-sonnet-4.5',
  publisher,
  includeMessageHistory: false,
  outputMode: 'structured_output',
  toolNames: ['list_directory', 'set_output'],
  spawnableAgents: [],
  inputSchema: {
    params: paramsSchema,
  },
  handleSteps: function* ({ params }) {
    const directories: ListDirectoryQuery[] = params?.directories ?? []

    const toolResults: JSONValue[] = []
    for (const directory of directories) {
      const { toolResult } = yield {
        toolName: 'list_directory',
        input: {
          path: directory.path,
        },
      }
      if (toolResult) {
        toolResults.push(
          ...toolResult
            .filter((result) => result.type === 'json')
            .map((result) => ({
              path: directory.path,
              ...(result.value as JSONObject),
            })),
        )
      }
    }

    yield {
      toolName: 'set_output',
      input: {
        results: toolResults,
      },
    }
  },
}

export default directoryLister
