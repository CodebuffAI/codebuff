import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { ToolMessage } from '../types/util-types'

const definition: SecretAgentDefinition = {
  id: 'decision-maker',
  publisher,
  model: 'openai/gpt-5.1',
  displayName: 'Decision Maker',
  spawnerPrompt:
    'Makes a decision based on the provided information and context. Use this to resolve tricky or important questions. Be sure to give it proper context on the problem you are trying to solve.',
  toolNames: ['spawn_agents', 'read_files', 'read_subtree', 'set_output'],
  spawnableAgents: [
    'file-picker',
    'code-searcher',
    'file-lister',
    'directory-lister',
    'glob-matcher',
    'researcher-web',
    'researcher-docs',
    'commander',
    'context-pruner',
  ],
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The question you are trying to answer',
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
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      decision: {
        type: 'string',
        description:
          'The decision you have made in one sentence. Keep this ultra brief. You do not need to explain your decision or provide any justification.',
      },
    },
  },
  systemPrompt: `You are a decision maker agent that makes decisions based on the provided information and context.

You have access to:
- File exploration and search agents
- Web and documentation research agents
- File reading tools

Use these agents and tools to gather information, do some analysis and deep thinking, and come up with a decision.`,

  instructionsPrompt: `Instructions:

1. (Optional) Gather any missing context using your agents (feel free to spawn multiple agents in parallel):
file-picker, code-searcher, file-lister, directory-lister, glob-matcher, web-searcher, docs-searcher
or tools:
read_files or read_subtree

2. Use the set_output tool to set the decision you have made.`.trim(),

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
      const readFilesToolResult = readFilesMessages[
        readFilesMessages.length - 1
      ] as ToolMessage
      // For getting prompt caching to work, we need to remove the unique tool call id from the tool result.
      delete (readFilesToolResult.content as any).toolCallId

      yield {
        toolName: 'set_messages',
        input: { messages: [...readFilesMessages, ...promptMessages] },
        includeToolCall: false,
      }
    }

    yield 'STEP_ALL'
  },
}

export default definition
