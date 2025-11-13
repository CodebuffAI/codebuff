import { publisher } from '../constants'

import type { AgentStepContext, ToolCall } from '../types/agent-definition'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

export function createCodeReviewerBestOfN(
  model: 'sonnet' | 'gpt-5',
): Omit<SecretAgentDefinition, 'id'> {
  const isGpt5 = model === 'gpt-5'

  return {
    publisher,
    model: isGpt5 ? 'openai/gpt-5' : 'anthropic/claude-sonnet-4.5',
    displayName: isGpt5
      ? 'Best-of-N GPT-5 Code Reviewer'
      : 'Best-of-N Fast Code Reviewer',
    spawnerPrompt:
      'Reviews code by orchestrating multiple reviewer agents to generate review proposals, selects the best one, and provides the final review. Do not specify an input prompt for this agent; it reads the context from the message history.',

    includeMessageHistory: true,
    inheritParentSystemPrompt: true,

    toolNames: ['spawn_agents', 'set_messages', 'set_output'],
    spawnableAgents: isGpt5
      ? ['code-reviewer-implementor-gpt-5', 'code-reviewer-selector-gpt-5']
      : ['code-reviewer-implementor', 'code-reviewer-selector'],

    inputSchema: {
      params: {
        type: 'object',
        properties: {
          n: {
            type: 'number',
            description:
              'Number of parallel reviewer agents to spawn. Defaults to 5. Use fewer for simple reviews and max of 10 for complex reviews.',
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
  const implementorAgent = 'code-reviewer-implementor'
  const selectorAgent = 'code-reviewer-selector'
  const n = Math.min(10, Math.max(1, (params?.n as number | undefined) ?? 5))

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

  // Extract all the reviews from the structured outputs
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  // Parse reviews from tool results
  const reviews = implementorsResult.map((content, index) => ({
    id: letters[index],
    content,
  }))

  // Spawn selector with reviews as params
  const { toolResult: selectorResult } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: [
        {
          agent_type: selectorAgent,
          params: { reviews },
        },
      ],
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  const selectorOutput = extractSpawnResults<{
    reviewId: string
    reasoning: string
  }>(selectorResult)[0]

  if ('errorMessage' in selectorOutput) {
    yield {
      toolName: 'set_output',
      input: { error: selectorOutput.errorMessage },
    } satisfies ToolCall<'set_output'>
    return
  }
  const { reviewId } = selectorOutput
  const chosenReview = reviews.find((review) => review.id === reviewId)
  if (!chosenReview) {
    yield {
      toolName: 'set_output',
      input: { error: 'Failed to find chosen review.' },
    } satisfies ToolCall<'set_output'>
    return
  }

  // Set output with the chosen review and reasoning
  yield {
    toolName: 'set_output',
    input: {
      response: chosenReview.content,
      reasoning: selectorOutput.reasoning,
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
}

function* handleStepsGpt5({
  agentState,
  params,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const implementorAgent = 'code-reviewer-implementor-gpt-5'
  const selectorAgent = 'code-reviewer-selector-gpt-5'
  const n = Math.min(10, Math.max(1, (params?.n as number | undefined) ?? 5))

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

  // Extract all the reviews from the structured outputs
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  // Parse reviews from tool results
  const reviews = implementorsResult.map((content, index) => ({
    id: letters[index],
    content,
  }))

  // Spawn selector with reviews as params
  const { toolResult: selectorResult } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: [
        {
          agent_type: selectorAgent,
          params: { reviews },
        },
      ],
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  const selectorOutput = extractSpawnResults<{
    reviewId: string
    reasoning: string
  }>(selectorResult)[0]

  if ('errorMessage' in selectorOutput) {
    yield {
      toolName: 'set_output',
      input: { error: selectorOutput.errorMessage },
    } satisfies ToolCall<'set_output'>
    return
  }
  const { reviewId } = selectorOutput
  const chosenReview = reviews.find((review) => review.id === reviewId)
  if (!chosenReview) {
    yield {
      toolName: 'set_output',
      input: { error: 'Failed to find chosen review.' },
    } satisfies ToolCall<'set_output'>
    return
  }

  // Set output with the chosen review and reasoning
  yield {
    toolName: 'set_output',
    input: {
      response: chosenReview.content,
      reasoning: selectorOutput.reasoning,
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
}

const definition = {
  ...createCodeReviewerBestOfN('sonnet'),
  id: 'code-reviewer-best-of-n',
}
export default definition
