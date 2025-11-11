import { createBase2 } from '../base2'
import type { SecretAgentDefinition } from '../../types/secret-agent-definition'
import { ToolCall } from '../../types/agent-definition'

const base2 = createBase2('default')
const definition: SecretAgentDefinition = {
  ...base2,
  id: 'base2-alloy2',
  spawnableAgents: [
    ...(base2.spawnableAgents ?? []),
    'base2-plan-step',
    'base2-plan-step-gpt-5',
  ],
  stepPrompt: `${base2.stepPrompt}

## Spawned planner agents have generated potential next steps

Two hypothetical next steps have been generated from planner agents (base2-plan-step and base2-plan-step-gpt-5). Use them as inspiration to write out your own next step. Feel free to take the best parts of each step or ignore them, but know that none of what they wrote out has taken any effect, and it's up to you to write out the actual next step that the user will see.`,

  handleSteps: function* ({ params, logger }) {
    while (true) {
      // Run context-pruner before each step
      yield {
        toolName: 'spawn_agent_inline',
        input: {
          agent_type: 'context-pruner',
          params: params ?? {},
        },
        includeToolCall: false,
      } as any

      yield {
        toolName: 'spawn_agents',
        input: {
          agents: [
            {
              agent_type: 'base2-plan-step',
            },
            {
              agent_type: 'base2-plan-step-gpt-5',
            },
          ],
        },
      }

      const { stepsComplete, agentState } = yield 'STEP'

      // Remove the spawn & spawn result for the base2-plan-step agents
      const spawnResultIndex = agentState.messageHistory.findLastIndex(
        (m) =>
          m.role === 'tool' &&
          m.content.toolName === 'spawn_agents' &&
          m.content.output[0].type === 'json' &&
          (m.content.output[0].value as any[])[0]?.agentType ===
            'base2-plan-step',
      )

      const updatedMessageHistory = agentState.messageHistory.concat()
      updatedMessageHistory.splice(spawnResultIndex - 1, 2)

      yield {
        toolName: 'set_messages',
        input: {
          messages: updatedMessageHistory,
        },
        includeToolCall: false,
      } satisfies ToolCall<'set_messages'>

      if (stepsComplete) break
    }
  },
}

export default definition
