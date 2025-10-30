import type { SecretAgentDefinition } from '../../types/secret-agent-definition'
import { publisher } from '../../constants'
import { ToolCall } from 'types/agent-definition'

const definition: SecretAgentDefinition = {
  id: 'base2-best-of-n-orchestrator',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Best-of-N Implementation Orchestrator',
  spawnerPrompt:
    'Orchestrates multiple implementor agents to generate implementation proposals and selects the best one',

  includeMessageHistory: true,
  inheritParentSystemPrompt: true,

  toolNames: ['spawn_agents', 'set_output'],
  spawnableAgents: [
    'base2-implementor',
    'base2-selector',
    'base2-best-of-n-editor',
  ],

  inputSchema: {},
  outputMode: 'structured_output',

  handleSteps: function* ({ agentState, logger }) {
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

    // Spawn 5 implementor agents in parallel
    const { toolResult: implementorsResult } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          { agent_type: 'base2-implementor' },
          { agent_type: 'base2-implementor' },
          { agent_type: 'base2-implementor' },
          { agent_type: 'base2-implementor' },
          { agent_type: 'base2-implementor' },
        ],
      },
    }

    // Extract all the plans from the structured outputs
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    // Parse implementations from tool results
    const implementations = (implementorsResult ?? [])
      .filter((result) => result.type === 'json')
      .map(
        (result) =>
          (result as any).value as { agentType: string; value: string }[],
      )
      .flatMap((results) =>
        results.map((result, index) => ({
          id: letters[index],
          content: JSON.stringify((result.value as any).value),
        })),
      )

    // Spawn selector with implementations as params
    const { toolResult: selectorResult } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'base2-selector',
            params: { implementations },
          },
        ],
      },
    } satisfies ToolCall<'spawn_agents'>

    // Extract chosen implementation from selector output
    const selectorOutput =
      (selectorResult ?? [])
        .filter((result) => result.type === 'json')
        .map(
          (result) =>
            result.value as {
              value: { value: { implementationId: string; reasoning: string } }
            }[],
        )[0][0] || {}

    const chosenImplementationId = selectorOutput.value.value.implementationId
    const chosenImplementation = implementations.find(
      (implementation) => implementation.id === chosenImplementationId,
    )
    if (!chosenImplementation) {
      yield {
        toolName: 'set_output',
        input: { error: 'Failed to choose an implementation.' },
      } satisfies ToolCall<'set_output'>
      return
    }

    // Spawn editor to apply the chosen implementation
    const { toolResult: editorResults } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'base2-best-of-n-editor',
            prompt: chosenImplementation.content,
          },
        ],
      },
    }

    const spawnedEditorResult = (editorResults ?? [])
      .filter((result) => result.type === 'json')
      .map((result) => result.value)
      .flat()[0] as {
      agentType: string
      value: { value: { response: string; toolResults: any[] } }
    }
    const { response, toolResults } = spawnedEditorResult.value.value

    // Set output with the chosen implementation and reasoning
    yield {
      toolName: 'set_output',
      input: {
        response,
        toolResults,
      },
    } satisfies ToolCall<'set_output'>
  },
}

export default definition
