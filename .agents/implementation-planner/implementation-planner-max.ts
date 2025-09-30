import { publisher } from '../constants'
import { type SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'implementation-planner-max',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Implementation Planner Max',
  spawnerPrompt:
    'Creates the best possible implementation plan by generating several different plans in parallel and selecting the best one. Includes full code changes.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The task to plan for. Include the requirements and expected behavior after implementing the plan. Include quotes from the user of what they expect the plan to accomplish.',
    },
  },
  outputMode: 'structured_output',
  includeMessageHistory: true,
  toolNames: ['spawn_agents', 'set_output'],
  spawnableAgents: ['implementation-planner', 'plan-selector'],
  handleSteps: function* ({ prompt }) {
    // Step 1: Spawn several planners in parallel.
    const agents = Array.from({ length: 5 }, () => ({
      agent_type: 'implementation-planner',
      prompt,
    }))
    const { toolResult: plannerResults } = yield {
      toolName: 'spawn_agents',
      input: {
        agents,
      },
    }

    if (!Array.isArray(plannerResults)) {
      yield {
        toolName: 'set_output',
        input: { error: 'Failed to generate plans.' },
      }
      return
    }
    const plannerResult = plannerResults[0]
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const plans =
      plannerResult.type === 'json' ? (plannerResult.value as any[]) : []
    const plansWithIds = plans.map((plan, index) => ({
      id: letters[index],
      plan: JSON.stringify(plan),
    }))

    // Step 2: Spawn plan selector to choose the best plan
    const { toolResult: selectedPlanResult } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'plan-selector',
            prompt: `Choose the best plan from these options for the task: ${prompt}`,
            params: {
              plans: plansWithIds,
            },
          },
        ],
      },
    }

    if (!Array.isArray(selectedPlanResult) || selectedPlanResult.length < 1) {
      yield {
        toolName: 'set_output',
        input: { error: 'Failed to select a plan.' },
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
        plan: selectedPlanWithId?.plan ?? plans[0],
      },
    }
  },
}

export default definition
