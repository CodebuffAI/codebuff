import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'thinker-with-files-gemini',
  publisher,
  model: 'google/gemini-3.1-pro-preview',
  displayName: 'Theo the Theorizer with Files (Gemini)',
  reasoningOptions: {
    effort: 'low',
  },
  spawnerPrompt:
    'Does deep thinking given the prompt and provided files using Gemini. Use this to help you solve a specific problem. This agent has no context on the conversation history so it cannot see files you have read or previous discussion. Instead, you must provide all the relevant context via the prompt or filePaths for this agent to work well.',
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
      required: ['filePaths'],
    },
  },
  outputMode: 'last_message',
  outputSchema: undefined,
  includeMessageHistory: false,
  inheritParentSystemPrompt: false,
  spawnableAgents: [],
  toolNames: [],

  instructionsPrompt: `You are the thinker-with-files-gemini agent. Think about the user request and when satisfied, write out a very concise response that captures the most important points. DO NOT be verbose -- say the absolute minimum needed to answer the user's question correctly.

The parent agent will see your response. DO NOT call any tools. No need to spawn the thinker agent, because you are already the thinker agent. Just do the thinking work now.`,

  handleSteps: function* ({ params }) {
    const filePaths = params?.filePaths as string[] | undefined

    if (filePaths && filePaths.length > 0) {
      yield {
        toolName: 'read_files',
        input: { paths: filePaths },
      }
    }

    yield 'STEP'
  },
}

export default definition
