import { publisher } from '../../constants'

import type {
  AgentStepContext,
  StepText,
  ToolCall,
} from '../../types/agent-definition'
import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

/**
 * Creates a multi-prompt editor agent that spawns one implementor per prompt.
 * Each prompt specifies a slightly different implementation strategy/approach.
 */
export function createMultiPromptEditor(): Omit<SecretAgentDefinition, 'id'> {
  return {
    publisher,
    model: 'anthropic/claude-opus-4.5',
    displayName: 'Multi-Prompt Editor',
    spawnerPrompt:
      'Edits code by spawning multiple implementor agents with different strategy prompts, selects the best implementation, and applies the changes. Pass an array of short prompts specifying different implementation approaches. Make sure to read any files intended to be edited before spawning this agent.',

    includeMessageHistory: true,
    inheritParentSystemPrompt: true,

    toolNames: [
      'spawn_agents',
      'str_replace',
      'write_file',
      'set_messages',
      'set_output',
    ],
    spawnableAgents: [
      'best-of-n-selector-opus',
      'editor-implementor-opus',
      'editor-implementor-gpt-5',
    ],

    inputSchema: {
      params: {
        type: 'object',
        properties: {
          prompts: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Array of short prompts, each specifying a slightly different implementation strategy or approach. Example: ["use a cache for the data", "don\t cache anything", "make the minimal possible changes", "modularize your solution by creating new files"]',
          },
        },
        required: ['prompts'],
      },
    },
    outputMode: 'structured_output',

    handleSteps: handleStepsMultiPrompt,
  }
}

function* handleStepsMultiPrompt({
  agentState,
  params,
  logger,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const prompts = (params?.prompts as string[] | undefined) ?? []

  if (prompts.length === 0) {
    yield {
      toolName: 'set_output',
      input: {
        error: 'No prompts provided. Please pass an array of strategy prompts.',
      },
    } satisfies ToolCall<'set_output'>
    return
  }

  // Only keep messages up to just before the last user role message (skips input prompt, instructions prompt).
  const { messageHistory: initialMessageHistory } = agentState
  let userMessageIndex = initialMessageHistory.length

  while (userMessageIndex > 0) {
    const message = initialMessageHistory[userMessageIndex - 1]
    if (message.role === 'user') {
      userMessageIndex--
    } else {
      break
    }
  }
  const updatedMessageHistory = initialMessageHistory.slice(0, userMessageIndex)
  yield {
    toolName: 'set_messages',
    input: {
      messages: updatedMessageHistory,
    },
    includeToolCall: false,
  } satisfies ToolCall<'set_messages'>

  // Spawn one opus implementor per prompt
  const implementorAgents: { agent_type: string; prompt?: string }[] =
    prompts.map((prompt) => ({
      agent_type: 'editor-implementor-opus',
      prompt: `Strategy: ${prompt}`,
    }))

  // Spawn all implementor agents
  const { toolResult: implementorResults } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: implementorAgents,
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  // Extract spawn results
  const spawnedImplementations = extractSpawnResults(
    implementorResults,
  ) as any[]

  // Extract all the implementations from the results
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const strategies = [...prompts, prompts[0]]
  const implementations = spawnedImplementations.map((result, index) => ({
    id: letters[index],
    strategy: strategies[index],
    content:
      'errorMessage' in result
        ? `Error: ${result.errorMessage}`
        : extractLastMessageText(result) ?? '',
  }))

  // Spawn selector with implementations as params
  const { toolResult: selectorResult, agentState: selectorAgentState } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: [
        {
          agent_type: 'best-of-n-selector-opus',
          params: { implementations },
        },
      ],
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  const selectorOutput = extractSpawnResults<{
    value: {
      implementationId: string
      reasoning: string
    }
  }>(selectorResult)[0]

  if ('errorMessage' in selectorOutput) {
    yield {
      toolName: 'set_output',
      input: { error: selectorOutput.errorMessage },
    } satisfies ToolCall<'set_output'>
    return
  }
  const { implementationId } = selectorOutput.value
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

  const numMessagesBeforeStepText = selectorAgentState.messageHistory.length

  const { agentState: postEditsAgentState } = yield {
    type: 'STEP_TEXT',
    text: chosenImplementation.content,
  } as StepText
  const { messageHistory } = postEditsAgentState

  // Set output with the messages from running the step text of the chosen implementation
  yield {
    toolName: 'set_output',
    input: {
      chosenStrategy: chosenImplementation.strategy,
      messages: messageHistory.slice(numMessagesBeforeStepText),
    },
    includeToolCall: false,
  } satisfies ToolCall<'set_output'>

  /**
   * Extracts the array of subagent results from spawn_agents tool output.
   */
  function extractSpawnResults<T>(results: any[] | undefined): T[] {
    if (!results || results.length === 0) return []

    const jsonResult = results.find((r) => r.type === 'json')
    if (!jsonResult?.value) return []

    const spawnedResults = Array.isArray(jsonResult.value)
      ? jsonResult.value
      : [jsonResult.value]

    return spawnedResults.map((result: any) => result?.value).filter(Boolean)
  }

  /**
   * Extracts the text content from a 'lastMessage' AgentOutput.
   */
  function extractLastMessageText(agentOutput: any): string | null {
    if (!agentOutput) return null

    if (
      agentOutput.type === 'lastMessage' &&
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
    return null
  }
}

const definition = {
  ...createMultiPromptEditor(),
  id: 'editor-multi-prompt',
}
export default definition
