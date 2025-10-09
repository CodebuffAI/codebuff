import { publisher } from '../constants'
import { type SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'two-wave-planner',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Two Wave Planner',
  spawnerPrompt:
    'Plans how to implement a list of requirements for a user request across two waves for deep refinement.',
  inputSchema: {
    params: {
      type: 'object',
      properties: {
        requirements: {
          type: 'array',
          items: { type: 'string' },
          description: 'A list of explicit requirements to plan for, in the order they should be implemented',
        },
      },
      required: ['requirements'],
    },
  },
  outputMode: 'structured_output',
  toolNames: ['spawn_agents', 'set_output'],
  spawnableAgents: ['implementation-planner'],

  includeMessageHistory: true,
  inheritParentSystemPrompt: true,

  handleSteps: function* ({ params }) {
    const requirements: string[] = params?.requirements ?? []

    yield {
      toolName: 'spawn_agents',
      input: {
        agents: requirements.map((requirement) => ({
          agent_type: 'implementation-planner',
          prompt: `Research and give insights and proposals for this requirement: ${requirement}`,
        })),
      },
    }

    const { toolResult: planResults } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: requirements.map((requirement, idx) => ({
          agent_type: 'implementation-planner',
          prompt: `Create a new plan for the following requirement: <requirement>${requirement}</requirement>

You can see the previous plans for the list of requirements in the message history above, including the previous plan for this requirement. Review them to:
- Simplify your plan based on the broader context
- Identify overlaps or conflicts with other plans
- Find opportunities for code reuse across requirements
- Ensure your plan integrates well with other requirements
- Make your plan as concise as possible! A good plan is short and sweet.`,
        })),
      },
    }

    const plans = planResults
      ? planResults.map((result) =>
          result.type === 'json' ? result.value : '',
        )
      : []

    yield {
      toolName: 'set_output',
      input: {
        plans,
      },
    }
  },
}

export default definition
