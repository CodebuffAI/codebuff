import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { AgentStepContext, ToolCall } from '../types/agent-definition'

export function createThinkerBestOfN(
  model: 'sonnet' | 'gpt-5',
): Omit<SecretAgentDefinition, 'id'> {
  const isGpt5 = model === 'gpt-5'

  return {
    publisher,
    model: isGpt5 ? 'openai/gpt-5' : 'anthropic/claude-sonnet-4.5',
    displayName: isGpt5 ? 'Best-of-N GPT-5 Thinker' : 'Best-of-N Thinker',
    spawnerPrompt:
      'Generates deep thinking by orchestrating multiple thinker agents, selects the best thinking output. Use this to help solve a hard problem. You must first gather all the relevant context *BEFORE* spawning this agent, as it can only think.',

    includeMessageHistory: true,
    inheritParentSystemPrompt: true,

    toolNames: ['spawn_agents', 'set_messages', 'set_output'],
    spawnableAgents: isGpt5
      ? ['thinker-gpt-5', 'thinker-selector-gpt-5']
      : ['thinker', 'thinker-selector'],

    inputSchema: {
      prompt: {
        type: 'string',
        description: 'The problem you are trying to solve',
      },
      params: {
        type: 'object',
        properties: {
          n: {
            type: 'number',
            description:
              'Number of parallel thinker agents to spawn. Defaults to 5. Use fewer for simple questions and max of 10 for complex questions.',
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
  prompt,
  params,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const thinkerAgent = 'thinker'
  const selectorAgent = 'thinker-selector'
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

  const { toolResult: thinkersResult1 } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: Array.from({ length: n }, () => ({
        agent_type: thinkerAgent,
        prompt,
      })),
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  const thinkersResult = extractSpawnResults<string>(thinkersResult1)

  // Extract all the thinking outputs
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const thoughts = thinkersResult.map((content, index) => ({
    id: letters[index],
    content,
  }))

  // Spawn selector with thoughts as params
  const { toolResult: selectorResult } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: [
        {
          agent_type: selectorAgent,
          params: { thoughts },
        },
      ],
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  const selectorOutput = extractSpawnResults<{
    thoughtId: string
  }>(selectorResult)[0]

  if ('errorMessage' in selectorOutput) {
    yield {
      toolName: 'set_output',
      input: { error: selectorOutput.errorMessage },
    } satisfies ToolCall<'set_output'>
    return
  }
  const { thoughtId } = selectorOutput
  const chosenThought = thoughts.find((thought) => thought.id === thoughtId)
  if (!chosenThought) {
    yield {
      toolName: 'set_output',
      input: { error: 'Failed to find chosen thinking output.' },
    } satisfies ToolCall<'set_output'>
    return
  }

  // Set output with the chosen thinking
  yield {
    toolName: 'set_output',
    input: {
      response: chosenThought.content,
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
        result.value.value ??
        ({
          errorMessage:
            result.value.errorMessage ?? 'Error extracting spawn results',
        } as { errorMessage: string }),
    )
  }
}

function* handleStepsGpt5({
  agentState,
  prompt,
  params,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const thinkerAgent = 'thinker-gpt-5'
  const selectorAgent = 'thinker-selector-gpt-5'
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

  const { toolResult: thinkersResult1 } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: Array.from({ length: n }, () => ({
        agent_type: thinkerAgent,
        prompt,
      })),
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  const thinkersResult = extractSpawnResults<string>(thinkersResult1)

  // Extract all the thinking outputs
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const thoughts = thinkersResult.map((content, index) => ({
    id: letters[index],
    content,
  }))

  // Spawn selector with thoughts as params
  const { toolResult: selectorResult } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: [
        {
          agent_type: selectorAgent,
          params: { thoughts },
        },
      ],
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  const selectorOutput = extractSpawnResults<{
    thoughtId: string
  }>(selectorResult)[0]

  if ('errorMessage' in selectorOutput) {
    yield {
      toolName: 'set_output',
      input: { error: selectorOutput.errorMessage },
    } satisfies ToolCall<'set_output'>
    return
  }
  const { thoughtId } = selectorOutput
  const chosenThought = thoughts.find((thought) => thought.id === thoughtId)
  if (!chosenThought) {
    yield {
      toolName: 'set_output',
      input: { error: 'Failed to find chosen thinking output.' },
    } satisfies ToolCall<'set_output'>
    return
  }

  // Set output with the chosen thinking
  yield {
    toolName: 'set_output',
    input: {
      response: chosenThought.content,
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
        result.value.value ??
        ({
          errorMessage:
            result.value.errorMessage ?? 'Error extracting spawn results',
        } as { errorMessage: string }),
    )
  }
}

const definition: SecretAgentDefinition = {
  ...createThinkerBestOfN('sonnet'),
  id: 'thinker-best-of-n',
}

export default definition
