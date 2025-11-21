import { buildArray } from '@codebuff/common/util/array'

import { publisher } from '../../constants'

import type {
  AgentStepContext,
  StepText,
  ToolCall,
} from '../../types/agent-definition'
import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

export function createBestOfNEditor(
  model: 'default' | 'max',
): Omit<SecretAgentDefinition, 'id'> {
  const isDefault = model === 'default'
  const isMax = model === 'max'
  return {
    publisher,
    model: 'anthropic/claude-sonnet-4.5',
    displayName: isDefault ? 'Best-of-N Editor' : 'Best-of-N Max Editor',
    spawnerPrompt:
      'Edits code by orchestrating multiple implementor agents to generate implementation proposals, selects the best one, and applies the changes. Do not specify an input prompt for this agent; it inherits the context of the entire conversation with the user. Make sure to read any files intended to be edited before spawning this agent as it cannot read files on its own.',

    includeMessageHistory: true,
    inheritParentSystemPrompt: true,

    toolNames: [
      'spawn_agents',
      'str_replace',
      'write_file',
      'set_messages',
      'set_output',
    ],
    spawnableAgents: buildArray(
      'best-of-n-selector',
      'best-of-n-selector-gemini',
      'editor-implementor',
      'editor-implementor-gemini',
      isMax && 'editor-implementor-gpt-5',
    ),

    inputSchema: {
      params: {
        type: 'object',
        properties: {
          n: {
            type: 'number',
            description: `Number of parallel implementor agents to spawn. Defaults to ${isDefault ? 4 : 6}. Use fewer for simple tasks and max of 10 for complex tasks.`,
          },
        },
      },
    },
    outputMode: 'structured_output',

    handleSteps: isDefault ? handleStepsDefault : handleStepsMax,
  }
}
function* handleStepsDefault({
  params,
  logger,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const DEFAULT_N = 4
  const selectorAgent = 'best-of-n-selector'
  const n = Math.min(
    10,
    Math.max(1, (params?.n as number | undefined) ?? DEFAULT_N),
  )

  // Spawn implementor agents: 1 gemini + rest sonnet (if n >= 2)
  const implementorAgents = []
  if (n >= 2) {
    // Add 1 gemini implementor
    implementorAgents.push({
      agent_type: 'editor-implementor-gemini',
    })
    // Add (n-1) sonnet implementors
    for (let i = 1; i < n; i++) {
      implementorAgents.push({
        agent_type: 'editor-implementor',
      })
    }
  } else {
    // If n === 1, just spawn 1 sonnet implementor
    implementorAgents.push({
      agent_type: 'editor-implementor',
    })
  }

  // Spawn all implementor agents
  const { toolResult: implementorResults } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: implementorAgents,
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  // Extract spawn results
  const spawnedImplementations =
    extractSpawnResults<{ text: string }[]>(implementorResults)

  logger.info({ spawnedImplementations }, 'spawnedImplementations')

  // Extract all the plans from the structured outputs
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  // Parse implementations from spawn results
  const implementations = spawnedImplementations.map((result, index) => ({
    id: letters[index],
    content:
      'errorMessage' in result
        ? `Error: ${result.errorMessage}`
        : result[0].text,
  }))

  // Spawn selector with implementations as params
  const { toolResult: selectorResult } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: [
        {
          agent_type: selectorAgent,
          params: { implementations },
        },
      ],
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  const selectorOutput = extractSpawnResults<{
    implementationId: string
    reasoning: string
  }>(selectorResult)[0]

  if ('errorMessage' in selectorOutput) {
    yield {
      toolName: 'set_output',
      input: { error: selectorOutput.errorMessage },
    } satisfies ToolCall<'set_output'>
    return
  }
  const { implementationId } = selectorOutput
  const chosenImplementation = implementations.find(
    (implementation) => implementation.id === implementationId,
  )
  if (!chosenImplementation) {
    yield {
      toolName: 'set_output',
      input: { error: 'Failed to find chosen implementation.' },
    } satisfies ToolCall<'set_output'>
    return
  }

  // Apply the chosen implementation using STEP_TEXT (only tool calls, no commentary)
  const toolCallsOnly = extractToolCallsOnly(
    typeof chosenImplementation.content === 'string'
      ? chosenImplementation.content
      : '',
  )
  const { agentState: postEditsAgentState } = yield {
    type: 'STEP_TEXT',
    text: toolCallsOnly,
  } as StepText
  const { messageHistory } = postEditsAgentState
  const lastAssistantMessageIndex = messageHistory.findLastIndex(
    (message) => message.role === 'assistant',
  )
  const editToolResults = messageHistory
    .slice(lastAssistantMessageIndex)
    .filter((message) => message.role === 'tool')
    .flatMap((message) => message.content)
    .filter((output) => output.type === 'json')
    .map((output) => output.value)

  // Set output with the chosen implementation and reasoning
  yield {
    toolName: 'set_output',
    input: {
      response: chosenImplementation.content,
      toolResults: editToolResults,
    },
    includeToolCall: false,
  } satisfies ToolCall<'set_output'>

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

  // Extract only tool calls from text, removing any commentary
  function extractToolCallsOnly(text: string): string {
    const toolExtractionPattern =
      /<codebuff_tool_call>\n(.*?)\n<\/codebuff_tool_call>/gs
    const matches: string[] = []

    for (const match of text.matchAll(toolExtractionPattern)) {
      matches.push(match[0]) // Include the full tool call with tags
    }

    return matches.join('\n')
  }
}
function* handleStepsMax({
  params,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const MAX_N = 6
  const selectorAgent = 'best-of-n-selector-gemini'
  const n = Math.min(
    10,
    Math.max(1, (params?.n as number | undefined) ?? MAX_N),
  )

  // Spawn implementor agents: 1 gemini + rest sonnet (if n >= 2)
  const implementorAgents = []
  if (n >= 1) {
    implementorAgents.push({
      agent_type: 'editor-implementor',
    })
  }
  if (n >= 2) {
    // Add 1 gemini implementor
    implementorAgents.push({
      agent_type: 'editor-implementor-gemini',
    })
  }
  if (n >= 3) {
    implementorAgents.push({
      agent_type: 'editor-implementor-gpt-5',
    })
  }
  // Add remaining sonnet implementors
  for (let i = 3; i < n; i++) {
    implementorAgents.push({
      agent_type: 'editor-implementor',
    })
  }

  // Spawn all implementor agents
  const { toolResult: implementorResults } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: implementorAgents,
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  // Extract spawn results
  const spawnedImplementations =
    extractSpawnResults<{ text: string }[]>(implementorResults)

  // Extract all the plans from the structured outputs
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  // Parse implementations from spawn results
  const implementations = spawnedImplementations.map((result, index) => ({
    id: letters[index],
    content:
      'errorMessage' in result
        ? `Error: ${result.errorMessage}`
        : result[0].text,
  }))

  // Spawn selector with implementations as params
  const { toolResult: selectorResult } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: [
        {
          agent_type: selectorAgent,
          params: { implementations },
        },
      ],
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  const selectorOutput = extractSpawnResults<{
    implementationId: string
    reasoning: string
  }>(selectorResult)[0]

  if ('errorMessage' in selectorOutput) {
    yield {
      toolName: 'set_output',
      input: { error: selectorOutput.errorMessage },
    } satisfies ToolCall<'set_output'>
    return
  }
  const { implementationId } = selectorOutput
  const chosenImplementation = implementations.find(
    (implementation) => implementation.id === implementationId,
  )
  if (!chosenImplementation) {
    yield {
      toolName: 'set_output',
      input: { error: 'Failed to find chosen implementation.' },
    } satisfies ToolCall<'set_output'>
    return
  }

  // Apply the chosen implementation using STEP_TEXT (only tool calls, no commentary)
  const toolCallsOnly = extractToolCallsOnly(
    typeof chosenImplementation.content === 'string'
      ? chosenImplementation.content
      : '',
  )
  const { agentState: postEditsAgentState } = yield {
    type: 'STEP_TEXT',
    text: toolCallsOnly,
  } as StepText
  const { messageHistory } = postEditsAgentState
  const lastAssistantMessageIndex = messageHistory.findLastIndex(
    (message) => message.role === 'assistant',
  )
  const editToolResults = messageHistory
    .slice(lastAssistantMessageIndex)
    .filter((message) => message.role === 'tool')
    .flatMap((message) => message.content)
    .filter((output) => output.type === 'json')
    .map((output) => output.value)

  // Set output with the chosen implementation and reasoning
  yield {
    toolName: 'set_output',
    input: {
      response: chosenImplementation.content,
      toolResults: editToolResults,
    },
    includeToolCall: false,
  } satisfies ToolCall<'set_output'>

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

  // Extract only tool calls from text, removing any commentary
  function extractToolCallsOnly(text: string): string {
    const toolExtractionPattern =
      /<codebuff_tool_call>\n(.*?)\n<\/codebuff_tool_call>/gs
    const matches: string[] = []

    for (const match of text.matchAll(toolExtractionPattern)) {
      matches.push(match[0]) // Include the full tool call with tags
    }

    return matches.join('\n')
  }
}

const definition = {
  ...createBestOfNEditor('default'),
  id: 'editor-best-of-n',
}
export default definition
