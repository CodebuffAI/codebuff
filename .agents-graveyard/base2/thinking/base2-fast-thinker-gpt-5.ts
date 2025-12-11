import { createBase2 } from '../base2'

const base2Fast = createBase2('fast')
const definition = {
  ...base2Fast,
  id: 'base2-fast-thinker-gpt-5',
  displayName: 'Buffy the Fast Thinking GPT-5 Orchestrator',
  spawnableAgents: [...(base2Fast.spawnableAgents ?? []), 'thinker-gpt-5'],

  instructionsPrompt: `${base2Fast.instructionsPrompt}

## Use the thinker agent

Use the spawn_agents tool to spawn a thinker-gpt-5 agent at any point to help you solve a complex problem or plan your solution.`,
}
export default definition
