
import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

import type { StepText, ToolCall } from '../types/agent-definition'

type FilePickerMode = 'default' | 'max'

export const createFilePicker = (
  mode: FilePickerMode,
): Omit<SecretAgentDefinition, 'id'> => {
  const isMax = mode === 'max'
  const model = isMax ? 'google/gemini-3.1-flash-lite-preview' : 'google/gemini-2.5-flash-lite'

  return {
    displayName: 'Fletcher the File Fetcher',
    publisher,
    model,
    reasoningOptions: {
      enabled: false,
      effort: 'low',
      exclude: false,
    },
    spawnerPrompt: `Spawn to find relevant files in a codebase related to the prompt. Outputs up to ${isMax ? 20 : 12} file paths with short summaries for each file. Cannot do string searches on the codebase, but does a fuzzy search. Unless you know which directories are relevant, omit the directories parameter. This agent is extremely effective at finding files in the codebase that could be relevant to the prompt.`,
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
    spawnableAgents: isMax
      ? ['file-lister-max']
      : ['file-lister'],

    systemPrompt: `You are an expert at finding relevant files in a codebase. ${PLACEHOLDER.FILE_TREE_PROMPT}`,
    instructionsPrompt: `Instructions:
Provide an extremely short report of the locations in the codebase that could be helpful. Focus on the files that are most relevant to the user prompt.
In your report, please give a very concise analysis that includes the full paths of files that are relevant and (extremely briefly) how they could be useful.

Do not use any further tools or spawn any further agents.
  `.trim(),

    handleSteps: isMax ? handleStepsMax : handleStepsDefault,
  }
}

/**
 * Extract the raw spawn_agents results from the toolResult wrapper.
 * The spawn_agents tool returns results as [{type: 'json', value: [...]}].
 * This extracts the inner value from each spawned agent result.
 */
function extractSpawnResults(results: any[] | undefined): any[] {
  if (!results || results.length === 0) return []
  const jsonResult = results.find((r) => r.type === 'json')
  if (!jsonResult?.value) return []
  const spawnedResults = Array.isArray(jsonResult.value)
    ? jsonResult.value
    : [jsonResult.value]
  return spawnedResults.map((result: any) => result?.value).filter(Boolean)
}

/**
 * Extract text content from a spawned agent's output, handling multiple
 * output formats that the agent runtime may produce:
 * - lastMessage / allMessages: traverses message array for assistant text
 * - structuredOutput: extracts string value or text-containing fields
 * - Direct strings: raw string output
 */
function extractAgentText(agentOutput: any): string | null {
  if (!agentOutput) return null

  // Direct string value
  if (typeof agentOutput === 'string') return agentOutput

  // lastMessage / allMessages format — traverse messages for assistant text
  if (
    (agentOutput.type === 'lastMessage' || agentOutput.type === 'allMessages') &&
    Array.isArray(agentOutput.value)
  ) {
    for (let i = agentOutput.value.length - 1; i >= 0; i--) {
      const message = agentOutput.value[i]
      if (message.role === 'assistant' && Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text' && typeof part.text === 'string') {
            return part.text
          }
        }
      }
    }
  }

  // structuredOutput format — value may be a string or object with text fields
  if (agentOutput.type === 'structuredOutput') {
    if (typeof agentOutput.value === 'string') return agentOutput.value
    if (isObject(agentOutput.value)) {
      for (const key of ['message', 'text', 'content', 'output', 'response']) {
        const val = agentOutput.value[key]
        if (typeof val === 'string' && val) return val
      }
    }
  }

  return null
}

function extractErrorMessage(agentOutput: any): string | null {
  if (!agentOutput) return null
  if (agentOutput.type === 'error') {
    return agentOutput.message ?? agentOutput.value ?? null
  }
  return null
}

function isObject(value: any): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// handleSteps for default mode - spawns 1 file-lister
const handleStepsDefault: SecretAgentDefinition['handleSteps'] = function* ({
  prompt,
  params,
  logger,
}) {
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

  const spawnResults = extractSpawnResults(fileListerResults)

  // Collect paths from all agents and deduplicate
  const allPaths = new Set<string>()
  let hasAnyResults = false

  for (const result of spawnResults) {
    const fileListText = extractAgentText(result)
    if (fileListText) {
      hasAnyResults = true
      const paths = fileListText.split('\n').filter(Boolean)
      for (const path of paths) {
        allPaths.add(path)
      }
    }
  }

  if (!hasAnyResults) {
    const errorMessages = spawnResults
      .map(extractErrorMessage)
      .filter(Boolean)
      .join('; ')
    if (spawnResults.length > 0) {
      logger?.debug?.(
        `file-picker: failed to extract text from spawned results (types: ${spawnResults.map((r: any) => r?.type).filter(Boolean).join(', ')})`,
      )
    }
    yield {
      type: 'STEP_TEXT',
      text: errorMessages
        ? `Error from file-lister(s): ${errorMessages}`
        : 'Error: Could not extract file list from spawned agent(s)',
    } satisfies StepText
    return
  }

  const paths = Array.from(allPaths)

  yield {
    toolName: 'read_files',
    input: { paths },
  }

  yield 'STEP'
}

// handleSteps for max mode - spawns 1 file-lister-max
const handleStepsMax: SecretAgentDefinition['handleSteps'] = function* ({
  prompt,
  params,
  logger,
}) {
  const { toolResult: fileListerResults } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: [
        {
          agent_type: 'file-lister-max',
          prompt: prompt ?? '',
          params: params ?? {},
        },
      ],
    },
  } satisfies ToolCall

  const spawnResults = extractSpawnResults(fileListerResults)

  // Collect paths from all agents and deduplicate
  const allPaths = new Set<string>()
  let hasAnyResults = false

  for (const result of spawnResults) {
    const fileListText = extractAgentText(result)
    if (fileListText) {
      hasAnyResults = true
      const paths = fileListText.split('\n').filter(Boolean)
      for (const path of paths) {
        allPaths.add(path)
      }
    }
  }

  if (!hasAnyResults) {
    const errorMessages = spawnResults
      .map(extractErrorMessage)
      .filter(Boolean)
      .join('; ')
    if (spawnResults.length > 0) {
      logger?.debug?.(
        `file-picker-max: failed to extract text from spawned results (types: ${spawnResults.map((r: any) => r?.type).filter(Boolean).join(', ')})`,
      )
    }
    yield {
      type: 'STEP_TEXT',
      text: errorMessages
        ? `Error from file-lister(s): ${errorMessages}`
        : 'Error: Could not extract file list from spawned agent(s)',
    } satisfies StepText
    return
  }

  const paths = Array.from(allPaths)

  yield {
    toolName: 'read_files',
    input: { paths },
  }

  yield 'STEP'
}

const definition: SecretAgentDefinition = {
  id: 'file-picker',
  ...createFilePicker('default'),
}

export { extractSpawnResults, extractAgentText, extractErrorMessage, isObject }
export default definition
