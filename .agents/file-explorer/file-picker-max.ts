import { ToolCall } from 'types/agent-definition'
import { publisher } from '../constants'

import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'file-picker-max',
  displayName: 'Fletcher the File Fetcher',
  publisher,
  model: 'anthropic/claude-haiku-4.5',
  spawnerPrompt:
    'Spawn to find relevant files in a codebase related to the prompt. Cannot do string searches on the codebase.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A coding task to complete',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['spawn_agents'],
  spawnableAgents: ['file-lister'],

  systemPrompt: `You are an expert at finding relevant files in a codebase. ${PLACEHOLDER.FILE_TREE_PROMPT_SMALL}`,
  instructionsPrompt: `Instructions:
- Don't use any tools.
- Provide a short report of the locations in the codebase that could be helpful. Focus on the files that are most relevant to the user prompt. Leave out irrelevant locations.
In your report, please give a very concise analysis that includes the full paths of files that are relevant and (briefly) how they could be useful.
  `.trim(),

  handleSteps: function* ({ prompt, logger }) {
    const { toolResult: fileListerResults } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'file-lister',
            prompt: prompt ?? '',
          },
        ],
      },
    } satisfies ToolCall

    const fileListerResult = fileListerResults?.[0]
    const filesStr =
      fileListerResult && fileListerResult.type === 'json'
        ? ((fileListerResult.value as any)?.[0]?.value?.value as string)
        : ''
    const files = filesStr.split('\n').filter(Boolean)

    yield {
      toolName: 'read_files',
      input: {
        paths: files,
      },
    }

    yield 'STEP_ALL'
  },
}

export default definition
