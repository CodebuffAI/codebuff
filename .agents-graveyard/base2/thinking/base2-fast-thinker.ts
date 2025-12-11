import { createBase2 } from '../../../.agents/base2/base2'

const base2Fast = createBase2('fast')
const definition = {
  ...base2Fast,
  id: 'base2-fast-thinker',
  displayName: 'Buffy the Fast Thinker Orchestrator',
  spawnableAgents: [...(base2Fast.spawnableAgents ?? []), 'thinker'],

  instructionsPrompt: `${base2Fast.instructionsPrompt}

## Use the thinker agent

Use the spawn_agents tool to spawn a thinker agent at any point to help you solve a complex problem or plan your solution.`,
}
export default definition
