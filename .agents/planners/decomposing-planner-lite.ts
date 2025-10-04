import { type SecretAgentDefinition } from '../types/secret-agent-definition'
import decomposingPlanner from './decomposing-planner'

const definition: SecretAgentDefinition = {
  ...decomposingPlanner,
  id: 'decomposing-planner-lite',
  displayName: 'Decomposing Planner Lite',
  model: 'anthropic/claude-sonnet-4.5',
  spawnerPrompt:
    'Creates a better implementation plan by decomposing the task into smaller plans in parallel and synthesizing them into a final plan. Includes full code changes.',
  spawnableAgents: ['file-explorer', 'implementation-planner-lite'],
  includeMessageHistory: false,
}

export default definition
