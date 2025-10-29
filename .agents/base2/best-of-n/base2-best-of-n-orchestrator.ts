import type { SecretAgentDefinition } from '../../types/secret-agent-definition'
import { publisher } from '../../constants'

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

  handleSteps: function* ({ logger }) {
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
    }

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
      }
      return
    }

    // Spawn editor to apply the chosen implementation
    yield {
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

    // Set output with the chosen implementation and reasoning
    yield {
      toolName: 'set_output',
      input: {
        implementation: chosenImplementation.content,
      },
    }
  },
}

export default definition
