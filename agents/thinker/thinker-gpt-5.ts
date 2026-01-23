import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'thinker-gpt-5',
  publisher,
  model: 'openai/gpt-5.2',
  displayName: 'GPT-5 Thinker',
  spawnerPrompt:
    'Does deep thinking given the prompt and optionally provided files. Use this to help you solve a specific problem that requires extended reasoning.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The problem you are trying to solve',
    },
    params: {
      type: 'object',
      properties: {
        filePaths: {
          type: 'array',
          items: {
            type: 'string',
            description: 'The path to a file',
          },
          description:
            'An optional list of relevant file paths to read before thinking. Try to provide as many as possible that could be relevant to your request.',
        },
      },
    },
  },
  outputMode: 'last_message',
  spawnableAgents: ['researcher-web', 'researcher-docs', 'file-picker', 'code-searcher', 'directory-lister', 'glob-matcher', 'commander'],
  toolNames: ['spawn_agents', 'read_files'],

  handleSteps: function* ({ params }) {
    const filePaths = params?.filePaths as string[] | undefined

    if (filePaths && filePaths.length > 0) {
      yield {
        toolName: 'read_files',
        input: { paths: filePaths },
      }
    }

    // Allow multiple steps for extended reasoning
    yield 'STEP_ALL'
  },
}

export default definition
