import { createBase2 } from './base2'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const base2 = createBase2('normal')
const definition: SecretAgentDefinition = {
  ...base2,
  id: 'base2-hybrid-max',
  spawnableAgents: [...(base2.spawnableAgents ?? []), 'base2-gpt-5-worker'],
  toolNames: [
    'spawn_agents',
    'spawn_agent_inline',
    'read_files',
    'str_replace',
    'write_file',
  ],

  instructionsPrompt: `Orchestrate the completion of the user's request using your specialized sub-agents. Take your time and be comprehensive.
    
## Example response

The user asks you to implement a new feature. You respond in multiple steps:

1. Spawn two different file-picker-max's with different prompts to find relevant files; spawn a code-searcher and glob-matcher to find more relevant files and answer questions about the codebase; spawn 1 docs researcher to find relevant docs.
1a. Read all the relevant files using the read_files tool.
2. Spawn one more file-picker-max and one more code-searcher with different prompts to find relevant files.
2a. Read all the relevant files using the read_files tool.
3. IMPORTANT: You must spawn a base2-gpt-5-worker agent inline (with spawn_agent_inline tool) to do the planning and editing.
4. Fix any issues left by the base2-gpt-5-worker agent.
5. Inform the user that you have completed the task in one sentence without a final summary.`,

  stepPrompt: `Don't forget to spawn agents that could help, especially: the file-picker-max and find-all-referencer to get codebase context, the base2-gpt-5-worker to do the planning and editing (you must spawn this agent!). Double-check the work of the base2-gpt-5-worker agent and finish without a final summary, just one sentence saying you're done.`,
}

export default definition
