import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

export const createGeneralAgent = (options: {
  model: 'gpt-5' | 'opus'
}): Omit<SecretAgentDefinition, 'id'> => {
  const { model } = options
  const isGpt5 = model === 'gpt-5'

  return {
    publisher,
    model: isGpt5 ? 'openai/gpt-5.2' : 'anthropic/claude-opus-4.5',
    ...(isGpt5 && {
      reasoningOptions: {
        effort: 'high' as const,
      },
    }),
    displayName: isGpt5 ? 'GPT-5 Agent' : 'Opus Agent',
    spawnerPrompt:
      isGpt5 ?
        'A general-purpose, deep-thinking (and slow) agent that can be used to solve a wide range of problems. Use this to help you solve a specific problem that requires extended reasoning.'
        : 'A general-purpose capable agent that can be used to solve a wide range of problems. Use this to help you solve any problem.',
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
              'A list of relevant file paths to read before thinking. Try to provide ALL the files that could be relevant to your request.',
          },
        },
      },
    },
    outputMode: 'last_message',
    spawnableAgents: [
      'researcher-web',
      'researcher-docs',
      'file-picker',
      'code-searcher',
      'directory-lister',
      'glob-matcher',
      'commander',
    ],
    toolNames: [
      'spawn_agents',
      'read_files',
      'read_subtree',
      'str_replace',
      'write_file',
    ],

    instructionsPrompt: `Use the spawn_agents tool to spawn agents to help you complete the user request. file-picker is really good at finding relevant files in the codebase and so you should spawn it if at all relevant. You should spawn multiple agents in parallel when possible to speed up the process. (e.g. spawn 3 file-pickers + 1 code-searcher + 1 researcher-web in one spawn_agents call or 3 commanders in one spawn_agents call). Read multiple files at once to speed up the process and get more context.`,

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
}
