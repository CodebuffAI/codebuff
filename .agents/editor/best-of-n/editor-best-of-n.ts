import { publisher } from '../../constants'

import type { SecretAgentDefinition } from '../../types/secret-agent-definition'
import type {
  AgentStepContext,
  StepText,
  ToolCall,
} from '../../types/agent-definition'

export function createBestOfNEditor(
  model: 'sonnet' | 'gpt-5',
): Omit<SecretAgentDefinition, 'id'> {
  const isGpt5 = model === 'gpt-5'

  return {
    publisher,
    model: isGpt5 ? 'openai/gpt-5.1' : 'anthropic/claude-sonnet-4.5',
    displayName: isGpt5 ? 'Best-of-N GPT-5 Editor' : 'Best-of-N Editor',
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
    spawnableAgents: isGpt5
      ? ['best-of-n-selector-gpt-5']
      : ['best-of-n-selector'],

    inputSchema: {
      params: {
        type: 'object',
        properties: {
          n: {
            type: 'number',
            description:
              'Number of parallel implementor agents to spawn. Defaults to 5. Use fewer for simple tasks and max of 10 for complex tasks.',
          },
        },
      },
    },
    outputMode: 'structured_output',

    instructionsPrompt: `You are one agent within the editor-best-of-n. You were spawned to generate an implementation for the user's request.
    
Your task is to write out ALL the code changes needed to complete the user's request in a single comprehensive response.

Important: You can not make any other tool calls besides editing files. You cannot read more files, write todos, or spawn agents.

Write out what changes you would make using str_replace and/or write_file tool calls.

${
  isGpt5
    ? ``
    : `
You can also use <think> tags interspersed between tool calls to think about the best way to implement the changes. Keep these thoughts very brief. You may not need to use think tags at all.

<example>

<think>
[ Thoughts about the best way to implement the feature ]
</think>

<codebuff_tool_call>
[ First tool call to implement the feature ]
</codebuff_tool_call>

<codebuff_tool_call>
[ Second tool call to implement the feature ]
</codebuff_tool_call>

<think>
[ Thoughts about a tricky part of the implementation ]
</think>

<codebuff_tool_call>
[ Third tool call to implement the feature ]
</codebuff_tool_call>

</example>`
}

Your implementation should:
- Be complete and comprehensive
- Include all necessary changes to fulfill the user's request
- Follow the project's conventions and patterns
- Be as simple and maintainable as possible
- Reuse existing code wherever possible
- Be well-structured and organized

More style notes:
- Try/catch blocks clutter the code -- use them sparingly.
- Optional arguments are code smell and worse than required arguments.
- New components often should be added to a new file, not added to an existing file.

Write out your complete implementation now as a series of file editing tool calls.`,

    handleSteps: isGpt5 ? handleStepsGpt5 : handleStepsSonnet,
  }
}

function* handleStepsSonnet({
  params,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const selectorAgent = 'best-of-n-selector'
  const n = Math.min(10, Math.max(1, (params?.n as number | undefined) ?? 5))

  // Use GENERATE_N to generate n implementations
  const { nResponses = [] } = yield {
    type: 'GENERATE_N',
    n,
  }

  // Extract all the plans from the structured outputs
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  // Parse implementations from tool results
  const implementations = nResponses.map((content, index) => ({
    id: letters[index],
    content,
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
    .flatMap((message) => message.content.output)
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

function* handleStepsGpt5({
  params,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const selectorAgent = 'best-of-n-selector-gpt-5'
  const n = Math.min(10, Math.max(1, (params?.n as number | undefined) ?? 5))

  // Use GENERATE_N to generate n implementations
  const { nResponses = [] } = yield {
    type: 'GENERATE_N',
    n,
  }

  // Extract all the plans from the structured outputs
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  // Parse implementations from tool results
  const implementations = nResponses.map((content, index) => ({
    id: letters[index],
    content,
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
    .flatMap((message) => message.content.output)
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
  ...createBestOfNEditor('sonnet'),
  id: 'editor-best-of-n',
}
export default definition
