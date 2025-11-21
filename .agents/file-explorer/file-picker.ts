import { StepText, ToolCall } from 'types/agent-definition'
import { publisher } from '../constants'

import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'file-picker',
  displayName: 'Fletcher the File Fetcher',
  publisher,
  model: 'google/gemini-2.0-flash-001',
  reasoningOptions: {
    enabled: false,
    effort: 'low',
    exclude: false,
  },
  spawnerPrompt:
    'Spawn to find relevant files in a codebase related to the prompt. Outputs up to 12 file paths with short summaries for each file. Cannot do string searches on the codebase, but does a fuzzy search. Unless you know which directories are relevant, omit the directories parameter. This agent is extremely effective at finding files in the codebase that could be relevant to the prompt.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A description of the files you need to find. Be more broad for better results: instead of "Find x file" say "Find x file and related files". This agent is designed to help you find several files that could be relevant to the prompt.',
    },
    params: {
      type: 'object' as const,
      properties: {
        directories: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description:
            'Optional list of paths to directories to look within. If omitted, the entire project tree is used.',
        },
      },
      required: [],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['spawn_agents'],
  spawnableAgents: ['file-lister'],

  systemPrompt: `You are an expert at finding relevant files in a codebase. ${PLACEHOLDER.FILE_TREE_PROMPT}`,
  instructionsPrompt: `Instructions:
Provide an extremely short report of the locations in the codebase that could be helpful. Focus on the files that are most relevant to the user prompt.
In your report, please give a very concise analysis that includes the full paths of files that are relevant and (extremely briefly) how they could be useful.

Do not use any further tools or spawn any further agents.
  `.trim(),

  handleSteps: function* ({ prompt, params, logger }) {
    const { toolResult: fileListerResults } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'file-lister',
            prompt: prompt ?? '',
            params: params ?? {},
          },
        ],
      },
    } satisfies ToolCall

    const filesResult =
      extractSpawnResults<{ text: string }[]>(fileListerResults)[0]
    if (!Array.isArray(filesResult)) {
      yield {
        type: 'STEP_TEXT',
        text: filesResult.errorMessage,
      } satisfies StepText
      return
    }

    const paths = filesResult[0].text.split('\n').filter(Boolean)

    yield {
      toolName: 'read_files',
      input: {
        paths,
      },
    }

    yield 'STEP'

    function extractSpawnResults<T>(
      results: any[] | undefined,
    ): (T | { errorMessage: string })[] {
      if (!results) return []
      const spawnedResults = results
        .filter((result) => result.type === 'json')
        .map((result) => result.value)
        .flat() as {
        agentType: string
        value: { value?: T; errorMessage?: string }
      }[]
      return spawnedResults.map(
        (result) =>
          result.value.value ?? {
            errorMessage:
              result.value.errorMessage ?? 'Error extracting spawn results',
          },
      )
    }
  },
}

export default definition
