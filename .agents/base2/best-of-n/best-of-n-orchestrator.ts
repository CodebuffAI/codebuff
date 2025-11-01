import type { SecretAgentDefinition } from '../../types/secret-agent-definition'
import { publisher } from '../../constants'
import { StepText, ToolCall } from 'types/agent-definition'

const definition: SecretAgentDefinition = {
  id: 'best-of-n-orchestrator',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Best-of-N Implementation Orchestrator',
  spawnerPrompt:
    'Orchestrates multiple implementor agents to generate implementation proposals, selects the best one, and applies the changes. Has no input prompt! It reads the context from the message history.',

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
    'best-of-n-implementor',
    'best-of-n-implementor-gpt-5',
    'best-of-n-selector-gpt-5',
  ],

  inputSchema: {},
  outputMode: 'structured_output',

  handleSteps: function* ({ agentState }) {
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

    // Spawn 1 of each model for easy prompt caching
    const { toolResult: implementorsResult1 } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          { agent_type: 'best-of-n-implementor' },
          { agent_type: 'best-of-n-implementor-gpt-5' },
        ],
      },
      includeToolCall: false,
    }
    // Spawn 3 more of each model in parallel
    const { toolResult: implementorsResult2 } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          { agent_type: 'best-of-n-implementor' },
          { agent_type: 'best-of-n-implementor' },
          { agent_type: 'best-of-n-implementor' },
          { agent_type: 'best-of-n-implementor-gpt-5' },
          { agent_type: 'best-of-n-implementor-gpt-5' },
          { agent_type: 'best-of-n-implementor-gpt-5' },
        ],
      },
      includeToolCall: false,
    }

    const implementorsResult = [
      ...extractSpawnResults<string>(implementorsResult1),
      ...extractSpawnResults<string>(implementorsResult2),
    ]

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
            agent_type: 'best-of-n-selector-gpt-5',
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
  },
}

export default definition
