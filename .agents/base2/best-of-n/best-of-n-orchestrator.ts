import { publisher } from '../../constants'

import type { SecretAgentDefinition } from '../../types/secret-agent-definition'
import type {
  AgentStepContext,
  StepText,
  ToolCall,
} from 'types/agent-definition'

export function createBestOfNOrchestrator(
  model: 'sonnet' | 'gpt-5',
): Omit<SecretAgentDefinition, 'id'> {
  const isGpt5 = model === 'gpt-5'

  return {
    publisher,
    model: isGpt5 ? 'openai/gpt-5' : 'anthropic/claude-sonnet-4.5',
    displayName: isGpt5
      ? 'Best-of-N GPT-5 Implementation Orchestrator'
      : 'Best-of-N Fast Implementation Orchestrator',
    spawnerPrompt:
      'Orchestrates multiple implementor agents to generate implementation proposals, selects the best one, and applies the changes. Do not specify an input prompt for this agent; it reads the context from the message history.',

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
      ? ['best-of-n-implementor-gpt-5', 'best-of-n-selector-gpt-5']
      : ['best-of-n-implementor', 'best-of-n-selector'],

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

    handleSteps: isGpt5 ? handleStepsGpt5 : handleStepsSonnet,
  }
}

function* handleStepsSonnet({
  agentState,
  params,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const implementorAgent = 'best-of-n-implementor'
  const selectorAgent = 'best-of-n-selector'
  const n = Math.min(
    10,
    Math.max(1, (params?.n as number | undefined) ?? 5),
  )

  // Remove userInstruction message for this agent.
  const messages = agentState.messageHistory.concat()
  messages.pop()
  yield {
    toolName: 'set_messages',
    input: {
      messages,
    },
    includeToolCall: false,
  } satisfies ToolCall<'set_messages'>

  const { toolResult: implementorsResult1 } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: Array.from({ length: n }, () => ({
        agent_type: implementorAgent,
      })),
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  const implementorsResult = extractSpawnResults<string>(implementorsResult1)

  // Extract all the plans from the structured outputs
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  // Parse implementations from tool results
  const implementations = implementorsResult.map((content, index) => ({
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

  // Apply the chosen implementation using STEP_TEXT
  const { agentState: postEditsAgentState } = yield {
    type: 'STEP_TEXT',
    text: chosenImplementation.content,
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
}

function* handleStepsGpt5({
  agentState,
  params,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const implementorAgent = 'best-of-n-implementor-gpt-5'
  const selectorAgent = 'best-of-n-selector-gpt-5'
  const n = Math.min(
    10,
    Math.max(1, (params?.n as number | undefined) ?? 5),
  )

  // Remove userInstruction message for this agent.
  const messages = agentState.messageHistory.concat()
  messages.pop()
  yield {
    toolName: 'set_messages',
    input: {
      messages,
    },
    includeToolCall: false,
  } satisfies ToolCall<'set_messages'>

  const { toolResult: implementorsResult1 } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: Array.from({ length: n }, () => ({
        agent_type: implementorAgent,
      })),
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  const implementorsResult = extractSpawnResults<string>(implementorsResult1)

  // Extract all the plans from the structured outputs
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  // Parse implementations from tool results
  const implementations = implementorsResult.map((content, index) => ({
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

  // Apply the chosen implementation using STEP_TEXT
  const { agentState: postEditsAgentState } = yield {
    type: 'STEP_TEXT',
    text: chosenImplementation.content,
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
}

const definition = {
  ...createBestOfNOrchestrator('sonnet'),
  id: 'best-of-n-orchestrator',
}
export default definition
