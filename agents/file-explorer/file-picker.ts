
import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

import type { StepText, ToolCall } from '../types/agent-definition'

type FilePickerMode = 'default' | 'max'

/**
 * Type guard to check if value is a non-null object.
 * DUPLICATE: Keep in sync with copies inside handleStepsDefault and handleStepsMax (required for serialization).
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

/**
 * Extracts spawn results from tool result array, returning agent values.
 * DUPLICATE: Keep in sync with copies inside handleStepsDefault and handleStepsMax (required for serialization).
 */
function extractSpawnResults(results: unknown[] | undefined): unknown[] {
  if (!results || results.length === 0) return []
  const jsonResult = results.find(
    (r): r is { type: 'json'; value: unknown } =>
      isObject(r) && r.type === 'json',
  )
  if (!jsonResult?.value) return []
  const spawnedResults = Array.isArray(jsonResult.value)
    ? jsonResult.value
    : [jsonResult.value]
  // Each spawned result may be an object with a .value property (spawn wrapper)
  // or the agent output directly (type: 'lastMessage' or type: 'error')
  return spawnedResults
    .map((result: unknown) => {
      if (!isObject(result)) return undefined
      // If it's a spawn wrapper with .value, extract the value
      if ('value' in result && result.type !== 'lastMessage' && result.type !== 'error') {
        return result.value
      }
      // Otherwise it's the agent output directly
      return result
    })
    .filter(Boolean)
}

/**
 * Extracts the most recent assistant text from an agent's output.
 * DUPLICATE: Keep in sync with copies inside handleStepsDefault and handleStepsMax (required for serialization).
 */
function extractLastMessageText(agentOutput: unknown): string | null {
  if (!isObject(agentOutput)) return null
  if (agentOutput.type !== 'lastMessage' || !Array.isArray(agentOutput.value)) {
    return null
  }
  for (let i = agentOutput.value.length - 1; i >= 0; i--) {
    const message = agentOutput.value[i]
    if (
      isObject(message) &&
      message.role === 'assistant' &&
      Array.isArray(message.content)
    ) {
      for (const part of message.content) {
        if (
          isObject(part) &&
          part.type === 'text' &&
          typeof part.text === 'string'
        ) {
          return part.text
        }
      }
    }
  }
  return null
}

/**
 * Extracts error message from agent output if present.
 * DUPLICATE: Keep in sync with copies inside handleStepsDefault and handleStepsMax (required for serialization).
 */
function extractErrorMessage(agentOutput: unknown): string | null {
  if (!isObject(agentOutput)) return null
  if (agentOutput.type === 'error') {
    if (typeof agentOutput.message === 'string') return agentOutput.message
    if (typeof agentOutput.value === 'string') return agentOutput.value
  }
  return null
}

export const createFilePicker = (
  mode: FilePickerMode,
): Omit<SecretAgentDefinition, 'id'> => {
  const isMax = mode === 'max'
  const model = isMax ? 'x-ai/grok-4.1-fast' : 'google/gemini-2.5-flash-lite'

  return {
    displayName: 'Fletcher the File Fetcher',
    publisher,
    model,
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

    handleSteps: isMax ? handleStepsMax : handleStepsDefault,
  }
}

// handleSteps for default mode - spawns 1 file-lister
const handleStepsDefault: SecretAgentDefinition['handleSteps'] = function* ({
  prompt,
  params,
}) {
  // ============================================================================
  // Helper functions duplicated inside generator for sandbox serialization.
  // DUPLICATE: Keep in sync with module-level versions.
  // ============================================================================
  function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object'
  }

  function extractSpawnResults(results: unknown[] | undefined): unknown[] {
    if (!results || results.length === 0) return []
    const jsonResult = results.find(
      (r): r is { type: 'json'; value: unknown } =>
        isObject(r) && r.type === 'json',
    )
    if (!jsonResult?.value) return []
    const spawnedResults = Array.isArray(jsonResult.value)
      ? jsonResult.value
      : [jsonResult.value]
    return spawnedResults
      .map((result: unknown) => {
        if (!isObject(result)) return undefined
        if ('value' in result && result.type !== 'lastMessage' && result.type !== 'error') {
          return result.value
        }
        return result
      })
      .filter(Boolean)
  }

  function extractLastMessageText(agentOutput: unknown): string | null {
    if (!isObject(agentOutput)) return null
    if (agentOutput.type !== 'lastMessage' || !Array.isArray(agentOutput.value)) {
      return null
    }
    for (let i = agentOutput.value.length - 1; i >= 0; i--) {
      const message = agentOutput.value[i]
      if (
        isObject(message) &&
        message.role === 'assistant' &&
        Array.isArray(message.content)
      ) {
        for (const part of message.content) {
          if (
            isObject(part) &&
            part.type === 'text' &&
            typeof part.text === 'string'
          ) {
            return part.text
          }
        }
      }
    }
    return null
  }

  function extractErrorMessage(agentOutput: unknown): string | null {
    if (!isObject(agentOutput)) return null
    if (agentOutput.type === 'error') {
      if (typeof agentOutput.message === 'string') return agentOutput.message
      if (typeof agentOutput.value === 'string') return agentOutput.value
    }
    return null
  }
  // ============================================================================

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
    const fileListText = extractLastMessageText(result)
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

// handleSteps for max mode - spawns 2 file-listers in parallel
const handleStepsMax: SecretAgentDefinition['handleSteps'] = function* ({
  prompt,
  params,
}) {
  // ============================================================================
  // Helper functions duplicated inside generator for sandbox serialization.
  // DUPLICATE: Keep in sync with module-level versions.
  // ============================================================================
  function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object'
  }

  function extractSpawnResults(results: unknown[] | undefined): unknown[] {
    if (!results || results.length === 0) return []
    const jsonResult = results.find(
      (r): r is { type: 'json'; value: unknown } =>
        isObject(r) && r.type === 'json',
    )
    if (!jsonResult?.value) return []
    const spawnedResults = Array.isArray(jsonResult.value)
      ? jsonResult.value
      : [jsonResult.value]
    return spawnedResults
      .map((result: unknown) => {
        if (!isObject(result)) return undefined
        if ('value' in result && result.type !== 'lastMessage' && result.type !== 'error') {
          return result.value
        }
        return result
      })
      .filter(Boolean)
  }

  function extractLastMessageText(agentOutput: unknown): string | null {
    if (!isObject(agentOutput)) return null
    if (agentOutput.type !== 'lastMessage' || !Array.isArray(agentOutput.value)) {
      return null
    }
    for (let i = agentOutput.value.length - 1; i >= 0; i--) {
      const message = agentOutput.value[i]
      if (
        isObject(message) &&
        message.role === 'assistant' &&
        Array.isArray(message.content)
      ) {
        for (const part of message.content) {
          if (
            isObject(part) &&
            part.type === 'text' &&
            typeof part.text === 'string'
          ) {
            return part.text
          }
        }
      }
    }
    return null
  }

  function extractErrorMessage(agentOutput: unknown): string | null {
    if (!isObject(agentOutput)) return null
    if (agentOutput.type === 'error') {
      if (typeof agentOutput.message === 'string') return agentOutput.message
      if (typeof agentOutput.value === 'string') return agentOutput.value
    }
    return null
  }
  // ============================================================================

  const { toolResult: fileListerResults } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: [
        {
          agent_type: 'file-lister',
          prompt: prompt ?? '',
          params: params ?? {},
        },
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
    const fileListText = extractLastMessageText(result)
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

export default definition
