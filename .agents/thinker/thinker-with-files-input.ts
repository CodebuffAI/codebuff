import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'thinker-with-files-input',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Theo the Theorizer with Files Input',
  spawnerPrompt:
    'Does deep thinking given the prompt and provided files. Use this to help you solve a specific problem.',
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
            'A list of relevant file paths. Try to provide as many as possible that could be relevant to your request.',
        },
      },
      required: ['filePaths'],
    },
  },
  outputMode: 'last_message',

  instructionsPrompt: `
Think deeply, step by step, about the user request and how best to approach it.

Consider edge cases, potential issues, and alternative approaches. Also, propose reading files or spawning agents to get more context that would be helpful for solving the problem.

Come up with a list of insights that would help someone arrive at the best solution.

Try not to be too prescriptive or confident in one solution. Instead, give clear arguments and reasoning.

You must be extremely concise and to the point.

**Important**: Do not use any tools! You are only thinking!
`.trim(),

  handleSteps: function* ({ params }) {
    const filePaths = params?.filePaths as string[] | undefined

    if (filePaths && filePaths.length > 0) {
      const { agentState } = yield {
        toolName: 'read_files',
        input: { paths: filePaths },
      }

      // Move read files tool call and result to the start of the message history.
      // This makes prompt caching work for different prompts.
      const { messageHistory } = agentState
      const lastAssistantMessageIndex = messageHistory.findLastIndex(
        (message) => message.role === 'assistant',
      )
      const promptMessages = messageHistory.slice(0, lastAssistantMessageIndex)
      const readFilesMessages = messageHistory.slice(lastAssistantMessageIndex)
      yield {
        toolName: 'set_messages',
        input: { messages: [...readFilesMessages, ...promptMessages] },
      }
    }

    yield 'STEP_ALL'
  },
}

export default definition
