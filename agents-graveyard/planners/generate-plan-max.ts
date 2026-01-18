import { publisher } from '../../agents/constants'
import { type SecretAgentDefinition } from '../../agents/types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'generate-plan-max',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Maximum Plan Generator',
  spawnerPrompt:
    'Generates 5 independent planning iterations, then selects the absolute best plan from all variations.',
  inputSchema: {},
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      plan: {
        type: 'string',
        description: 'The best plan selected from all variations',
      },
    },
    required: ['plan'],
  },
  toolNames: ['spawn_agents', 'set_output'],
  spawnableAgents: ['generate-plan', 'plan-selector'],

  includeMessageHistory: true,
  inheritParentSystemPrompt: true,

  handleSteps: function* ({ logger }) {
    // Step 1: Spawn 5 generate-plan agents in parallel
    const { toolResult: planResults } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: Array.from({ length: 5 }, () => ({
          agent_type: 'generate-plan',
        })),
      },
    }

    if (!Array.isArray(planResults)) {
      yield {
        toolName: 'set_output',
        input: { plan: 'Failed to generate plans.' },
      }
      return
    }

    const plannerResult = planResults[0]
    const plans =
      plannerResult.type === 'json'
        ? (plannerResult.value as { plan?: string }[])
        : []

    logger.info({ plans }, 'plans')

    // Extract all the plans from the structured outputs
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const plansWithIds = plans.map((plan, idx) => {
      return {
        id: letters[idx],
        plan: JSON.stringify(plan),
      }
    })

    logger.info({ plansWithIds }, 'plansWithIds')

    if (plansWithIds.length === 0) {
      yield {
        toolName: 'set_output',
        input: { plan: 'No valid plans were generated.' },
      }
      return
    }

    // Step 2: Spawn plan-selector to choose the best plan
    const { toolResult: selectedPlanResult } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'plan-selector',
            prompt: 'Choose the best plan from these options',
            params: {
              plans: plansWithIds,
            },
          },
        ],
      },
    }

    logger.info({ selectedPlanResult }, 'selectedPlanResult')

    if (!Array.isArray(selectedPlanResult) || selectedPlanResult.length < 1) {
      yield {
        toolName: 'set_output',
        input: { plan: 'Failed to select a plan.' },
      }
      return
    }

    const selectedPlan = selectedPlanResult[0]
    const selectedPlanId =
      selectedPlan.type === 'json' && selectedPlan.value
        ? (selectedPlan.value as { selectedPlanId: string }).selectedPlanId
        : null

    const selectedPlanWithId = plansWithIds.find(
      (plan) => plan.id === selectedPlanId,
    )

    // Step 3: Set the selected plan as output
    yield {
      toolName: 'set_output',
      input: {
        plan: selectedPlanWithId?.plan ?? plansWithIds[0].plan,
      },
    }
  },
}

export default definition
