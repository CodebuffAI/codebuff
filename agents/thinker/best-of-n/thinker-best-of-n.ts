import { publisher } from '../../constants'

import type {
  AgentStepContext,
  StepText,
  ToolCall,
} from '../../types/agent-definition'
import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

export function createThinkerBestOfN(
  model: 'sonnet' | 'gpt-5' | 'opus',
): Omit<SecretAgentDefinition, 'id'> {
  const isGpt5 = model === 'gpt-5'
  const isOpus = model === 'opus'

  return {
    publisher,
    model: isGpt5
      ? 'openai/gpt-5.1'
      : isOpus
        ? 'anthropic/claude-opus-4.6'
        : 'anthropic/claude-sonnet-4.5',
    displayName: isGpt5
      ? 'Best-of-N GPT-5 Thinker'
      : isOpus
        ? 'Best-of-N Opus Thinker'
        : 'Best-of-N Thinker',
    spawnerPrompt:
      'Generates deep thinking by orchestrating multiple thinker agents, selects the best thinking output. Use this to help solve a hard problem. You must first gather all the relevant context *BEFORE* spawning this agent, as it can only think.',

    includeMessageHistory: true,
    inheritParentSystemPrompt: true,

    toolNames: ['spawn_agents'],
    spawnableAgents: [isOpus ? 'thinker-selector-opus' : 'thinker-selector'],

    inputSchema: {
      prompt: {
        type: 'string',
        description: 'The problem you are trying to solve, very briefly. No need to provide context, as the thinker agent can see the entire conversation history.',
      },
      params: {
        type: 'object',
        properties: {
          n: {
            type: 'number',
            description:
              'Number of parallel thinker agents to spawn. Defaults to 3. Use fewer for simple questions and max of 6 for complex questions.',
          },
        },
      },
    },
    outputMode: 'last_message',

    instructionsPrompt: `You are one subagent of the thinker-best-of-n agent that was spawned by the parent agent.

Instructions:
Use the <think> tag to think deeply about the user request.

When satisfied, write out a brief response to the user's request. The parent agent will see your response -- no need to call any tools. In particular, do not use the spawn_agents tool or the set_output tool or any tools at all! `,

    handleSteps: isOpus ? handleStepsOpus : handleStepsDefault,
  }
}
function* handleStepsDefault({
  agentState,
  prompt,
  params,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const selectorAgentType = 'thinker-selector'
  const n = Math.min(10, Math.max(1, (params?.n as number | undefined) ?? 3))

  // Use GENERATE_N to generate n thinking outputs
  const { nResponses = [] } = yield {
    type: 'GENERATE_N',
    n,
  }

  // Extract all the thinking outputs and strip <think> tags
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const thoughts = nResponses.map((content, index) => ({
    id: letters[index],
    content: content.replace(/<think>[\s\S]*?<\/think>/g, '').trim(),
  }))

  // Spawn selector with thoughts as params
  const { toolResult: selectorResult } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: [
        {
          agent_type: selectorAgentType,
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
      type: 'STEP_TEXT',
      text: selectorOutput.errorMessage,
    } satisfies StepText
    return
  }
  const { thoughtId } = selectorOutput
  const chosenThought = thoughts.find((thought) => thought.id === thoughtId)
  if (!chosenThought) {
    yield {
      type: 'STEP_TEXT',
      text: 'Failed to find chosen thinking output.',
    } satisfies StepText
    return
  }

  yield {
    type: 'STEP_TEXT',
    text: chosenThought.content,
  } satisfies StepText

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

function* handleStepsOpus({
  agentState,
  prompt,
  params,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const selectorAgentType = 'thinker-selector-opus'
  const n = Math.min(10, Math.max(1, (params?.n as number | undefined) ?? 3))

  // Use GENERATE_N to generate n thinking outputs
  const { nResponses = [] } = yield {
    type: 'GENERATE_N',
    n,
  }

  // Extract all the thinking outputs and strip <think> tags
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const thoughts = nResponses.map((content, index) => ({
    id: letters[index],
    content: content.replace(/<think>[\s\S]*?<\/think>/g, '').trim(),
  }))

  // Spawn selector with thoughts as params
  const { toolResult: selectorResult } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: [
        {
          agent_type: selectorAgentType,
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
      type: 'STEP_TEXT',
      text: selectorOutput.errorMessage,
    } satisfies StepText
    return
  }
  const { thoughtId } = selectorOutput
  const chosenThought = thoughts.find((thought) => thought.id === thoughtId)
  if (!chosenThought) {
    yield {
      type: 'STEP_TEXT',
      text: 'Failed to find chosen thinking output.',
    } satisfies StepText
    return
  }

  yield {
    type: 'STEP_TEXT',
    text: chosenThought.content,
  } satisfies StepText

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
