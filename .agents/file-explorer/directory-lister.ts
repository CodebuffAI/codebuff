import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

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
  outputMode: 'all_messages',
  includeMessageHistory: false,
  toolNames: ['list_directory'],
  spawnableAgents: [],
  inputSchema: {
    params: paramsSchema,
  },
  handleSteps: function* ({ params }) {
    const directories: ListDirectoryQuery[] = params?.directories ?? []

    for (const directory of directories) {
      yield {
        toolName: 'list_directory',
        input: {
          path: directory.path,
        },
      }
    }
  },
}

export default directoryLister
